// supabase/functions/validate-ruc/index.ts
//
// v2.26.2 — Edge Function para validar RUC vía Decolecta.
//
// ⚠ IMPORTANTE — deploy con verify_jwt: false
// Al deployar esta función, el flag `verify_jwt` DEBE ser false. La auth
// la hace esta función internamente con createClient + getUser(jwt),
// igual que hace refresh-exchange-rate. Si deployas con verify_jwt:true
// el gateway de Supabase rechaza los requests con 401 antes de que
// este código corra (aunque el JWT sea válido). Patrón confirmado con
// invocaciones reales.
//
// Comando correcto:
//   supabase functions deploy validate-ruc --no-verify-jwt
//
// Flujo:
//   1. Valida que el request traiga header Authorization Bearer (validación manual).
//   2. Valida formato del RUC (11 dígitos, arranca con 10/15/17/20).
//   3. Lee el token de organization_settings.peruapi_key + el provider.
//   4. Llama al endpoint /v1/sunat/ruc/full de Decolecta.
//   5. Parsea la respuesta y devuelve solo los campos que el frontend necesita.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400, detail?: string) {
  console.error(`[validate-ruc] ${status}: ${message}${detail ? ' — ' + detail : ''}`);
  return jsonResponse({ ok: false, error: message, detail }, status);
}

function validateRucFormat(ruc: string): string | null {
  const cleaned = ruc.replace(/\s/g, "");
  if (!/^\d{11}$/.test(cleaned)) return "El RUC debe tener exactamente 11 dígitos.";
  if (!/^(10|20|15|17)/.test(cleaned)) return "El RUC debe iniciar con 10, 15, 17 o 20.";
  return null;
}

Deno.serve(async (req: Request) => {
  console.log(`[validate-ruc] incoming ${req.method}`);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Método no permitido.", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("Edge function mal configurada: faltan env vars.", 500);
  }

  try {
    // ─── 1) Auth manual ─────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("No autenticado. Falta header Authorization Bearer.", 401);
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return errorResponse(
        "Token de sesión inválido.", 401,
        userErr?.message || "user is null"
      );
    }
    console.log(`[validate-ruc] auth OK user=${userData.user.email}`);

    // ─── 2) Parse body ──────────────────────────────────────────────
    let body: { ruc?: string };
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse("Body inválido. Envía JSON con { ruc }.", 400, String(e));
    }
    const ruc = (body.ruc || "").trim();
    if (!ruc) return errorResponse("Falta el campo 'ruc'.", 400);
    const formatError = validateRucFormat(ruc);
    if (formatError) return errorResponse(formatError, 400);

    // ─── 3) Leer token Decolecta ────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: org, error: orgErr } = await admin
      .from("organization_settings")
      .select("peruapi_key, exchange_rate_api_provider")
      .limit(1)
      .maybeSingle();

    if (orgErr) return errorResponse("Error leyendo configuración.", 500, orgErr.message);
    if (!org?.peruapi_key) {
      return errorResponse(
        "API key de Decolecta no configurada. Ve a Ajustes → Integraciones y guarda el token.", 412
      );
    }
    const provider = org.exchange_rate_api_provider || "decolecta";
    if (provider !== "decolecta") {
      return errorResponse(
        `Validación RUC requiere provider 'decolecta'. Actual: '${provider}'.`, 412
      );
    }
    console.log(`[validate-ruc] token OK (${org.peruapi_key.length} chars), provider=${provider}`);

    // ─── 4) Llamar a Decolecta ──────────────────────────────────────
    const decolectaUrl = `https://api.decolecta.com/v1/sunat/ruc/full?numero=${ruc}`;
    console.log(`[validate-ruc] fetching ${decolectaUrl}`);

    let decolectaResp: Response;
    try {
      decolectaResp = await fetch(decolectaUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${org.peruapi_key}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse("No se pudo contactar a Decolecta.", 503, msg);
    }
    console.log(`[validate-ruc] decolecta status=${decolectaResp.status}`);

    const bodyText = await decolectaResp.text();

    if (decolectaResp.status === 401 || decolectaResp.status === 403) {
      return errorResponse(
        "Token de Decolecta inválido o expirado. Regenéralo y actualízalo en Ajustes → Integraciones.",
        401, bodyText.slice(0, 200)
      );
    }
    if (decolectaResp.status === 404) {
      return errorResponse(`El RUC ${ruc} no existe en SUNAT.`, 404);
    }
    if (decolectaResp.status === 429) {
      return errorResponse("Cuota mensual de Decolecta agotada.", 429);
    }
    if (!decolectaResp.ok) {
      return errorResponse(
        `Decolecta respondió con error ${decolectaResp.status}.`, 502, bodyText.slice(0, 200)
      );
    }

    // ─── 5) Parsear y devolver ──────────────────────────────────────
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return errorResponse("Respuesta de Decolecta no es JSON válido.", 502, bodyText.slice(0, 200));
    }

    const direccion =
      data.direccion_completa ||
      data.direccion ||
      [data.distrito, data.provincia, data.departamento].filter(Boolean).join(", ") ||
      "";

    console.log(`[validate-ruc] OK ruc=${ruc} razon=${data.razon_social}`);

    return jsonResponse({
      ok: true,
      ruc,
      razon_social: data.razon_social || "",
      nombre_comercial: data.nombre_comercial || "",
      direccion,
      estado: data.estado || "",
      condicion: data.condicion || "",
      tipo: data.tipo || "",
      raw: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : '';
    console.error("[validate-ruc] UNCAUGHT:", msg, stack);
    return errorResponse("Error interno: " + msg, 500);
  }
});

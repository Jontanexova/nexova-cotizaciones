// supabase/functions/validate-ruc/index.ts
//
// v2.26 — Edge Function para validar RUC vía Decolecta.
//
// Patrón: espejo exacto de `refresh-exchange-rate` (la que ya tienes desplegada).
// Vive en el backend para que el API key de Decolecta (guardado en
// organization_settings.peruapi_key) nunca salga a un browser.
//
// Flujo:
//   1. Valida que el request venga de un usuario autenticado (JWT de Supabase).
//   2. Valida formato del RUC (11 dígitos, arranca con 10 o 20).
//   3. Lee el token de organization_settings.peruapi_key + el provider.
//   4. Llama al endpoint /v1/sunat/ruc/full de Decolecta.
//   5. Parsea la respuesta y devuelve solo los campos que el frontend necesita.
//
// Deploy (desde la raíz del proyecto, con supabase CLI autenticado):
//   supabase functions deploy validate-ruc
//
// Invoke (desde el frontend):
//   const { data, error } = await supabase.functions.invoke('validate-ruc', {
//     body: { ruc: '20XXXXXXXXX' }
//   });
//   if (data?.ok) { console.log(data.razon_social, data.direccion); }

// @ts-expect-error — Deno runtime (Supabase Edge Functions). Al deployar, Deno
// resuelve este import desde npm: en local tsc puede quejarse.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DecolectaRucResponse {
  razon_social?: string;
  nombre_comercial?: string;
  tipo?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  direccion_completa?: string;
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  numero_documento?: string;
  actividad_economica?: string;
  [key: string]: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400, detail?: string): Response {
  return jsonResponse({ ok: false, error: message, detail }, status);
}

function validateRucFormat(ruc: string): string | null {
  const cleaned = ruc.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return 'El RUC debe tener exactamente 11 dígitos.';
  }
  if (!/^(10|20|15|17)/.test(cleaned)) {
    return 'El RUC debe iniciar con 10, 15, 17 o 20 (formato SUNAT).';
  }
  return null;
}

// @ts-expect-error — Deno.serve global, inyectado en runtime Supabase.
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Método no permitido. Usa POST.', 405);
  }

  // ─── 1) Auth check ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('No autenticado.', 401);
  }

  // @ts-expect-error — Deno.env
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error — Deno.env
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return errorResponse('Edge function mal configurada: faltan env vars.', 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validar que el JWT sea de un usuario real (no anónimo)
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userErr || !user) {
    return errorResponse('Token de sesión inválido o expirado.', 401);
  }

  // ─── 2) Validar input ─────────────────────────────────────────────
  let body: { ruc?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Body inválido. Envía JSON con { "ruc": "..." }.', 400);
  }

  const ruc = (body.ruc || '').trim();
  if (!ruc) {
    return errorResponse('Falta el campo "ruc" en el body.', 400);
  }

  const formatError = validateRucFormat(ruc);
  if (formatError) {
    return errorResponse(formatError, 400);
  }

  // ─── 3) Leer token de Decolecta desde organization_settings ───────
  const { data: org, error: orgErr } = await supabase
    .from('organization_settings')
    .select('peruapi_key, exchange_rate_api_provider')
    .limit(1)
    .maybeSingle();

  if (orgErr) {
    return errorResponse(
      'Error leyendo configuración.',
      500,
      orgErr.message,
    );
  }

  if (!org?.peruapi_key) {
    return errorResponse(
      'API key de Decolecta no configurada. Ve a Ajustes → Integraciones y guarda el token.',
      412,
    );
  }

  // Nota: el mismo token de Decolecta cubre TC + RUC. Si el provider
  // configurado es 'peruapi' (otro proveedor), usamos el token como
  // genérico — Decolecta usa su propio dominio api.decolecta.com.
  const provider = org.exchange_rate_api_provider || 'decolecta';
  if (provider !== 'decolecta') {
    return errorResponse(
      `Validación RUC requiere provider 'decolecta'. Provider actual: '${provider}'.`,
      412,
    );
  }

  // ─── 4) Llamar a Decolecta ────────────────────────────────────────
  const decolectaUrl = `https://api.decolecta.com/v1/sunat/ruc/full?numero=${ruc}`;

  let decolectaResp: Response;
  try {
    decolectaResp = await fetch(decolectaUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${org.peruapi_key}`,
      },
      // timeout soft: AbortController a 8s para no colgar invocaciones
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(
      'No se pudo contactar a Decolecta. Intenta de nuevo en un momento.',
      503,
      msg,
    );
  }

  // Manejo de errors específicos de Decolecta
  if (decolectaResp.status === 401 || decolectaResp.status === 403) {
    return errorResponse(
      'Token de Decolecta inválido o expirado. Regenéralo en tu panel de Decolecta y actualízalo en Ajustes → Integraciones.',
      401,
    );
  }

  if (decolectaResp.status === 404) {
    return errorResponse(
      `El RUC ${ruc} no existe en SUNAT.`,
      404,
    );
  }

  if (decolectaResp.status === 429) {
    return errorResponse(
      'Cuota mensual de Decolecta agotada. Considera actualizar tu plan o espera al próximo mes.',
      429,
    );
  }

  if (!decolectaResp.ok) {
    const text = await decolectaResp.text().catch(() => '');
    return errorResponse(
      `Decolecta respondió con error ${decolectaResp.status}.`,
      502,
      text.slice(0, 200),
    );
  }

  // ─── 5) Parsear + devolver solo lo útil ───────────────────────────
  let data: DecolectaRucResponse;
  try {
    data = await decolectaResp.json();
  } catch {
    return errorResponse('Respuesta de Decolecta no es JSON válido.', 502);
  }

  // Algunos campos vienen con distintos nombres según el endpoint —
  // normalizamos acá para que el frontend siempre reciba el mismo shape.
  const direccion =
    data.direccion_completa ||
    data.direccion ||
    [data.distrito, data.provincia, data.departamento].filter(Boolean).join(', ') ||
    '';

  return jsonResponse({
    ok: true,
    ruc,
    razon_social: data.razon_social || '',
    nombre_comercial: data.nombre_comercial || '',
    direccion,
    estado: data.estado || '',
    condicion: data.condicion || '',
    tipo: data.tipo || '',
    // El raw lo devolvemos por si en el futuro queremos más campos.
    // El frontend puede ignorarlo tranquilo.
    raw: data,
  });
});

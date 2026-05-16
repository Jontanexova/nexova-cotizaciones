import { supabase } from './supabase';
import type {
  AllowedDomain,
  BrandingSettings,
  Client,
  Currency,
  ExchangeRate,
  OrganizationSettings,
  Product,
  ProductModule,
  Quote,
  SmtpSettings,
  Vendor,
  VendorRole,
  ProductCategory,
} from './types';
import { generatePublicToken } from './utils';

/**
 * Capa de acceso a datos.
 *
 * Principios:
 *  - Funciones puras: reciben input, retornan output. No gestionan estado.
 *  - Propagan errores tal cual vienen de Supabase — cada llamador decide cómo
 *    presentarlos al usuario (toast, inline, etc).
 *  - Aceptan opcionalmente un AbortSignal para cancelar la request si el
 *    componente se desmonta antes de que la respuesta llegue. Supabase v2
 *    soporta esto nativamente con `.abortSignal(signal)`.
 *  - No usan withTimeout: los timeouts se manejan a nivel de red por Supabase
 *    y el cleanup se hace con AbortController desde los hooks.
 */

type Signal = AbortSignal | undefined;

function applySignal(builder: any, signal: Signal): any {
  return signal && typeof builder?.abortSignal === 'function'
    ? builder.abortSignal(signal)
    : builder;
}

// ═══════════════════════════════════════════════════════════════════════
// Products
// ═══════════════════════════════════════════════════════════════════════

export async function fetchProductsWithModules(signal?: AbortSignal): Promise<Product[]> {
  const [prodRes, modRes] = await Promise.all([
    applySignal(
      supabase.from('products').select('*').eq('active', true).order('name'),
      signal,
    ),
    applySignal(
      supabase
        .from('product_modules')
        .select('*')
        .eq('active', true)
        .order('sort_order'),
      signal,
    ),
  ]);

  if (prodRes.error) throw prodRes.error;
  if (modRes.error) throw modRes.error;

  const modsByProd = new Map<string, ProductModule[]>();
  ((modRes.data as ProductModule[]) || []).forEach((m) => {
    const arr = modsByProd.get(m.product_id) || [];
    arr.push(m);
    modsByProd.set(m.product_id, arr);
  });

  return ((prodRes.data as Product[]) || []).map((p) => ({
    ...p,
    modules: modsByProd.get(p.id) || [],
  }));
}

// También una variante que trae TODOS los productos (incluso inactivos) para admin
export async function fetchAllProductsWithModules(signal?: AbortSignal): Promise<Product[]> {
  const [prodRes, modRes] = await Promise.all([
    applySignal(supabase.from('products').select('*').order('name'), signal),
    applySignal(supabase.from('product_modules').select('*').order('sort_order'), signal),
  ]);

  if (prodRes.error) throw prodRes.error;
  if (modRes.error) throw modRes.error;

  const modsByProd = new Map<string, ProductModule[]>();
  ((modRes.data as ProductModule[]) || []).forEach((m) => {
    const arr = modsByProd.get(m.product_id) || [];
    arr.push(m);
    modsByProd.set(m.product_id, arr);
  });

  return ((prodRes.data as Product[]) || []).map((p) => ({
    ...p,
    modules: modsByProd.get(p.id) || [],
  }));
}

export interface ProductInput {
  id: string; // text slug, ej: 'crm-pro', 'web-design'
  name: string;
  category: ProductCategory;
  base_price: number;
  unit?: string | null;
  description?: string | null;
  default_weeks?: number | null;
  recurring_name?: string | null;
  recurring_price?: number | null;
  recurring_unit?: string | null;
  /** v2.18 */
  requires_recurring?: boolean;
  /** v2.18 — precio mensual fallback. */
  recurring_monthly_price?: number;
  /** v2.28 — moneda nativa del producto (PEN o USD). */
  currency?: Currency;
  active?: boolean;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(input as any)
    .select()
    .single();
  if (error) throw error;
  return { ...(data as Product), modules: [] };
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product> {
  // No permitimos cambiar el id por consistencia referencial
  const { id: _ignore, ...safePatch } = patch;
  const { data, error } = await supabase
    .from('products')
    .update(safePatch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export interface ProductModuleInput {
  id: string; // text slug
  product_id: string;
  name: string;
  price: number;
  sort_order?: number;
  /** v2.18 — precio mensual de renovación. */
  recurring_monthly_price?: number;
  active?: boolean;
}

export async function createProductModule(input: ProductModuleInput): Promise<ProductModule> {
  const { data, error } = await supabase
    .from('product_modules')
    .insert(input as any)
    .select()
    .single();
  if (error) throw error;
  return data as ProductModule;
}

export async function updateProductModule(
  id: string,
  patch: Partial<ProductModuleInput>,
): Promise<ProductModule> {
  const { id: _ignore, ...safePatch } = patch;
  const { data, error } = await supabase
    .from('product_modules')
    .update(safePatch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductModule;
}

export async function deleteProductModule(id: string): Promise<void> {
  const { error } = await supabase.from('product_modules').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════
// Vendors
// ═══════════════════════════════════════════════════════════════════════

export async function fetchVendors(signal?: AbortSignal): Promise<Vendor[]> {
  const { data, error } = await applySignal(
    supabase.from('vendors').select('*').order('name'),
    signal,
  );
  if (error) throw error;
  return (data || []) as Vendor[];
}

// ═══════════════════════════════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════════════════════════════

export async function fetchClients(signal?: AbortSignal): Promise<Client[]> {
  const { data, error } = await applySignal(
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    signal,
  );
  if (error) throw error;
  return (data || []) as Client[];
}

export async function createClient(c: {
  company: string;
  contact?: string;
  contact_role?: string;
  email?: string;
  phone?: string;
  industry?: string;
  size?: 'pequeña' | 'mediana' | 'grande';
  ruc?: string;
  address?: string;
  owner_vendor_id?: string;
}): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      company: c.company,
      contact: c.contact || null,
      contact_role: c.contact_role || null,
      email: c.email || null,
      phone: c.phone || null,
      industry: c.industry || null,
      size: c.size || null,
      ruc: c.ruc || null,
      address: c.address || null,
      owner_vendor_id: c.owner_vendor_id || null,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

/**
 * v2.26: busca un cliente por RUC. Devuelve null si no existe.
 * Se usa para:
 *   - Antes de crear: detectar duplicados y avisar al vendedor.
 *   - Después de validar RUC en Decolecta: ver si ya existe en la BD
 *     para ofrecer "usar cliente existente" en lugar de crear uno nuevo.
 */
export async function fetchClientByRuc(ruc: string): Promise<Client | null> {
  const cleaned = (ruc || '').trim();
  if (!cleaned) return null;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('ruc', cleaned)
    .maybeSingle();
  if (error) throw error;
  return (data as Client) || null;
}

/**
 * v2.26: actualiza un cliente existente. Usado desde la sección Clientes.
 * Los vendedores pueden actualizar cualquier cliente (directorio compartido).
 */
export async function updateClient(
  id: string,
  patch: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(patch as any)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'No se pudo actualizar. Revisa tus permisos o refresca la sesión.',
    );
  }
  return data as Client;
}

/**
 * v2.26: elimina un cliente. Solo funciona para super_admin (RLS).
 * Importante: si el cliente tiene cotizaciones asociadas, la FK las
 * cascadea o bloquea según el schema. Si bloquea, el error viene como
 * "update or delete on table violates foreign key constraint" — el
 * caller debe mostrarlo friendly.
 */
export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

export interface ClientWithStats extends Client {
  /** Fecha ISO de la última cotización creada para este cliente, o null si no hay. */
  last_quote_at: string | null;
  /** Conteo de cotizaciones. */
  quote_count: number;
}

/**
 * v2.26: devuelve todos los clientes con stats agregadas (última cotización,
 * count de cotizaciones). Usado por la tabla de la sección Clientes.
 *
 * Hace dos queries (clients + quotes agregados por client_id) y mergea en JS
 * porque la v2 del postgrest embebido de Supabase no soporta bien agregados
 * al lado embebido con orden.
 */
export async function fetchClientsWithStats(
  signal?: AbortSignal,
): Promise<ClientWithStats[]> {
  const [clientsRes, quotesRes] = await Promise.all([
    applySignal(
      supabase.from('clients').select('*').order('company', { ascending: true }),
      signal,
    ),
    applySignal(
      supabase.from('quotes').select('client_id, created_at'),
      signal,
    ),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (quotesRes.error) throw quotesRes.error;

  const byClient = new Map<string, { last: string; count: number }>();
  for (const q of (quotesRes.data || []) as Array<{
    client_id: string;
    created_at: string;
  }>) {
    const prev = byClient.get(q.client_id);
    if (!prev) {
      byClient.set(q.client_id, { last: q.created_at, count: 1 });
    } else {
      byClient.set(q.client_id, {
        last: q.created_at > prev.last ? q.created_at : prev.last,
        count: prev.count + 1,
      });
    }
  }

  return ((clientsRes.data || []) as Client[]).map((c) => {
    const stats = byClient.get(c.id);
    return {
      ...c,
      last_quote_at: stats?.last || null,
      quote_count: stats?.count || 0,
    };
  });
}

// ─── v2.26: Validación RUC via Edge Function ──────────────────────────

export interface RucValidationResult {
  ok: true;
  ruc: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  estado: string;
  condicion: string;
  tipo: string;
}

/**
 * v2.26: llama a la Edge Function `validate-ruc` para consultar SUNAT vía
 * Decolecta. El token de Decolecta vive en organization_settings (nunca
 * sale al browser).
 *
 * Incluye cache en memoria a nivel de sesión (scope: tab del navegador)
 * para evitar golpes dobles si el vendedor hace clic en "Validar" varias
 * veces para el mismo RUC. TTL: 5 minutos.
 */
const _rucCache = new Map<string, { at: number; data: RucValidationResult }>();
const _RUC_CACHE_TTL_MS = 5 * 60 * 1000;

export async function validateRucViaEdgeFunction(
  ruc: string,
): Promise<RucValidationResult> {
  const cleaned = (ruc || '').replace(/\s/g, '');

  // Cache hit
  const cached = _rucCache.get(cleaned);
  if (cached && Date.now() - cached.at < _RUC_CACHE_TTL_MS) {
    return cached.data;
  }

  const { data, error } = await supabase.functions.invoke('validate-ruc', {
    body: { ruc: cleaned },
  });

  if (error) {
    // Intentar extraer mensaje friendly del body si existe
    let friendly = error.message || 'Error validando RUC';
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.text === 'function') {
      try {
        const bodyText = await ctx.text();
        if (bodyText) {
          try {
            const body = JSON.parse(bodyText);
            if (body?.error) {
              friendly = body.error;
              if (body.detail && body.detail !== body.error) {
                friendly += ` — ${body.detail}`;
              }
            }
          } catch {
            if (bodyText.length < 500) friendly = bodyText;
          }
        }
      } catch {
        /* ignore */
      }
    }
    throw new Error(friendly);
  }

  if (data?.error) throw new Error(data.error);
  if (!data?.ok) {
    throw new Error('Respuesta inesperada de validate-ruc.');
  }

  const result = data as RucValidationResult;
  _rucCache.set(cleaned, { at: Date.now(), data: result });
  return result;
}

// ─── v2.27: Análisis de requerimientos via Claude (Edge Function) ─────

export interface AiAnalysisInput {
  requirements: string;
  client: {
    company: string;
    contact: string;
    industry: string;
    size: 'pequeña' | 'mediana' | 'grande';
  };
  urgency: 'baja' | 'normal' | 'alta';
  products: Array<{
    id: string;
    name: string;
    modules?: Array<{ id: string; name: string }>;
    requires_recurring?: boolean;
    default_weeks?: number;
  }>;
}

export interface AiAnalysisResult {
  ok: true;
  suggested: Array<{ product_id: string; qty: number; module_ids: string[] }>;
  reasons: string[];
  solution_summary: string;
  scope_summary: string;
  modality_summary: string;
  justification_text: string;
  proposal_text: string;
  suggested_discount: number;
  suggested_delivery_weeks: number;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  /**
   * v2.27.2 — diagnóstico agregado por esta función (no viene de la Edge
   * Function). Permite al llamador saber si el resultado vino del cache y
   * cuánto tardó el request real, sin duplicar timers.
   */
  _cached?: boolean;
  _latencyMs?: number;
}

/**
 * v2.27: llama a la Edge Function `analyze-requirements` para que Claude
 * Haiku 4.5 analice el brief del cliente y devuelva productos sugeridos,
 * módulos, descuento, plazo y los textos narrativos para el PDF proforma.
 *
 * La API key de Anthropic vive en organization_settings (nunca sale al
 * browser). Patrón idéntico a validateRucViaEdgeFunction: propaga el
 * error friendly extraído del body cuando está disponible, y valida
 * `data.ok === true`.
 *
 * El llamador (Wizard) es responsable del fallback a análisis rule-based
 * si esta función lanza un error.
 *
 * v2.27.1 — cache en memoria (scope: tab del navegador) con TTL de 5 min
 * para ahorrar llamados repetidos a Anthropic cuando el vendedor:
 *   - Vuelve a Step 2 y clica "Siguiente" sin modificar el brief.
 *   - Clica "Regenerar texto" dos veces seguidas sin cambiar la selección.
 * La clave del cache es un hash estable del payload completo; esto garantiza
 * que cualquier cambio en requirements, client, urgency o el catálogo de
 * productos (ej. un producto agregado en DB mientras la tab está abierta)
 * dispare un recálculo real. Hits y misses se loguean a la consola.
 */
const _aiCache = new Map<string, { at: number; data: AiAnalysisResult }>();
const _AI_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * JSON.stringify con keys ordenadas recursivamente. Garantiza que dos
 * objetos con las mismas props pero distinto orden den la misma string
 * — necesario para usarlo como cache key estable.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          stableStringify((obj as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}

export async function analyzeRequirementsViaEdgeFunction(
  input: AiAnalysisInput,
): Promise<AiAnalysisResult> {
  // v2.27.1 — cache hit? devolvemos inmediatamente sin pegarle a la Edge Function.
  const cacheKey = stableStringify(input);
  const cached = _aiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < _AI_CACHE_TTL_MS) {
    console.debug('[analyzeRequirements] cache HIT, edad:', Math.round((Date.now() - cached.at) / 1000), 's');
    // v2.27.2 — marcar como cached para que el llamador lo loguee sin
    // confundirlo con un LLM real.
    return { ...cached.data, _cached: true, _latencyMs: 0 };
  }

  // v2.27.2 — medir latencia real del llamado a la Edge Function.
  const llmStart = Date.now();
  const { data, error } = await supabase.functions.invoke('analyze-requirements', {
    body: input,
  });
  const latencyMs = Date.now() - llmStart;

  if (error) {
    let friendly = error.message || 'Error analizando requerimientos';
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.text === 'function') {
      try {
        const bodyText = await ctx.text();
        if (bodyText) {
          try {
            const body = JSON.parse(bodyText);
            if (body?.error) {
              friendly = body.error;
              if (body.detail && body.detail !== body.error) {
                friendly += ` — ${body.detail}`;
              }
            }
          } catch {
            if (bodyText.length < 500) friendly = bodyText;
          }
        }
      } catch {
        /* ignore */
      }
    }
    throw new Error(friendly);
  }

  if (data?.error) throw new Error(data.error);
  if (!data?.ok) {
    throw new Error('Respuesta inesperada de analyze-requirements.');
  }

  const result = data as AiAnalysisResult;
  // v2.27.1 — guardar en cache para los próximos 5 minutos (sin _cached/_latencyMs,
  // que se setean por retorno para no contaminar el cache).
  _aiCache.set(cacheKey, { at: Date.now(), data: result });
  console.debug('[analyzeRequirements] cache MISS, latency:', latencyMs, 'ms, cacheado');
  return { ...result, _cached: false, _latencyMs: latencyMs };
}

// ─── v2.27.2: log de métricas para LLM vs rule-based ──────────────────

export interface AiAnalysisLog {
  vendor_id: string | null;
  mode: 'llm' | 'rules';
  cached: boolean;
  regenerate_only: boolean;
  latency_ms: number | null;
  error_message: string | null;
  fallback_reason: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  suggested_count: number | null;
}

/**
 * v2.27.2 — log append-only de cada análisis IA del Wizard. Fire-and-forget:
 * nunca throw, nunca bloquea el flujo del vendedor. Si la tabla no existe
 * o si RLS rechaza el insert, simplemente se queda el warning en consola.
 *
 * La tabla `ai_analyses` se crea vía `migrations/v2_27_2_ai_analyses.sql`.
 */
export async function logAiAnalysis(row: AiAnalysisLog): Promise<void> {
  try {
    const { error } = await supabase.from('ai_analyses').insert(row);
    if (error) {
      console.warn('[logAiAnalysis] insert failed (non-fatal):', error.message);
    }
  } catch (e: any) {
    console.warn('[logAiAnalysis] unexpected (non-fatal):', e?.message);
  }
}

const QUOTE_SELECT = `
  *,
  client:clients(*),
  vendor:vendors(*),
  items:quote_items(
    id, quote_id, product_id, qty, sort_order,
    recurring_billing_cycle, recurring_gift_months,
    modules:quote_item_modules(module_id, recurring_billing_cycle, recurring_gift_months)
  )
`;

function mapQuote(q: any): Quote {
  return {
    ...q,
    items: (q.items || []).map((it: any) => ({
      id: it.id,
      quote_id: it.quote_id,
      product_id: it.product_id,
      qty: it.qty,
      sort_order: it.sort_order,
      recurring_billing_cycle: it.recurring_billing_cycle ?? null,
      recurring_gift_months: it.recurring_gift_months ?? 0,
      modules: (it.modules || []).map((m: any) => ({
        module_id: m.module_id,
        recurring_billing_cycle: m.recurring_billing_cycle ?? null,
        recurring_gift_months: m.recurring_gift_months ?? 0,
      })),
    })),
  } as Quote;
}

export async function fetchQuotes(
  signal?: AbortSignal,
  options?: { includeArchived?: boolean },
): Promise<Quote[]> {
  let query = supabase.from('quotes').select(QUOTE_SELECT).order('created_at', { ascending: false });
  // Por defecto, las archivadas se excluyen (no cuentan en Dashboard/Reports/Cotizaciones).
  if (!options?.includeArchived) {
    query = query.eq('archived', false);
  }
  const { data, error } = await applySignal(query, signal);
  if (error) throw error;
  return ((data as any[]) || []).map(mapQuote);
}

export async function fetchQuoteById(id: string, signal?: AbortSignal): Promise<Quote | null> {
  const { data, error } = await applySignal(
    supabase.from('quotes').select(QUOTE_SELECT).eq('id', id).maybeSingle(),
    signal,
  );
  if (error) throw error;
  return data ? mapQuote(data) : null;
}

export async function fetchQuoteByPublicToken(
  token: string,
  signal?: AbortSignal,
): Promise<Quote | null> {
  const { data, error } = await applySignal(
    supabase.from('quotes').select(QUOTE_SELECT).eq('public_token', token).maybeSingle(),
    signal,
  );
  if (error) throw error;
  return data ? mapQuote(data) : null;
}

export interface CreateQuoteInput {
  client: {
    id?: string;
    company: string;
    contact?: string;
    /** v2.25: cargo del contacto (ej. "Gerente General"). */
    contact_role?: string;
    email?: string;
    phone?: string;
    industry?: string;
    size?: 'pequeña' | 'mediana' | 'grande';
    ruc?: string;
    /** v2.25: dirección del cliente. */
    address?: string;
  };
  vendor_id: string;
  /**
   * v2.18: items con info de ciclo de facturación recurrente.
   * - modules: cada entrada trae module_id + opcionalmente cycle + gift_months.
   * - recurring_billing_cycle / recurring_gift_months a nivel item se usan como
   *   fallback cuando el producto tiene requires_recurring pero ningún módulo
   *   seleccionado aporta recurring.
   */
  items: {
    product_id: string;
    qty: number;
    modules: {
      module_id: string;
      recurring_billing_cycle?: 'monthly' | 'annual' | null;
      recurring_gift_months?: number;
    }[];
    recurring_billing_cycle?: 'monthly' | 'annual' | null;
    recurring_gift_months?: number;
  }[];
  discount: number;
  valid_days: number;
  delivery_weeks: number;
  payment_terms: string;
  proposal_text: string;
  requirements?: string;
  /** v2.25: narrativa 2 párrafos generada por IA. */
  justification_text?: string;
  /** v2.25: chips generados por IA. */
  solution_summary?: string;
  scope_summary?: string;
  modality_summary?: string;
  /** v2.25: override de términos (una línea por nota). NULL = usa default global. */
  terms?: string | null;
  /** v2.28: moneda en la que se emite la cotización. Default 'PEN'. */
  currency?: Currency;
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  // 1. Asegurar cliente
  let clientId = input.client.id;
  if (!clientId) {
    const newClient = await createClient({
      ...input.client,
      owner_vendor_id: input.vendor_id,
    });
    clientId = newClient.id;
  }

  // 2. Obtener código secuencial
  const { data: code, error: codeErr } = await supabase.rpc('next_quote_code');
  if (codeErr) throw codeErr;

  // 3. Calcular validUntil
  const validUntil = new Date(Date.now() + input.valid_days * 86400000)
    .toISOString()
    .slice(0, 10);

  // 3.5. Obtener TC vigente para snapshot (null si no hay TC configurado)
  let exchangeRate: number | null = null;
  try {
    exchangeRate = await fetchCurrentExchangeRate();
  } catch {
    exchangeRate = null;
  }

  // 4. Insertar quote
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .insert({
      code,
      client_id: clientId,
      vendor_id: input.vendor_id,
      status: 'borrador',
      discount: input.discount,
      valid_days: input.valid_days,
      valid_until: validUntil,
      delivery_weeks: input.delivery_weeks,
      payment_terms: input.payment_terms,
      proposal_text: input.proposal_text,
      requirements: input.requirements || null,
      justification_text: input.justification_text || null,
      solution_summary: input.solution_summary || null,
      scope_summary: input.scope_summary || null,
      modality_summary: input.modality_summary || null,
      terms: input.terms ?? null,
      currency: input.currency || 'PEN',
      exchange_rate: exchangeRate,
      views: 0,
    } as any)
    .select()
    .single();
  if (quoteErr) throw quoteErr;

  // 5. Insertar items con recurring fields (v2.18)
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const { data: itemData, error: itemErr } = await supabase
      .from('quote_items')
      .insert({
        quote_id: (quote as any).id,
        product_id: it.product_id,
        qty: it.qty,
        sort_order: i,
        recurring_billing_cycle: it.recurring_billing_cycle ?? null,
        recurring_gift_months: it.recurring_gift_months ?? 0,
      } as any)
      .select()
      .single();
    if (itemErr) throw itemErr;

    if (it.modules.length > 0) {
      const rows = it.modules.map((sm) => ({
        quote_item_id: (itemData as any).id,
        module_id: sm.module_id,
        recurring_billing_cycle: sm.recurring_billing_cycle ?? null,
        recurring_gift_months: sm.recurring_gift_months ?? 0,
      }));
      const { error: modErr } = await supabase.from('quote_item_modules').insert(rows as any);
      if (modErr) throw modErr;
    }
  }

  // 6. Refetch completo
  const full = await fetchQuoteById((quote as any).id);
  if (!full) throw new Error('No se pudo recuperar la cotización creada');
  return full;
}

/**
 * Actualiza una cotización existente reescribiendo sus items.
 *
 * Campos NO tocados (protegidos contra sobrescritura accidental):
 *   status, code, vendor_id, public_token, views, archived*, sent_at, accepted_at.
 *
 * Items: se borran todos los existentes y se re-insertan desde input.
 * El cascade sobre quote_item_modules limpia los módulos viejos.
 *
 * Cliente: si trae id se reusa sin modificar (mismo patrón que createQuote);
 * si no, se crea uno nuevo ligado al vendor actual.
 *
 * Las policies RLS del backend permiten:
 *  - vendor: UPDATE/DELETE/INSERT sobre sus propios quotes si status != 'aceptada'
 *    AND archived = false.
 *  - super_admin: todo via is_admin().
 */
export async function updateQuote(
  quoteId: string,
  input: CreateQuoteInput,
): Promise<Quote> {
  // 1. Asegurar cliente (reusa si trae id, crea si no)
  let clientId = input.client.id;
  if (!clientId) {
    const newClient = await createClient({
      ...input.client,
      owner_vendor_id: input.vendor_id,
    });
    clientId = newClient.id;
  }

  // 2. Recalcular validUntil a partir de la fecha de HOY + valid_days.
  //    (No reusamos la fecha original — si el usuario edita, la vigencia se renueva.)
  const validUntil = new Date(Date.now() + input.valid_days * 86400000)
    .toISOString()
    .slice(0, 10);

  // 3. UPDATE quote — solo campos editables.
  const { error: quoteErr } = await supabase
    .from('quotes')
    .update({
      client_id: clientId,
      discount: input.discount,
      valid_days: input.valid_days,
      valid_until: validUntil,
      delivery_weeks: input.delivery_weeks,
      payment_terms: input.payment_terms,
      proposal_text: input.proposal_text,
      requirements: input.requirements || null,
      justification_text: input.justification_text || null,
      solution_summary: input.solution_summary || null,
      scope_summary: input.scope_summary || null,
      modality_summary: input.modality_summary || null,
      terms: input.terms ?? null,
      currency: input.currency || 'PEN',
    } as any)
    .eq('id', quoteId);
  if (quoteErr) throw quoteErr;

  // 4. DELETE items existentes (cascade limpia quote_item_modules).
  const { error: delErr } = await supabase
    .from('quote_items')
    .delete()
    .eq('quote_id', quoteId);
  if (delErr) throw delErr;

  // 5. INSERT items nuevos con sus módulos (mismo patrón que createQuote).
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const { data: itemData, error: itemErr } = await supabase
      .from('quote_items')
      .insert({
        quote_id: quoteId,
        product_id: it.product_id,
        qty: it.qty,
        sort_order: i,
        recurring_billing_cycle: it.recurring_billing_cycle ?? null,
        recurring_gift_months: it.recurring_gift_months ?? 0,
      } as any)
      .select()
      .single();
    if (itemErr) throw itemErr;

    if (it.modules.length > 0) {
      const rows = it.modules.map((sm) => ({
        quote_item_id: (itemData as any).id,
        module_id: sm.module_id,
        recurring_billing_cycle: sm.recurring_billing_cycle ?? null,
        recurring_gift_months: sm.recurring_gift_months ?? 0,
      }));
      const { error: modErr } = await supabase
        .from('quote_item_modules')
        .insert(rows as any);
      if (modErr) throw modErr;
    }
  }

  // 6. Refetch completo con joins.
  const full = await fetchQuoteById(quoteId);
  if (!full) throw new Error('No se pudo recuperar la cotización actualizada');
  return full;
}

export async function updateQuoteStatus(
  quoteId: string,
  status: Quote['status'],
): Promise<void> {
  const patch: any = { status };
  if (status === 'enviada') patch.sent_at = new Date().toISOString();
  if (status === 'aceptada') patch.accepted_at = new Date().toISOString();
  const { error } = await supabase.from('quotes').update(patch).eq('id', quoteId);
  if (error) throw error;
}

/**
 * v2.25: guarda un override de "Notas y condiciones" para una cotización.
 * Si se pasa null, limpia el override y vuelve a heredar el default de
 * organization_settings.default_terms.
 */
export async function updateQuoteTerms(
  quoteId: string,
  terms: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({ terms: terms && terms.trim() ? terms : null } as any)
    .eq('id', quoteId);
  if (error) throw error;
}

export async function publishQuote(quoteId: string): Promise<string> {
  const token = generatePublicToken();
  // Usamos RPC SECURITY DEFINER porque los vendedores ya no tienen UPDATE
  // directo sobre quotes (solo super_admin). La RPC valida ownership internamente.
  const { error } = await supabase.rpc('vendor_publish_quote', {
    p_quote_id: quoteId,
    p_public_token: token,
  });
  if (error) throw error;
  return token;
}

export async function incrementQuoteView(token: string): Promise<void> {
  // Fire-and-forget desde el link público: no bloqueamos ni propagamos errores.
  try {
    await supabase.rpc('increment_quote_view', { p_token: token });
  } catch (e) {
    console.error('increment_quote_view failed', e);
  }
}

export async function deleteQuote(quoteId: string): Promise<void> {
  // Usamos RPC para que las policies bloqueen a los vendors.
  // Solo super_admin puede ejecutarla (validación en el backend).
  const { error } = await supabase.rpc('admin_delete_quote', { p_quote_id: quoteId });
  if (error) throw error;
}

/**
 * Archiva una cotización (soft delete). Solo super_admin.
 * La cotización queda invisible en listas y no cuenta en métricas.
 */
export async function archiveQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_archive_quote', { p_quote_id: quoteId });
  if (error) throw error;
}

/**
 * Desarchiva una cotización previamente archivada. Solo super_admin.
 */
export async function unarchiveQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_unarchive_quote', { p_quote_id: quoteId });
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════
// Organization settings
// ═══════════════════════════════════════════════════════════════════════

export async function fetchOrgSettings(
  signal?: AbortSignal,
): Promise<OrganizationSettings | null> {
  const { data, error } = await applySignal(
    supabase.from('organization_settings').select('*').limit(1).maybeSingle(),
    signal,
  );
  if (error) throw error;
  return (data as OrganizationSettings) || null;
}

export async function updateOrgSettings(
  id: string,
  patch: Partial<OrganizationSettings>,
): Promise<OrganizationSettings> {
  const { data, error } = await supabase
    .from('organization_settings')
    .update(patch as any)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('No se pudo guardar. Revisa tus permisos o refresca la sesión.');
  }
  return data as OrganizationSettings;
}

/**
 * Actualiza solo el tipo de cambio y registra quién y cuándo lo modificó.
 */
export async function updateExchangeRate(
  orgId: string,
  rate: number,
  userId: string,
): Promise<OrganizationSettings> {
  const { data, error } = await supabase
    .from('organization_settings')
    .update({
      exchange_rate: rate,
      exchange_rate_updated_at: new Date().toISOString(),
      exchange_rate_updated_by: userId,
      exchange_rate_source: 'manual',
    } as any)
    .eq('id', orgId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No se pudo actualizar el tipo de cambio.');
  return data as OrganizationSettings;
}

/**
 * Guarda el API key de peruapi.com y la preferencia de auto-sync.
 */
export async function updatePeruApiConfig(
  orgId: string,
  patch: {
    peruapi_key?: string | null;
    exchange_rate_auto_sync?: boolean;
    /** v2.20 */
    exchange_rate_api_provider?: string | null;
    exchange_rate_api_url?: string | null;
    exchange_rate_api_auth_header?: string | null;
    exchange_rate_api_auth_scheme?: string | null;
    exchange_rate_api_date_param?: string | null;
  },
): Promise<OrganizationSettings> {
  const { data, error } = await supabase
    .from('organization_settings')
    .update(patch as any)
    .eq('id', orgId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No se pudo guardar la configuración.');
  return data as OrganizationSettings;
}

/**
 * Invoca la Edge Function refresh-exchange-rate para traer el TC
 * actual desde peruapi.com y actualizarlo en la DB.
 */
export async function refreshExchangeRateFromApi(): Promise<{
  rate: number;
  compra: number;
  venta: number;
  fecha: string;
}> {
  const { data, error } = await supabase.functions.invoke('refresh-exchange-rate', {
    body: {},
  });

  if (error) {
    let friendly = error.message || 'Error invocando refresh-exchange-rate';
    const ctx: any = (error as any).context;
    if (ctx) {
      try {
        let bodyText: string | null = null;
        if (typeof ctx.text === 'function') bodyText = await ctx.text();
        if (bodyText) {
          try {
            const body = JSON.parse(bodyText);
            if (body?.error) {
              friendly = body.error;
              if (body.detail && body.detail !== body.error) {
                friendly += ` — ${body.detail}`;
              }
            }
          } catch {
            if (bodyText.length < 500) friendly = bodyText;
          }
        }
      } catch {
        /* ignore */
      }
    }
    console.error('[refreshExchangeRateFromApi] fallo:', friendly, error);
    throw new Error(friendly);
  }

  if (data?.error) throw new Error(data.error);
  if (!data?.ok || typeof data?.rate !== 'number') {
    throw new Error('Respuesta inesperada de refresh-exchange-rate.');
  }
  return {
    rate: data.rate,
    compra: data.compra,
    venta: data.venta,
    fecha: data.fecha,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Admin user management (RPC)
// ═══════════════════════════════════════════════════════════════════════

export interface CreateUserResult {
  user_id: string;
  email: string;
  password: string;
  name: string;
  role: VendorRole;
}

export async function adminCreateUser(input: {
  email: string;
  name: string;
  role: VendorRole;
  color?: string;
}): Promise<CreateUserResult> {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_email: input.email,
    p_name: input.name,
    p_role: input.role,
    p_color: input.color || '#0F766E',
  });
  if (error) throw error;
  return data as CreateUserResult;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
  if (error) throw error;
}

export async function adminUpdateUserRole(userId: string, role: VendorRole): Promise<void> {
  const { error } = await supabase.rpc('admin_update_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function adminResetPassword(userId: string): Promise<{ password: string }> {
  const { data, error } = await supabase.rpc('admin_reset_password', { p_user_id: userId });
  if (error) throw error;
  return data as { password: string };
}

// ═══════════════════════════════════════════════════════════════════════
// SMTP settings (solo super_admin)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchSmtpSettings(
  signal?: AbortSignal,
): Promise<SmtpSettings | null> {
  const { data, error } = await applySignal(
    supabase.from('smtp_settings').select('*').limit(1).maybeSingle(),
    signal,
  );
  if (error) throw error;
  return (data as SmtpSettings) || null;
}

export async function updateSmtpSettings(
  id: string,
  patch: Partial<SmtpSettings>,
): Promise<SmtpSettings> {
  const { data, error } = await supabase
    .from('smtp_settings')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SmtpSettings;
}

// ═══════════════════════════════════════════════════════════════════════
// Password management
// ═══════════════════════════════════════════════════════════════════════

// Marca must_change_password=false después que el usuario cambió su clave
export async function markPasswordChanged(): Promise<void> {
  const { error } = await supabase.rpc('mark_password_changed');
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════
// Email — Edge Function send-email
// ═══════════════════════════════════════════════════════════════════════

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  attachments?: {
    filename: string;
    content: string; // base64
    content_type: string;
  }[];
}

/**
 * Invoca la Edge Function `send-email` con la configuración SMTP guardada.
 * Propaga errores explícitos para que el caller decida cómo presentarlos
 * (fallback de mostrar la password, toast, etc).
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: input,
  });

  if (error) {
    // supabase-js devuelve un mensaje genérico ("Edge Function returned a non-2xx status code")
    // pero el body real de la respuesta trae nuestro JSON con { error, detail? }.
    // Lo extraemos para mostrar un mensaje útil al usuario.
    let friendlyMsg = error.message || 'Error invocando send-email';
    const ctx: any = (error as any).context;

    if (ctx) {
      try {
        // Preferimos text() + JSON.parse manual — más robusto que json() si el
        // body fue leído parcialmente por supabase-js.
        let bodyText: string | null = null;
        if (typeof ctx.text === 'function') {
          bodyText = await ctx.text();
        } else if (typeof ctx.json === 'function') {
          const j = await ctx.json();
          bodyText = typeof j === 'string' ? j : JSON.stringify(j);
        }
        if (bodyText) {
          try {
            const body = JSON.parse(bodyText);
            if (body?.error) {
              friendlyMsg = body.error;
              if (body.detail && body.detail !== body.error) {
                friendlyMsg += ` — detalle: ${body.detail}`;
              }
            } else if (bodyText.length < 500) {
              // Si no es JSON válido pero es corto, mostrarlo tal cual
              friendlyMsg = bodyText;
            }
          } catch {
            if (bodyText.length < 500) friendlyMsg = bodyText;
          }
        }
      } catch (readErr) {
        console.warn('[sendEmail] no se pudo leer el body del error:', readErr);
      }
    }

    // Log para debug en consola del navegador
    console.error('[sendEmail] fallo:', friendlyMsg, error);
    throw new Error(friendlyMsg);
  }

  if (data && (data as any).error) {
    throw new Error((data as any).error);
  }
}

// ─── Templates de email ───

function renderBrandedEmail(opts: {
  title: string;
  intro: string;
  details?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  footer?: string;
}): string {
  const details = (opts.details || [])
    .map(
      (d) =>
        `<tr>
           <td style="padding:6px 0;font-size:13px;color:#64748b;width:140px;">${d.label}</td>
           <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${d.value}</td>
         </tr>`,
    )
    .join('');
  const cta = opts.cta
    ? `<div style="margin:24px 0;">
         <a href="${opts.cta.url}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">${opts.cta.label}</a>
       </div>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05);">
    <div style="background:linear-gradient(135deg,#134e4a,#0F766E);color:#fff;padding:24px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;opacity:.8;">NEXOVA</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${opts.title}</div>
    </div>
    <div style="padding:24px 28px;color:#0f172a;font-size:14.5px;line-height:1.6;">
      <p style="margin:0 0 14px;">${opts.intro}</p>
      ${details ? `<table style="width:100%;border-collapse:collapse;margin:14px 0;">${details}</table>` : ''}
      ${cta}
      ${opts.footer ? `<p style="margin:18px 0 0;font-size:12.5px;color:#64748b;">${opts.footer}</p>` : ''}
    </div>
    <div style="padding:14px 28px;background:#f1f5f9;color:#64748b;font-size:11.5px;text-align:center;">
      Este mensaje fue enviado por el sistema de Nexova · no respondas a este correo.
    </div>
  </div>
</body></html>`;
}

export async function sendAdminPasswordResetEmail(
  email: string,
  name: string,
  tempPassword: string,
  loginUrl: string,
): Promise<void> {
  const html = renderBrandedEmail({
    title: 'Tu contraseña fue restablecida',
    intro: `Hola ${name}, un administrador reinició tu contraseña. Úsala para iniciar sesión; se te pedirá crear una nueva al entrar.`,
    details: [
      { label: 'Email', value: email },
      { label: 'Contraseña temporal', value: tempPassword },
    ],
    cta: { label: 'Iniciar sesión', url: loginUrl },
    footer: 'Si no solicitaste este cambio, contacta al Super Admin inmediatamente.',
  });
  const text = `Hola ${name},

Un administrador reinició tu contraseña en Nexova.

Email: ${email}
Contraseña temporal: ${tempPassword}

Inicia sesión en ${loginUrl} — se te pedirá crear una nueva contraseña.

Si no solicitaste este cambio, contacta al Super Admin.`;

  await sendEmail({
    to: email,
    subject: 'Nexova — Tu contraseña fue restablecida',
    html,
    text,
  });
}

export async function sendNewUserWelcomeEmail(
  email: string,
  name: string,
  tempPassword: string,
  loginUrl: string,
): Promise<void> {
  const html = renderBrandedEmail({
    title: '¡Bienvenido a Nexova!',
    intro: `Hola ${name}, se creó tu cuenta en el sistema de cotizaciones Nexova. Usa esta contraseña temporal para tu primer ingreso; se te pedirá crear una propia.`,
    details: [
      { label: 'Email', value: email },
      { label: 'Contraseña temporal', value: tempPassword },
    ],
    cta: { label: 'Iniciar sesión', url: loginUrl },
    footer: 'Esta contraseña es de un solo uso. Al entrar deberás crear tu contraseña personal.',
  });
  const text = `Hola ${name},

Se creó tu cuenta en Nexova.

Email: ${email}
Contraseña temporal: ${tempPassword}

Inicia sesión en ${loginUrl} — se te pedirá crear una nueva contraseña.`;

  await sendEmail({
    to: email,
    subject: 'Nexova — Tu cuenta está lista',
    html,
    text,
  });
}

/**
 * Envía el PDF del prompt generado al email del vendor logueado,
 * para que lo use como input a Claude.
 */
export async function sendQuotePromptEmail(
  vendor: { email: string; name: string },
  quote: { code: string; client?: { company?: string } | null },
  pdfBase64: string,
): Promise<void> {
  const company = quote.client?.company || 'Cliente';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05);">
    <div style="background:linear-gradient(135deg,#134e4a,#0F766E);color:#fff;padding:24px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;opacity:.8;">NEXOVA</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">Prompt listo para Claude</div>
    </div>
    <div style="padding:24px 28px;color:#0f172a;font-size:14.5px;line-height:1.6;">
      <p style="margin:0 0 14px;">Hola ${vendor.name},</p>
      <p style="margin:0 0 14px;">
        Adjunto encontrarás el PDF con el <strong>prompt estructurado</strong> para que Claude
        te ayude a construir el proyecto de <strong>${company}</strong>
        (cotización <strong>${quote.code}</strong>).
      </p>
      <p style="margin:0 0 14px;">El prompt incluye:</p>
      <ul style="margin:0 0 14px;padding-left:20px;color:#334155;">
        <li>Instrucciones de rol (Senior Full-Stack Developer)</li>
        <li>Best practices mandatorias de código, UX y arquitectura</li>
        <li>Requerimientos originales del cliente</li>
        <li>Productos y módulos cotizados</li>
        <li>Criterios de entrega por fases</li>
      </ul>
      <p style="margin:0 0 14px;">
        <strong>Cómo usarlo:</strong> abre el PDF, copia todo el contenido del prompt y pégalo
        en una nueva conversación con Claude. El modelo te devolverá un plan técnico que
        puedes iterar antes de pedir el código.
      </p>
      <p style="margin:18px 0 0;font-size:12.5px;color:#64748b;">
        Este PDF fue generado automáticamente desde el panel de Nexova.
      </p>
    </div>
    <div style="padding:14px 28px;background:#f1f5f9;color:#64748b;font-size:11.5px;text-align:center;">
      Nexova · Panel comercial
    </div>
  </div>
</body></html>`;

  const text = `Hola ${vendor.name},

Adjunto el PDF con el prompt estructurado para construir el proyecto de ${company} (cotización ${quote.code}) usando Claude.

Incluye instrucciones de rol, best practices, requerimientos del cliente y productos cotizados.

Cómo usarlo: abre el PDF, copia el prompt completo, pégalo en Claude y recibirás un plan técnico.

— Nexova`;

  await sendEmail({
    to: vendor.email,
    subject: `Nexova · Prompt para construir ${company} (${quote.code})`,
    html,
    text,
    attachments: [
      {
        filename: `prompt-${quote.code}.pdf`,
        content: pdfBase64,
        content_type: 'application/pdf',
      },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tipo de cambio (exchange_rates)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchCurrentExchangeRate(): Promise<number | null> {
  // v2.28: la UI de Ajustes → TC guarda el TC en organization_settings.exchange_rate
  // (via updateExchangeRate), NO en la tabla exchange_rates. Esta función debe
  // mirar primero esa fuente para que el Wizard de cotización vea lo que el
  // admin acaba de configurar. Solo si está vacío, caemos al historial
  // de exchange_rates por compat.
  const { data: org } = await supabase
    .from('organization_settings')
    .select('exchange_rate')
    .limit(1)
    .maybeSingle();
  if (org?.exchange_rate && Number(org.exchange_rate) > 0) {
    return Number(org.exchange_rate);
  }
  // Fallback: RPC sobre la tabla exchange_rates (historial)
  const { data, error } = await supabase.rpc('get_current_exchange_rate');
  if (error) throw error;
  return data ? Number(data) : null;
}

export async function fetchExchangeRateHistory(limit = 20): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ExchangeRate[]) || [];
}

export async function createExchangeRate(
  rate: number,
  effectiveDate?: string,
  notes?: string,
): Promise<ExchangeRate> {
  if (!rate || rate <= 0) throw new Error('El tipo de cambio debe ser mayor a 0');
  const { data, error } = await supabase
    .from('exchange_rates')
    .insert({
      rate,
      effective_date: effectiveDate || new Date().toISOString().split('T')[0],
      notes: notes || null,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as ExchangeRate;
}

// ═══════════════════════════════════════════════════════════════════════
// v2.21: Dominios permitidos de registro
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normaliza un dominio: lowercase, sin espacios, sin '@' inicial.
 * Ej: ' @Nexova.PE ' → 'nexova.pe'
 */
export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/** Valida si un dominio tiene formato aceptable (ej. 'nexova.pe'). */
export function isValidDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (d.length < 3) return false;
  // Regex simple: al menos un punto, sin espacios, caracteres válidos de dominio
  return /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/.test(d);
}

/**
 * Extrae el dominio de un email (lowercase, sin @).
 * Retorna '' si el email no tiene formato válido.
 */
export function extractEmailDomain(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.substring(at + 1).toLowerCase().trim();
}

export async function fetchAllowedDomains(): Promise<AllowedDomain[]> {
  const { data, error } = await supabase
    .from('allowed_signup_domains')
    .select('*')
    .order('domain', { ascending: true });
  if (error) throw error;
  return (data || []) as AllowedDomain[];
}

export async function addAllowedDomain(domain: string): Promise<AllowedDomain> {
  const normalized = normalizeDomain(domain);
  if (!isValidDomain(normalized)) {
    throw new Error(`"${domain}" no es un dominio válido. Ej: nexova.pe`);
  }
  const { data, error } = await supabase
    .from('allowed_signup_domains')
    .insert({ domain: normalized } as any)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`El dominio "${normalized}" ya está en la lista.`);
    throw error;
  }
  return data as AllowedDomain;
}

export async function removeAllowedDomain(id: string): Promise<void> {
  const { error } = await supabase.from('allowed_signup_domains').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Valida client-side si un email está permitido según los dominios configurados.
 * Si la lista está vacía, retorna true (sin restricción).
 * Útil para mostrar feedback inmediato en el form de crear usuario antes del submit.
 */
export function isEmailDomainAllowed(email: string, allowedDomains: AllowedDomain[]): boolean {
  if (allowedDomains.length === 0) return true; // sin restricción
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((d) => d.domain.toLowerCase() === domain);
}

// ═══════════════════════════════════════════════════════════════════════
// v2.23: Funciones de limpieza (solo super_admin)
// ═══════════════════════════════════════════════════════════════════════

export interface CleanupCounts {
  quotes: number;
  quote_items: number;
  quote_item_modules: number;
  clients: number;
  products: number;
  product_modules: number;
}

export interface CleanupResult {
  quotes_deleted?: number;
  quote_items_deleted?: number;
  quote_item_modules_deleted?: number;
  clients_deleted?: number;
  products_deleted?: number;
  product_modules_deleted?: number;
}

export async function fetchCleanupCounts(): Promise<CleanupCounts> {
  const { data, error } = await supabase.rpc('get_cleanup_counts');
  if (error) throw error;
  return data as CleanupCounts;
}

export async function cleanupQuotes(): Promise<CleanupResult> {
  const { data, error } = await supabase.rpc('cleanup_quotes');
  if (error) throw error;
  return data as CleanupResult;
}

export async function cleanupClients(): Promise<CleanupResult> {
  const { data, error } = await supabase.rpc('cleanup_clients');
  if (error) throw error;
  return data as CleanupResult;
}

export async function cleanupProducts(): Promise<CleanupResult> {
  const { data, error } = await supabase.rpc('cleanup_products');
  if (error) throw error;
  return data as CleanupResult;
}

export async function cleanupAllTransactional(): Promise<CleanupResult> {
  const { data, error } = await supabase.rpc('cleanup_all_transactional');
  if (error) throw error;
  return data as CleanupResult;
}

// ═══════════════════════════════════════════════════════════════════════
// v2.24: Branding (white-label)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchBranding(): Promise<BrandingSettings | null> {
  const { data, error } = await supabase
    .from('branding_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as BrandingSettings | null;
}

export async function updateBranding(
  patch: Partial<Omit<BrandingSettings, 'id' | 'updated_at' | 'updated_by'>>,
): Promise<BrandingSettings> {
  const current = await fetchBranding();
  if (!current) throw new Error('No existe configuración de branding.');
  const { data, error } = await supabase
    .from('branding_settings')
    .update({ ...patch, updated_at: new Date().toISOString() } as any)
    .eq('id', current.id)
    .select()
    .single();
  if (error) throw error;
  return data as BrandingSettings;
}

export async function resetBrandingToDefaults(): Promise<BrandingSettings> {
  const { data, error } = await supabase.rpc('reset_branding_to_defaults');
  if (error) throw error;
  return data as BrandingSettings;
}

/**
 * Sube un archivo al bucket `branding` y retorna la URL pública.
 * slot: 'logo-main' | 'logo-inverse' | 'favicon'
 * Si existía un archivo previo, lo sobrescribe para evitar acumulación de basura.
 */
export async function uploadBrandingAsset(
  file: File,
  slot: 'logo-main' | 'logo-inverse' | 'favicon',
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  // Nombre determinista por slot: reemplaza cada vez
  const filename = `${slot}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(filename, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });
  if (uploadError) throw uploadError;
  // Generar URL pública con cache-busting timestamp
  const { data } = supabase.storage.from('branding').getPublicUrl(filename);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Elimina un asset del bucket. Útil cuando el usuario borra explícitamente un logo.
 * No falla si el archivo no existe.
 */
export async function removeBrandingAsset(slot: 'logo-main' | 'logo-inverse' | 'favicon'): Promise<void> {
  // Intentar borrar todas las extensiones posibles
  const extensions = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico'];
  const paths = extensions.map((e) => `${slot}.${e}`);
  await supabase.storage.from('branding').remove(paths);
}

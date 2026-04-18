import { supabase } from './supabase';
import type {
  Client,
  OrganizationSettings,
  Product,
  ProductModule,
  Quote,
  Vendor,
  VendorRole,
} from './types';
import { generatePublicToken, withTimeout } from './utils';

// ═══════════════════════════════════════════════════════════════════════
// Helper: envuelve cualquier query de Supabase con timeout + error handling
// ═══════════════════════════════════════════════════════════════════════

const QUERY_TIMEOUT_MS = 30000; // 30s: generoso para redes variables

async function q<T>(
  builder: PromiseLike<any>,
  context: string
): Promise<T> {
  const result = await withTimeout(
    builder,
    QUERY_TIMEOUT_MS,
    `Tiempo excedido en "${context}". Verifica tu conexión e inténtalo de nuevo.`
  );
  const { data, error } = result as { data: T; error: any };
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════════════════════════
// Products
// ═══════════════════════════════════════════════════════════════════════

export async function fetchProductsWithModules(): Promise<Product[]> {
  const [prodData, modData] = await Promise.all([
    q<Product[]>(
      supabase.from('products').select('*').eq('active', true).order('name'),
      'fetchProducts'
    ),
    q<ProductModule[]>(
      supabase.from('product_modules').select('*').eq('active', true).order('sort_order'),
      'fetchProductModules'
    ),
  ]);

  const modsByProd = new Map<string, ProductModule[]>();
  (modData || []).forEach((m) => {
    const arr = modsByProd.get(m.product_id) || [];
    arr.push(m);
    modsByProd.set(m.product_id, arr);
  });

  return (prodData || []).map((p) => ({
    ...p,
    modules: modsByProd.get(p.id) || [],
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// Vendors
// ═══════════════════════════════════════════════════════════════════════

export async function fetchVendors(): Promise<Vendor[]> {
  const data = await q<Vendor[]>(
    supabase.from('vendors').select('*').order('name'),
    'fetchVendors'
  );
  return data || [];
}

export async function fetchCurrentVendor(): Promise<Vendor | null> {
  // getSession() NO se envuelve con timeout: Supabase la usa internamente para
  // decidir si hacer refresh del token, y un timeout puede corromper el estado.
  let user: { id: string } | null = null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    user = sess.session?.user || null;
  } catch (e) {
    console.warn('[db] getSession falló:', e);
    return null;
  }
  if (!user) return null;

  const data = await q<Vendor | null>(
    supabase.from('vendors').select('*').eq('id', user.id).maybeSingle(),
    'fetchCurrentVendor'
  );
  return data;
}

// ═══════════════════════════════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════════════════════════════

export async function fetchClients(): Promise<Client[]> {
  const data = await q<Client[]>(
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    'fetchClients'
  );
  return data || [];
}

export async function createClient(c: {
  company: string;
  contact?: string;
  email?: string;
  phone?: string;
  industry?: string;
  size?: 'pequeña' | 'mediana' | 'grande';
  ruc?: string;
  owner_vendor_id?: string;
}): Promise<Client> {
  const data = await q<Client>(
    supabase
      .from('clients')
      .insert({
        company: c.company,
        contact: c.contact || null,
        email: c.email || null,
        phone: c.phone || null,
        industry: c.industry || null,
        size: c.size || 'mediana',
        ruc: c.ruc || null,
        owner_vendor_id: c.owner_vendor_id || null,
      })
      .select()
      .single(),
    'createClient'
  );
  return data;
}

// ═══════════════════════════════════════════════════════════════════════
// Quotes
// ═══════════════════════════════════════════════════════════════════════

const QUOTE_SELECT = `
  *,
  client:clients(*),
  vendor:vendors(*),
  items:quote_items(
    id, quote_id, product_id, qty, sort_order,
    modules:quote_item_modules(module_id)
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
      module_ids: (it.modules || []).map((m: any) => m.module_id),
    })),
  } as Quote;
}

export async function fetchQuotes(): Promise<Quote[]> {
  const data = await q<any[]>(
    supabase.from('quotes').select(QUOTE_SELECT).order('created_at', { ascending: false }),
    'fetchQuotes'
  );
  return (data || []).map(mapQuote);
}

export async function fetchQuoteById(id: string): Promise<Quote | null> {
  const data = await q<any>(
    supabase.from('quotes').select(QUOTE_SELECT).eq('id', id).maybeSingle(),
    'fetchQuoteById'
  );
  return data ? mapQuote(data) : null;
}

export async function fetchQuoteByPublicToken(token: string): Promise<Quote | null> {
  const data = await q<any>(
    supabase.from('quotes').select(QUOTE_SELECT).eq('public_token', token).maybeSingle(),
    'fetchQuoteByPublicToken'
  );
  return data ? mapQuote(data) : null;
}

export interface CreateQuoteInput {
  client: {
    id?: string;
    company: string;
    contact?: string;
    email?: string;
    phone?: string;
    industry?: string;
    size?: 'pequeña' | 'mediana' | 'grande';
    ruc?: string;
  };
  vendor_id: string;
  items: { product_id: string; qty: number; module_ids: string[] }[];
  discount: number;
  valid_days: number;
  delivery_weeks: number;
  payment_terms: string;
  proposal_text: string;
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
  const code = await q<string>(supabase.rpc('next_quote_code'), 'next_quote_code');

  // 3. Calcular validUntil
  const validUntil = new Date(Date.now() + input.valid_days * 86400000)
    .toISOString()
    .slice(0, 10);

  // 4. Insertar quote
  const quote = await q<any>(
    supabase
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
        views: 0,
      })
      .select()
      .single(),
    'createQuote'
  );

  // 5. Insertar items
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const itemData = await q<any>(
      supabase
        .from('quote_items')
        .insert({
          quote_id: quote.id,
          product_id: it.product_id,
          qty: it.qty,
          sort_order: i,
        })
        .select()
        .single(),
      'createQuoteItem'
    );

    if (it.module_ids.length > 0) {
      const rows = it.module_ids.map((mid) => ({
        quote_item_id: itemData.id,
        module_id: mid,
      }));
      await q<any>(
        supabase.from('quote_item_modules').insert(rows).select(),
        'createQuoteItemModules'
      );
    }
  }

  // 6. Refetch completo
  const full = await fetchQuoteById(quote.id);
  if (!full) throw new Error('No se pudo recuperar la cotización creada');
  return full;
}

export async function updateQuoteStatus(
  quoteId: string,
  status: Quote['status']
): Promise<void> {
  const patch: any = { status };
  if (status === 'enviada') patch.sent_at = new Date().toISOString();
  if (status === 'aceptada') patch.accepted_at = new Date().toISOString();
  await q<any>(
    supabase.from('quotes').update(patch).eq('id', quoteId).select(),
    'updateQuoteStatus'
  );
}

export async function publishQuote(quoteId: string): Promise<string> {
  const token = generatePublicToken();
  await q<any>(
    supabase
      .from('quotes')
      .update({
        public_token: token,
        status: 'enviada',
        sent_at: new Date().toISOString(),
      })
      .eq('id', quoteId)
      .select(),
    'publishQuote'
  );
  return token;
}

export async function incrementQuoteView(token: string): Promise<void> {
  // Fire-and-forget desde el link público: no bloquear ni propagar errores
  try {
    await withTimeout(
      supabase.rpc('increment_quote_view', { p_token: token }),
      5000,
      'increment_quote_view timeout'
    );
  } catch (e) {
    console.error('increment_quote_view failed', e);
  }
}

export async function deleteQuote(quoteId: string): Promise<void> {
  await q<any>(
    supabase.from('quotes').delete().eq('id', quoteId).select(),
    'deleteQuote'
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Organization settings
// ═══════════════════════════════════════════════════════════════════════

export async function fetchOrgSettings(): Promise<OrganizationSettings | null> {
  const data = await q<OrganizationSettings | null>(
    supabase.from('organization_settings').select('*').limit(1).maybeSingle(),
    'fetchOrgSettings'
  );
  return data;
}

export async function updateOrgSettings(
  id: string,
  patch: Partial<OrganizationSettings>
): Promise<OrganizationSettings> {
  const data = await q<OrganizationSettings | null>(
    supabase
      .from('organization_settings')
      .update(patch as any)
      .eq('id', id)
      .select()
      .maybeSingle(),
    'updateOrgSettings'
  );
  if (!data) {
    throw new Error(
      'No se pudo guardar. Tu sesión puede haber expirado — cierra sesión y vuelve a entrar.'
    );
  }
  return data;
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
  return q<CreateUserResult>(
    supabase.rpc('admin_create_user', {
      p_email: input.email,
      p_name: input.name,
      p_role: input.role,
      p_color: input.color || '#0F766E',
    }),
    'adminCreateUser'
  );
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await q<any>(
    supabase.rpc('admin_delete_user', { p_user_id: userId }),
    'adminDeleteUser'
  );
}

export async function adminUpdateUserRole(userId: string, role: VendorRole): Promise<void> {
  await q<any>(
    supabase.rpc('admin_update_user_role', {
      p_user_id: userId,
      p_role: role,
    }),
    'adminUpdateUserRole'
  );
}

export async function adminResetPassword(userId: string): Promise<{ password: string }> {
  return q<{ password: string }>(
    supabase.rpc('admin_reset_password', { p_user_id: userId }),
    'adminResetPassword'
  );
}

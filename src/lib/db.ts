import { supabase } from './supabase';
import type {
  Client,
  OrganizationSettings,
  Product,
  ProductModule,
  Quote,
  QuoteItem,
  Vendor,
  VendorRole,
} from './types';
import { generatePublicToken, withTimeout } from './utils';

// ═══════════════════════════════════════════════════════════════════════
// Products
// ═══════════════════════════════════════════════════════════════════════

export async function fetchProductsWithModules(): Promise<Product[]> {
  const [{ data: prodData, error: prodErr }, { data: modData, error: modErr }] =
    await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('product_modules').select('*').eq('active', true).order('sort_order'),
    ]);

  if (prodErr) throw prodErr;
  if (modErr) throw modErr;

  const modsByProd = new Map<string, ProductModule[]>();
  (modData || []).forEach((m) => {
    const arr = modsByProd.get(m.product_id) || [];
    arr.push(m as ProductModule);
    modsByProd.set(m.product_id, arr);
  });

  return (prodData || []).map((p) => ({
    ...(p as Product),
    modules: modsByProd.get(p.id) || [],
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// Vendors
// ═══════════════════════════════════════════════════════════════════════

export async function fetchVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase.from('vendors').select('*').order('name');
  if (error) throw error;
  return (data || []) as Vendor[];
}

export async function fetchCurrentVendor(): Promise<Vendor | null> {
  // getSession puede internamente hacer refresh del token si está cerca de expirar.
  // Usamos 15s de timeout (más tolerante para conexiones lentas) y si falla,
  // tratamos como "no hay sesión" en vez de propagar el error.
  let user: { id: string } | null = null;
  try {
    const { data: sess } = await withTimeout(
      supabase.auth.getSession(),
      15000,
      'Timeout obteniendo sesión'
    );
    user = sess.session?.user || null;
  } catch (e) {
    console.warn('[db] getSession falló, tratando como no autenticado:', e);
    return null;
  }
  if (!user) return null;

  const { data, error } = await withTimeout(
    supabase.from('vendors').select('*').eq('id', user.id).maybeSingle(),
    15000,
    'Timeout cargando perfil de usuario'
  );
  if (error) throw error;
  return (data as Vendor) || null;
}

// ═══════════════════════════════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════════════════════════════

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Client[];
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
  const { data, error } = await supabase
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
    .single();
  if (error) throw error;
  return data as Client;
}

// ═══════════════════════════════════════════════════════════════════════
// Quotes
// ═══════════════════════════════════════════════════════════════════════

// Devuelve quotes con client y vendor embebidos + items + module_ids
export async function fetchQuotes(): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select(
      `
      *,
      client:clients(*),
      vendor:vendors(*),
      items:quote_items(
        id, quote_id, product_id, qty, sort_order,
        modules:quote_item_modules(module_id)
      )
    `
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((q: any) => ({
    ...q,
    items: (q.items || []).map((it: any) => ({
      id: it.id,
      quote_id: it.quote_id,
      product_id: it.product_id,
      qty: it.qty,
      sort_order: it.sort_order,
      module_ids: (it.modules || []).map((m: any) => m.module_id),
    })),
  })) as Quote[];
}

export async function fetchQuoteById(id: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select(
      `
      *,
      client:clients(*),
      vendor:vendors(*),
      items:quote_items(
        id, quote_id, product_id, qty, sort_order,
        modules:quote_item_modules(module_id)
      )
    `
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const q: any = data;
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

export async function fetchQuoteByPublicToken(token: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select(
      `
      *,
      client:clients(*),
      vendor:vendors(*),
      items:quote_items(
        id, quote_id, product_id, qty, sort_order,
        modules:quote_item_modules(module_id)
      )
    `
    )
    .eq('public_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const q: any = data;
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
  const { data: codeData, error: codeErr } = await supabase.rpc('next_quote_code');
  if (codeErr) throw codeErr;
  const code = codeData as string;

  // 3. Calcular validUntil
  const validUntil = new Date(Date.now() + input.valid_days * 86400000)
    .toISOString()
    .slice(0, 10);

  // 4. Insertar quote
  const { data: quoteData, error: quoteErr } = await supabase
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
    .single();
  if (quoteErr) throw quoteErr;
  const quote = quoteData as any;

  // 5. Insertar items
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const { data: itemData, error: itemErr } = await supabase
      .from('quote_items')
      .insert({
        quote_id: quote.id,
        product_id: it.product_id,
        qty: it.qty,
        sort_order: i,
      })
      .select()
      .single();
    if (itemErr) throw itemErr;

    if (it.module_ids.length > 0) {
      const rows = it.module_ids.map((mid) => ({
        quote_item_id: (itemData as any).id,
        module_id: mid,
      }));
      const { error: modErr } = await supabase.from('quote_item_modules').insert(rows);
      if (modErr) throw modErr;
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
  const { error } = await supabase.from('quotes').update(patch).eq('id', quoteId);
  if (error) throw error;
}

export async function publishQuote(quoteId: string): Promise<string> {
  const token = generatePublicToken();
  const { error } = await supabase
    .from('quotes')
    .update({
      public_token: token,
      status: 'enviada',
      sent_at: new Date().toISOString(),
    })
    .eq('id', quoteId);
  if (error) throw error;
  return token;
}

export async function incrementQuoteView(token: string): Promise<void> {
  const { error } = await supabase.rpc('increment_quote_view', { p_token: token });
  if (error) console.error('increment_quote_view failed', error);
}

export async function deleteQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.from('quotes').delete().eq('id', quoteId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════
// Organization settings
// ═══════════════════════════════════════════════════════════════════════

export async function fetchOrgSettings(): Promise<OrganizationSettings | null> {
  const { data, error } = await withTimeout(
    supabase.from('organization_settings').select('*').limit(1).maybeSingle(),
    6000,
    'Timeout cargando datos de la organización'
  );
  if (error) throw error;
  return (data as OrganizationSettings) || null;
}

export async function updateOrgSettings(
  id: string,
  patch: Partial<OrganizationSettings>
): Promise<OrganizationSettings> {
  const { data, error } = await withTimeout(
    supabase
      .from('organization_settings')
      .update(patch as any)
      .eq('id', id)
      .select()
      .maybeSingle(),
    10000,
    'Timeout guardando cambios. Verifica tu conexión y vuelve a intentarlo.'
  );
  if (error) throw error;
  if (!data) {
    // RLS bloqueó el update silenciosamente (0 filas afectadas).
    // Puede pasar si la sesión expiró o si el usuario perdió el rol super_admin.
    throw new Error(
      'No se pudo guardar. Tu sesión puede haber expirado — cierra sesión y vuelve a entrar.'
    );
  }
  return data as OrganizationSettings;
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
  const { data, error } = await supabase.rpc('admin_reset_password', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data as { password: string };
}

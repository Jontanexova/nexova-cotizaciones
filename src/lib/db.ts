import { supabase } from './supabase';
import type {
  Client,
  OrganizationSettings,
  Product,
  ProductModule,
  Quote,
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
      size: c.size || null,
      ruc: c.ruc || null,
      owner_vendor_id: c.owner_vendor_id || null,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
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

export async function fetchQuotes(signal?: AbortSignal): Promise<Quote[]> {
  const { data, error } = await applySignal(
    supabase.from('quotes').select(QUOTE_SELECT).order('created_at', { ascending: false }),
    signal,
  );
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
  requirements?: string;
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
      views: 0,
    } as any)
    .select()
    .single();
  if (quoteErr) throw quoteErr;

  // 5. Insertar items
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const { data: itemData, error: itemErr } = await supabase
      .from('quote_items')
      .insert({
        quote_id: (quote as any).id,
        product_id: it.product_id,
        qty: it.qty,
        sort_order: i,
      } as any)
      .select()
      .single();
    if (itemErr) throw itemErr;

    if (it.module_ids.length > 0) {
      const rows = it.module_ids.map((mid) => ({
        quote_item_id: (itemData as any).id,
        module_id: mid,
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
): Promise<import('./types').SmtpSettings | null> {
  const { data, error } = await applySignal(
    supabase.from('smtp_settings').select('*').limit(1).maybeSingle(),
    signal,
  );
  if (error) throw error;
  return (data as import('./types').SmtpSettings) || null;
}

export async function updateSmtpSettings(
  id: string,
  patch: Partial<import('./types').SmtpSettings>,
): Promise<import('./types').SmtpSettings> {
  const { data, error } = await supabase
    .from('smtp_settings')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as import('./types').SmtpSettings;
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
    // supabase-js envuelve el error de la función; extraer mensaje útil
    let msg = error.message || 'Error invocando send-email';
    // Algunos errores traen el body en error.context
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
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

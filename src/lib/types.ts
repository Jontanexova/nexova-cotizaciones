// ═══════════════════════════════════════════════════════════════════════
// Tipos de dominio
// ═══════════════════════════════════════════════════════════════════════

export type VendorRole = 'super_admin' | 'admin' | 'seller' | 'external';

/**
 * v2.24: configuración de branding (white-label). Single-row.
 * Permite al super_admin personalizar logo, colores, tipografías y nombre
 * de la plataforma para revenderla o usarla en nombre de otro cliente.
 */
export interface BrandingSettings {
  id: string;
  // Logos (URLs públicas en Supabase Storage; NULL = usar SVG default)
  logo_main_url: string | null;
  logo_inverse_url: string | null;
  favicon_url: string | null;
  // Identidad
  commercial_name: string;
  tagline: string | null;
  // Paleta de colores (hex)
  color_primary: string;
  color_secondary: string;
  color_ink_dark: string;
  color_bg_light: string;
  color_success: string;
  // Tipografías
  font_display: string;
  font_body: string;
  font_display_url: string | null;
  font_body_url: string | null;
  // Metadata
  updated_at: string;
  updated_by: string | null;
}

/**
 * v2.21: dominio de email permitido para crear usuarios en la plataforma.
 * Si la tabla está vacía, no se aplica restricción (permite todos los dominios).
 */
export interface AllowedDomain {
  id: string;
  domain: string; // lowercase, sin '@' (ej. 'nexova.pe')
  created_at: string;
  created_by: string | null;
}
export type QuoteStatus =
  | 'borrador'
  | 'enviada'
  | 'vista'
  | 'negociacion'
  | 'aceptada'
  | 'rechazada';
export type ProductCategory =
  | 'Producto propio'
  | 'Servicio'
  | 'Recurrente'
  | 'Consultoría'
  | 'Capacitación';
export type ClientSize = 'pequeña' | 'mediana' | 'grande';

export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  color: string;
  role: VendorRole;
  commission: number;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmtpSettings {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductModule {
  id: string;
  product_id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
  /** v2.18: precio mensual de renovación de este módulo. Solo aplica si el producto padre tiene requires_recurring=true. */
  recurring_monthly_price: number;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  base_price: number;
  unit: string | null;
  description: string | null;
  default_weeks: number;
  /** @deprecated v2.18: mantener para compatibilidad con cotizaciones históricas. */
  recurring_name: string | null;
  /** @deprecated v2.18 */
  recurring_price: number | null;
  /** @deprecated v2.18 */
  recurring_unit: string | null;
  /** v2.18: flag que habilita cargos recurrentes por módulo (o fallback a nivel producto). */
  requires_recurring: boolean;
  /** v2.18: precio mensual fallback — se usa solo si requires_recurring=true Y ningún módulo seleccionado tiene recurring_monthly_price>0. */
  recurring_monthly_price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  modules?: ProductModule[];
}

export interface Client {
  id: string;
  company: string;
  contact: string | null;
  /** v2.25: cargo del contacto principal (ej. "Gerente General"). Usado en el bloque Cliente del PDF. */
  contact_role: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  size: ClientSize;
  ruc: string | null;
  /** v2.25: dirección fiscal/comercial del cliente. Usado en el bloque Cliente del PDF. */
  address: string | null;
  owner_vendor_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringCycle = 'monthly' | 'annual';

/**
 * v2.18: módulo seleccionado dentro de un item de cotización.
 * cycle y gift_months solo tienen valor si el módulo tiene recurring_monthly_price > 0.
 * gift_months solo aplica cuando cycle === 'annual'.
 */
export interface QuoteItemModule {
  module_id: string;
  recurring_billing_cycle: RecurringCycle | null;
  recurring_gift_months: number; // 0-11
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id: string;
  qty: number;
  sort_order: number;
  /**
   * v2.18: lista de módulos seleccionados con su ciclo de renovación y meses de regalo.
   * Reemplaza el antiguo module_ids: string[].
   */
  modules: QuoteItemModule[];
  /**
   * v2.18: ciclo y regalo a nivel item — fallback cuando el producto tiene
   * requires_recurring pero ningún módulo seleccionado aporta recurring.
   */
  recurring_billing_cycle: RecurringCycle | null;
  recurring_gift_months: number;
}

export interface Quote {
  id: string;
  code: string;
  client_id: string;
  vendor_id: string;
  status: QuoteStatus;
  discount: number;
  valid_days: number;
  valid_until: string | null;
  delivery_weeks: number;
  payment_terms: string | null;
  proposal_text: string | null;
  requirements: string | null;
  /** v2.25: narrativa 2 párrafos generada por IA. Sección "Justificación y características del proyecto" del PDF. Fallback a proposal_text si NULL. */
  justification_text: string | null;
  /** v2.25: chip "Solución" (~60 chars) generado por IA a partir de requirements. */
  solution_summary: string | null;
  /** v2.25: chip "Alcance" (~60 chars) generado por IA a partir de requirements. */
  scope_summary: string | null;
  /** v2.25: chip "Modalidad" (~60 chars) generado por IA a partir de requirements. */
  modality_summary: string | null;
  /** v2.25: override de "Notas y condiciones" (una línea por nota). NULL = usa organization_settings.default_terms. */
  terms: string | null;
  exchange_rate: number | null;
  views: number;
  public_token: string | null;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  accepted_at: string | null;

  // joins opcionales
  client?: Client;
  vendor?: Vendor;
  items?: QuoteItem[];
}

export interface OrganizationSettings {
  id: string;
  name: string;
  legal_name: string | null;
  ruc: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  exchange_rate: number | null;
  exchange_rate_updated_at: string | null;
  exchange_rate_updated_by: string | null;
  peruapi_key: string | null;
  exchange_rate_auto_sync: boolean | null;
  exchange_rate_last_sync_at: string | null;
  exchange_rate_last_sync_status: string | null;
  exchange_rate_source: string | null;
  /** v2.20: proveedor del API de TC — 'decolecta' | 'peruapi' | 'custom' */
  exchange_rate_api_provider: string | null;
  /** v2.20: URL base del endpoint del TC */
  exchange_rate_api_url: string | null;
  /** v2.20: nombre del header de auth (ej. 'Authorization' o 'X-API-KEY') */
  exchange_rate_api_auth_header: string | null;
  /** v2.20: prefix del valor del auth (ej. 'Bearer' o vacío) */
  exchange_rate_api_auth_scheme: string | null;
  /** v2.20: nombre del query param de fecha (ej. 'date' o 'fecha') */
  exchange_rate_api_date_param: string | null;
  /** v2.25: términos y condiciones por defecto (una línea por nota). Si quote.terms es NULL, se usan estos al renderizar. */
  default_terms: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Supabase generated-style Database type (minimal)
// ═══════════════════════════════════════════════════════════════════════

export interface ExchangeRate {
  id: string;
  rate: number;
  effective_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      vendors: {
        Row: Vendor;
        Insert: Partial<Vendor> & { id: string; email: string; name: string };
        Update: Partial<Vendor>;
      };
      products: {
        Row: Omit<Product, 'modules'>;
        Insert: Partial<Product> & { id: string; name: string; category: ProductCategory };
        Update: Partial<Product>;
      };
      product_modules: {
        Row: ProductModule;
        Insert: Partial<ProductModule> & { id: string; product_id: string; name: string };
        Update: Partial<ProductModule>;
      };
      clients: {
        Row: Client;
        Insert: Partial<Client> & { company: string };
        Update: Partial<Client>;
      };
      quotes: {
        Row: Omit<Quote, 'client' | 'vendor' | 'items'>;
        Insert: Partial<Quote> & { code: string; client_id: string; vendor_id: string };
        Update: Partial<Quote>;
      };
      quote_items: {
        Row: Omit<QuoteItem, 'modules'>;
        Insert: Partial<QuoteItem> & { quote_id: string; product_id: string };
        Update: Partial<QuoteItem>;
      };
      quote_item_modules: {
        Row: {
          quote_item_id: string;
          module_id: string;
          recurring_billing_cycle: RecurringCycle | null;
          recurring_gift_months: number;
        };
        Insert: {
          quote_item_id: string;
          module_id: string;
          recurring_billing_cycle?: RecurringCycle | null;
          recurring_gift_months?: number;
        };
        Update: Partial<{
          quote_item_id: string;
          module_id: string;
          recurring_billing_cycle: RecurringCycle | null;
          recurring_gift_months: number;
        }>;
      };
    };
    Functions: {
      next_quote_code: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      increment_quote_view: { Args: { p_token: string }; Returns: void };
    };
  };
};

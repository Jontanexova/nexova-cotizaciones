// ═══════════════════════════════════════════════════════════════════════
// Tipos de dominio
// ═══════════════════════════════════════════════════════════════════════

export type VendorRole = 'super_admin' | 'admin' | 'seller' | 'external';
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
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  base_price: number;
  unit: string | null;
  description: string | null;
  default_weeks: number;
  recurring_name: string | null;
  recurring_price: number | null;
  recurring_unit: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  modules?: ProductModule[];
}

export interface Client {
  id: string;
  company: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  size: ClientSize;
  ruc: string | null;
  owner_vendor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id: string;
  qty: number;
  sort_order: number;
  module_ids: string[];
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
        Row: Omit<QuoteItem, 'module_ids'>;
        Insert: Partial<QuoteItem> & { quote_id: string; product_id: string };
        Update: Partial<QuoteItem>;
      };
      quote_item_modules: {
        Row: { quote_item_id: string; module_id: string };
        Insert: { quote_item_id: string; module_id: string };
        Update: { quote_item_id?: string; module_id?: string };
      };
    };
    Functions: {
      next_quote_code: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      increment_quote_view: { Args: { p_token: string }; Returns: void };
    };
  };
};

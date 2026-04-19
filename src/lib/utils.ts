import type { Product, ProductModule, QuoteItem, QuoteStatus } from './types';

// ─── Formatters ───
export const fmtMoney = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return (
    'S/ ' +
    (Math.round(v * 100) / 100).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

/**
 * Convierte un monto en soles a USD usando el tipo de cambio y formatea.
 * Si no hay TC, devuelve string vacío (el caller decide si mostrarlo).
 */
export const fmtUSD = (pen: number | null | undefined, rate: number | null | undefined): string => {
  if (!rate || rate <= 0) return '';
  const v = Number(pen ?? 0) / Number(rate);
  return (
    '$ ' +
    (Math.round(v * 100) / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Status metadata ───
export const STATUS_MAP: Record<
  QuoteStatus,
  { label: string; chip: string; dot: string }
> = {
  borrador: { label: 'Borrador', chip: 'chip-slate', dot: '#64748B' },
  enviada: { label: 'Enviada', chip: 'chip-teal', dot: '#0D9488' },
  vista: { label: 'Vista', chip: 'chip-amber', dot: '#F59E0B' },
  negociacion: { label: 'Negociación', chip: 'chip-amber', dot: '#F59E0B' },
  aceptada: { label: 'Aceptada', chip: 'chip-success', dot: '#059669' },
  rechazada: { label: 'Rechazada', chip: 'chip-danger', dot: '#DC2626' },
};

// ─── Calculations ───
export interface QuoteTotals {
  subtotal: number;
  discountAmt: number;
  afterDisc: number;
  igv: number;
  total: number;
}

/**
 * Representa una fila de cargo recurrente asociada a un item de la cotización.
 * Se genera solo si el producto subyacente tiene recurring_name Y recurring_price > 0.
 * El unit_price ya viene multiplicado por qty del item (más sites = más suscripciones).
 */
export interface RecurringCharge {
  product_id: string;
  product_name: string;
  recurring_name: string;
  unit_price: number;
  unit: string;
  qty: number;
}

export function getRecurringCharges(
  items: QuoteItem[],
  products: Product[],
): RecurringCharge[] {
  const rows: RecurringCharge[] = [];
  for (const it of items) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;
    const name = (p.recurring_name || '').trim();
    const price = Number(p.recurring_price || 0);
    if (!name || price <= 0) continue; // sin recurrente configurado → se omite
    rows.push({
      product_id: p.id,
      product_name: p.name,
      recurring_name: name,
      unit_price: price * (it.qty || 1),
      unit: (p.recurring_unit || 'mes').trim() || 'mes',
      qty: it.qty || 1,
    });
  }
  return rows;
}

export function computeQuoteTotals(
  items: QuoteItem[],
  products: Product[],
  discount: number
): QuoteTotals {
  let subtotal = 0;
  for (const it of items) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;
    let line = Number(p.base_price || 0);
    for (const mid of it.module_ids || []) {
      const m = p.modules?.find((x) => x.id === mid);
      if (m) line += Number(m.price || 0);
    }
    subtotal += line * (it.qty || 1);
  }
  const discountAmt = subtotal * ((discount || 0) / 100);
  const afterDisc = subtotal - discountAmt;
  const igv = afterDisc * 0.18;
  const total = afterDisc + igv;
  return { subtotal, discountAmt, afterDisc, igv, total };
}

// ─── Line price (single item) ───
export function lineItemPrice(
  item: { product_id: string; qty: number; module_ids: string[] },
  products: Product[]
): number {
  const p = products.find((x) => x.id === item.product_id);
  if (!p) return 0;
  let line = Number(p.base_price || 0);
  for (const mid of item.module_ids || []) {
    const m = p.modules?.find((x) => x.id === mid);
    if (m) line += Number(m.price || 0);
  }
  return line * (item.qty || 1);
}

// ─── Random token for public quote links ───
export function generatePublicToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ─── Role label ───
export const roleLabel: Record<'super_admin' | 'admin' | 'seller' | 'external', string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  seller: 'Vendedor',
  external: 'Vendedor externo',
};

// ─── Timeout wrapper ───
// Envuelve una promesa (o PromiseLike como los builders de Supabase) para que
// falle con error claro en vez de colgarse indefinidamente.
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = 10000,
  message: string = 'La operación tardó demasiado. Verifica tu conexión o vuelve a intentarlo.'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const wrapped = Promise.resolve(promise);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([
    wrapped.then((v) => {
      clearTimeout(timeoutId);
      return v;
    }),
    timeoutPromise,
  ]) as Promise<T>;
}

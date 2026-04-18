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
export const roleLabel: Record<'admin' | 'seller' | 'external', string> = {
  admin: 'Administrador',
  seller: 'Vendedor',
  external: 'Vendedor externo',
};

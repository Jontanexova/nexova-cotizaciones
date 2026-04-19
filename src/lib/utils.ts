import type { Product, ProductModule, QuoteItem, QuoteItemModule, QuoteStatus, RecurringCycle } from './types';

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
 * v2.18: cargo recurrente derivado de un item de cotización.
 * - first_period_amount: lo que paga HOY (primer mes si cycle=monthly, primer año ×12 si cycle=annual).
 *   Este monto se SUMA al subtotal de la cotización (Inversión detallada, primer año completo).
 * - renewal_amount: lo que paga en cada renovación posterior.
 *   Si cycle=annual y hay regalo, este monto YA tiene el descuento aplicado (× (12-gift)).
 *   Este monto es informativo — se muestra en "Pagos recurrentes".
 */
export interface RecurringCharge {
  product_id: string;
  product_name: string;
  /** Nombre del módulo, o del producto si es fallback a nivel item. */
  label: string;
  cycle: 'monthly' | 'annual';
  monthly_unit_price: number;
  qty: number;
  first_period_amount: number; // incluido en inversión (mensual ×1, anual ×12) × qty
  renewal_amount: number; // en renovaciones (mensual ×1, anual ×(12-gift)) × qty
  gift_months: number;
}

/** Cap máximo de meses de regalo (validación). */
export const MAX_GIFT_MONTHS = 11;
/** Umbral para mostrar warning amarillo al vendor en el Wizard. */
export const WARN_GIFT_MONTHS_THRESHOLD = 3;

/**
 * v2.18: deriva los cargos recurrentes de los items de una cotización.
 *
 * Reglas:
 *  - Si el producto tiene requires_recurring=false → nada.
 *  - Si el producto tiene requires_recurring=true:
 *    - Si algún módulo seleccionado tiene recurring_monthly_price > 0 → una fila por cada módulo así.
 *    - Si ninguno → fallback: una fila usando product.recurring_monthly_price y ciclo/regalo del item.
 *  - gift_months solo aplica si cycle='annual'.
 */
export function getRecurringCharges(
  items: QuoteItem[],
  products: Product[],
): RecurringCharge[] {
  const rows: RecurringCharge[] = [];

  for (const it of items) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p || !p.requires_recurring) continue;

    const qty = it.qty || 1;

    const modulesWithRecurring = (it.modules || [])
      .map((selMod) => {
        const pm = p.modules?.find((x) => x.id === selMod.module_id);
        if (!pm || Number(pm.recurring_monthly_price || 0) <= 0) return null;
        return { pm, sel: selMod };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (modulesWithRecurring.length > 0) {
      for (const { pm, sel } of modulesWithRecurring) {
        const cycle: 'monthly' | 'annual' = sel.recurring_billing_cycle || 'monthly';
        const gift = cycle === 'annual' ? Math.max(0, Math.min(MAX_GIFT_MONTHS, sel.recurring_gift_months || 0)) : 0;
        const monthlyUnit = Number(pm.recurring_monthly_price);
        const firstPeriod = cycle === 'annual' ? monthlyUnit * 12 : monthlyUnit;
        const renewal = cycle === 'annual' ? monthlyUnit * (12 - gift) : monthlyUnit;
        rows.push({
          product_id: p.id,
          product_name: p.name,
          label: pm.name,
          cycle,
          monthly_unit_price: monthlyUnit,
          qty,
          first_period_amount: firstPeriod * qty,
          renewal_amount: renewal * qty,
          gift_months: gift,
        });
      }
    } else {
      const monthlyUnit = Number(p.recurring_monthly_price || 0);
      if (monthlyUnit <= 0) continue;
      const cycle: 'monthly' | 'annual' = it.recurring_billing_cycle || 'monthly';
      const gift = cycle === 'annual' ? Math.max(0, Math.min(MAX_GIFT_MONTHS, it.recurring_gift_months || 0)) : 0;
      const firstPeriod = cycle === 'annual' ? monthlyUnit * 12 : monthlyUnit;
      const renewal = cycle === 'annual' ? monthlyUnit * (12 - gift) : monthlyUnit;
      rows.push({
        product_id: p.id,
        product_name: p.name,
        label: p.name,
        cycle,
        monthly_unit_price: monthlyUnit,
        qty,
        first_period_amount: firstPeriod * qty,
        renewal_amount: renewal * qty,
        gift_months: gift,
      });
    }
  }

  return rows;
}

/**
 * v2.18: texto dinámico del encabezado de "Pagos recurrentes" según ciclos presentes.
 */
export function getRecurringHeaderText(charges: RecurringCharge[]): string {
  if (charges.length === 0) return '';
  const cycles = new Set(charges.map((c) => c.cycle));
  if (cycles.size === 1) {
    const only = [...cycles][0];
    const period = only === 'monthly' ? 'mes' : 'año';
    return `Cargos periódicos posteriores al primer ${period}. No están incluidos en el total de la inversión inicial.`;
  }
  return 'Cargos periódicos de renovación. No están incluidos en el total de la inversión inicial.';
}

/** Subtexto individual por fila con nota opcional de regalo. */
export function getRecurringRowSubtext(charge: RecurringCharge): string {
  const period = charge.cycle === 'monthly' ? 'mes' : 'año';
  const base = `a partir del segundo ${period}`;
  if (charge.cycle === 'annual' && charge.gift_months > 0) {
    const monthsLabel = charge.gift_months === 1 ? '1 mes de regalo' : `${charge.gift_months} meses de regalo`;
    const billedMonths = 12 - charge.gift_months;
    return `${base} · ${billedMonths} meses facturados · ${monthsLabel}`;
  }
  return base;
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
    for (const selMod of it.modules || []) {
      const m = p.modules?.find((x) => x.id === selMod.module_id);
      if (m) line += Number(m.price || 0);
    }
    subtotal += line * (it.qty || 1);
  }

  // v2.18: primer período de cada cargo recurrente se SUMA al subtotal.
  const recurring = getRecurringCharges(items, products);
  for (const r of recurring) {
    subtotal += r.first_period_amount;
  }

  const discountAmt = subtotal * ((discount || 0) / 100);
  const afterDisc = subtotal - discountAmt;
  const igv = afterDisc * 0.18;
  const total = afterDisc + igv;
  return { subtotal, discountAmt, afterDisc, igv, total };
}

// ─── Line price (single item) ───
/**
 * Precio total de una línea (base + módulos + primer pago recurrente) × qty.
 * Usado en el Wizard para mostrar el total por item en la UI.
 */
export function lineItemPrice(
  item: {
    product_id: string;
    qty: number;
    modules?: QuoteItemModule[];
    recurring_billing_cycle?: RecurringCycle | null;
    recurring_gift_months?: number;
  },
  products: Product[]
): number {
  const p = products.find((x) => x.id === item.product_id);
  if (!p) return 0;

  let line = Number(p.base_price || 0);
  for (const selMod of item.modules || []) {
    const m = p.modules?.find((x) => x.id === selMod.module_id);
    if (m) line += Number(m.price || 0);
  }
  let total = line * (item.qty || 1);

  if (p.requires_recurring) {
    const charges = getRecurringCharges(
      [{
        id: '', quote_id: '', product_id: item.product_id,
        qty: item.qty || 1, sort_order: 0,
        modules: item.modules || [],
        recurring_billing_cycle: item.recurring_billing_cycle || null,
        recurring_gift_months: item.recurring_gift_months || 0,
      }],
      products,
    );
    for (const c of charges) total += c.first_period_amount;
  }

  return total;
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

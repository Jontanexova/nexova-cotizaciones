import type { Currency, Product, ProductModule, QuoteItem, QuoteItemModule, QuoteStatus, RecurringCycle } from './types';

// ─── Formatters ───
/**
 * Formatea un monto en la moneda indicada. Si no se pasa moneda, asume PEN
 * (compatibilidad con código pre-v2.28 que llamaba `fmtMoney(n)` sin args).
 */
export const fmtMoney = (
  n: number | null | undefined,
  currency: Currency = 'PEN',
): string => {
  const v = Number(n ?? 0);
  const formatted = (Math.round(v * 100) / 100).toLocaleString(
    currency === 'USD' ? 'en-US' : 'es-PE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );
  return (currency === 'USD' ? '$ ' : 'S/ ') + formatted;
};

/**
 * Convierte un monto en soles a USD usando el tipo de cambio y formatea.
 * Si no hay TC, devuelve string vacío (el caller decide si mostrarlo).
 *
 * @deprecated v2.28: usar `convertAmount` + `fmtMoney` para conversiones
 * arbitrarias entre monedas. Se mantiene porque el PDF y la lista de quotes
 * lo usan para mostrar el equivalente informativo del total en USD.
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

/**
 * v2.28: convierte un monto entre PEN y USD usando un tipo de cambio.
 *
 * Convenio: `rate` es PEN por USD (ej. 3.75 ⇒ 1 USD = 3.75 PEN). Misma
 * convención que usa el resto del sistema (organization_settings.exchange_rate,
 * fmtUSD legacy, etc).
 *
 * Si `from === to` devuelve el mismo monto. Si falta `rate` o es inválido y se
 * requiere conversión, lanza error — el caller debe validar TC antes de llegar
 * acá (ej. Wizard no permite avanzar con mezcla de monedas sin TC).
 */
export const convertAmount = (
  amount: number,
  from: Currency,
  to: Currency,
  rate: number | null | undefined,
): number => {
  if (from === to) return amount;
  if (!rate || rate <= 0) {
    throw new Error(
      'Falta tipo de cambio para convertir entre soles y dólares. Configúralo en Ajustes.',
    );
  }
  // PEN → USD: dividir; USD → PEN: multiplicar.
  return from === 'PEN' ? amount / rate : amount * rate;
};

/**
 * v2.28: convierte el precio nativo de un producto a la moneda objetivo de la
 * cotización. Wrapper de `convertAmount` que toma el producto entero para no
 * repetir la lookup de currency en todos los callers.
 */
export const convertProductPrice = (
  amount: number,
  product: { currency?: Currency },
  quoteCurrency: Currency,
  rate: number | null | undefined,
): number => {
  return convertAmount(amount, product.currency || 'PEN', quoteCurrency, rate);
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * v2.25: formato numérico DD/MM/YYYY usado en el formato proforma del PDF.
 * Complementa a fmtDate (que usa mes abreviado) — este es el formato más formal
 * y compacto esperado en documentos tributarios peruanos.
 */
export const fmtDateNumeric = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/**
 * v2.25: título formal para mostrar en el bloque de firma del PDF.
 * El `roleLabel` estándar ("Super Admin", "Vendedor externo") está pensado para
 * la UI interna; para un documento comercial firmado necesitamos algo más formal.
 */
export const formalRoleLabel: Record<'super_admin' | 'admin' | 'seller' | 'external', string> = {
  super_admin: 'Administrador General',
  admin: 'Administrador',
  seller: 'Ejecutivo Comercial',
  external: 'Consultor Externo',
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
  quoteCurrency: Currency = 'PEN',
  exchangeRate: number | null | undefined = null,
): RecurringCharge[] {
  const rows: RecurringCharge[] = [];

  for (const it of items) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p || !p.requires_recurring) continue;

    const qty = it.qty || 1;
    // v2.28: los módulos heredan la moneda del producto. Convertimos cada
    // precio mensual a la moneda del quote antes de calcular periodo/renewal.
    const productCurrency = p.currency || 'PEN';
    const toQuote = (n: number) =>
      convertAmount(n, productCurrency, quoteCurrency, exchangeRate);

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
        const monthlyUnit = toQuote(Number(pm.recurring_monthly_price));
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
      const monthlyUnitNative = Number(p.recurring_monthly_price || 0);
      if (monthlyUnitNative <= 0) continue;
      const monthlyUnit = toQuote(monthlyUnitNative);
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
  discount: number,
  quoteCurrency: Currency = 'PEN',
  exchangeRate: number | null | undefined = null,
): QuoteTotals {
  let subtotal = 0;
  for (const it of items) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;
    let lineNative = Number(p.base_price || 0);
    for (const selMod of it.modules || []) {
      const m = p.modules?.find((x) => x.id === selMod.module_id);
      if (m) lineNative += Number(m.price || 0);
    }
    const line = convertAmount(lineNative, p.currency || 'PEN', quoteCurrency, exchangeRate);
    subtotal += line * (it.qty || 1);
  }

  // v2.18: primer período de cada cargo recurrente se SUMA al subtotal.
  // v2.28: getRecurringCharges ya devuelve montos en la moneda del quote.
  const recurring = getRecurringCharges(items, products, quoteCurrency, exchangeRate);
  for (const r of recurring) {
    subtotal += r.first_period_amount;
  }

  const discountAmt = subtotal * ((discount || 0) / 100);
  const afterDisc = subtotal - discountAmt;
  // IGV 18% se aplica igual en PEN y USD (decisión de negocio v2.28).
  const igv = afterDisc * 0.18;
  const total = afterDisc + igv;
  return { subtotal, discountAmt, afterDisc, igv, total };
}

/**
 * v2.28: total de una cotización expresado en SOLES, listo para sumar a un
 * agregado del Dashboard o de un reporte que mezcle cotizaciones en distintas
 * monedas. Si la cotización es USD y no tiene `exchange_rate`, retorna 0
 * (no se puede sumar peras y manzanas; el caller decide si filtra).
 */
export function computeQuoteTotalInPEN(
  quote: {
    items?: QuoteItem[];
    discount: number;
    currency?: Currency;
    exchange_rate?: number | null;
  },
  products: Product[],
): number {
  const qCurrency = quote.currency || 'PEN';
  const rate = quote.exchange_rate ?? null;
  // Calculamos los totales en la moneda nativa del quote.
  const totals = computeQuoteTotals(
    quote.items || [],
    products,
    quote.discount,
    qCurrency,
    rate,
  );
  if (qCurrency === 'PEN') return totals.total;
  if (!rate || rate <= 0) return 0;
  return totals.total * rate;
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
  products: Product[],
  quoteCurrency: Currency = 'PEN',
  exchangeRate: number | null | undefined = null,
): number {
  const p = products.find((x) => x.id === item.product_id);
  if (!p) return 0;

  let lineNative = Number(p.base_price || 0);
  for (const selMod of item.modules || []) {
    const m = p.modules?.find((x) => x.id === selMod.module_id);
    if (m) lineNative += Number(m.price || 0);
  }
  const line = convertAmount(lineNative, p.currency || 'PEN', quoteCurrency, exchangeRate);
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
      quoteCurrency,
      exchangeRate,
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

// ─── v2.25: Number → Spanish words (para "Son: MIL QUINIENTOS…") ───
// Convierte un entero 0..999_999_999 a su representación literal en español
// peruano (usando "y" entre decenas y unidades, "un" apocopado antes de "mil" /
// "millón", etc). Soporta hasta 999.999.999 que es más que suficiente para
// cotizaciones comerciales. Centavos se manejan aparte en `moneyToSonText`.
const _UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const _TEENS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const _TENS  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const _HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function _under1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(_HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 10) parts.push(_UNITS[rest]);
    else if (rest < 20) parts.push(_TEENS[rest - 10]);
    else if (rest < 30) {
      // 21..29 → "VEINTIUNO", "VEINTIDÓS", etc. (sin espacio)
      if (rest === 20) parts.push('VEINTE');
      else {
        const u = rest - 20;
        const map = ['', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
        parts.push(map[u]);
      }
    } else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u === 0 ? _TENS[t] : `${_TENS[t]} Y ${_UNITS[u]}`);
    }
  }
  return parts.join(' ');
}

/**
 * Convierte un entero a su representación en palabras (mayúsculas, español PE).
 * Ejemplos: 1513 → "MIL QUINIENTOS TRECE", 1_000_000 → "UN MILLÓN".
 */
export function integerToSpanishWords(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 0) return `MENOS ${integerToSpanishWords(-n)}`;
  if (n > 999_999_999) return String(n); // fallback: fuera de rango

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (millions > 0) {
    if (millions === 1) parts.push('UN MILLÓN');
    else parts.push(`${_under1000(millions).replace(/\bUNO\b/g, 'UN')} MILLONES`);
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('MIL');
    else parts.push(`${_under1000(thousands).replace(/\bUNO\b/g, 'UN')} MIL`);
  }
  if (rest > 0) parts.push(_under1000(rest));
  return parts.join(' ');
}

/**
 * Genera la línea "Son: {monto en palabras} CON {cc}/100 SOLES" (o DÓLARES
 * AMERICANOS) que va bajo el bloque de totales en el PDF formal. Redondea
 * a 2 decimales antes de partir entero/centavos para evitar artefactos de
 * float (ej. 1513.349999 → 1513.35).
 */
export function moneyToSonText(amount: number, currency: Currency = 'PEN'): string {
  const rounded = Math.round(amount * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  const words = integerToSpanishWords(integer);
  const ccStr = String(cents).padStart(2, '0');
  const unit = currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
  return `${words} CON ${ccStr}/100 ${unit}`;
}

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

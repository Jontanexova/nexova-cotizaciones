import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, Toast, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtDate, fmtMoney, fmtUSD, roleLabel } from '../lib/utils';
import { fetchOrgSettings, updateOrgSettings, updateExchangeRate, updatePeruApiConfig, refreshExchangeRateFromApi, fetchSmtpSettings, updateSmtpSettings, sendEmail, fetchAllowedDomains, addAllowedDomain, removeAllowedDomain, normalizeDomain } from '../lib/db';
import type { AllowedDomain, OrganizationSettings, Product, Quote, SmtpSettings } from '../lib/types';

// ═══════════════════════════════════════════════════════════════════════
// Vendors page
// ═══════════════════════════════════════════════════════════════════════

export function Vendors() {
  const { vendors, loading } = useVendors();
  const { quotes } = useQuotes();
  const { products } = useProducts();

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Equipo comercial" />
        <Loading />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Topbar
        title="Equipo comercial"
        subtitle="Vendedores registrados. Nuevos miembros se registran directamente en la app."
      />
      <div style={{ padding: '24px 32px' }}>
        {vendors.length === 0 ? (
          <div className="nx-card nx-card-padded empty-state">
            Aún no hay vendedores. Comparte el link de la app para que se registren.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {vendors.map((v) => {
              const vQuotes = quotes.filter((q) => q.vendor_id === v.id);
              const closed = vQuotes.filter((q) => q.status === 'aceptada');
              const revenue = closed.reduce(
                (s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total,
                0
              );
              return (
                <div key={v.id} className="nx-card nx-card-padded">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <Avatar name={v.name} color={v.color} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{v.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                        {v.email}
                      </div>
                    </div>
                    <span
                      className={
                        'nx-chip ' +
                        (v.role === 'super_admin'
                          ? 'chip-teal'
                          : v.role === 'admin'
                          ? 'chip-teal'
                          : v.role === 'seller'
                          ? 'chip-slate'
                          : 'chip-amber')
                      }
                    >
                      {roleLabel[v.role]}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 10,
                      padding: '10px 0',
                      borderTop: '1px solid var(--ink-100)',
                      fontSize: 12,
                    }}
                  >
                    <Metric label="Cotiz." value={vQuotes.length} />
                    <Metric label="Cerradas" value={closed.length} />
                    <Metric label="Ingreso" value={fmtMoney(revenue).replace('S/ ', 'S/')} small />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.08em',
          color: 'var(--ink-500)',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: small ? 13 : 18,
          color: 'var(--ink-900)',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// Reports page (v2.19: filtro de período, comparativa, tops)
// ═══════════════════════════════════════════════════════════════════════

type FilterMode = 'preset' | 'monthYear' | 'range';
type Preset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear';

interface DateFilter {
  mode: FilterMode;
  preset: Preset;
  month: number; // 1-12
  year: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Calcula el rango [start, end) efectivo del filtro según el modo.
 * Retorna null/null si es "Todos" (sin filtrar).
 * `label` describe el período legible para humanos.
 */
function getPeriodRange(f: DateFilter): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();
  if (f.mode === 'preset') {
    switch (f.preset) {
      case 'all':
        return { start: null, end: null, label: 'Histórico completo' };
      case 'thisMonth': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { start: s, end: e, label: `${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}` };
      }
      case 'lastMonth': {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: s, end: e, label: `${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}` };
      }
      case 'thisYear': {
        const s = new Date(now.getFullYear(), 0, 1);
        const e = new Date(now.getFullYear() + 1, 0, 1);
        return { start: s, end: e, label: `Año ${s.getFullYear()}` };
      }
      case 'lastYear': {
        const s = new Date(now.getFullYear() - 1, 0, 1);
        const e = new Date(now.getFullYear(), 0, 1);
        return { start: s, end: e, label: `Año ${s.getFullYear()}` };
      }
    }
  }
  if (f.mode === 'monthYear') {
    const s = new Date(f.year, f.month - 1, 1);
    const e = new Date(f.year, f.month, 1);
    return { start: s, end: e, label: `${MONTH_NAMES[f.month - 1]} ${f.year}` };
  }
  // range
  if (f.from && f.to) {
    const s = new Date(f.from + 'T00:00:00');
    const e = new Date(f.to + 'T00:00:00');
    e.setDate(e.getDate() + 1); // end exclusive
    return { start: s, end: e, label: `${fmtDate(f.from)} → ${fmtDate(f.to)}` };
  }
  return { start: null, end: null, label: 'Rango no definido' };
}

/**
 * Dado un rango actual, calcula el período inmediato anterior de la misma duración.
 * Para comparaciones "vs mes pasado", "vs año pasado", "vs rango anterior".
 */
function getPreviousPeriod(
  start: Date | null,
  end: Date | null,
): { start: Date | null; end: Date | null; label: string } {
  if (!start || !end) return { start: null, end: null, label: '' };
  const ms = end.getTime() - start.getTime();
  // Detectar caso mes-completo vs rango-libre
  const isMonthStart = start.getDate() === 1;
  const spansOneMonth =
    isMonthStart &&
    end.getDate() === 1 &&
    ((end.getMonth() === start.getMonth() + 1 && end.getFullYear() === start.getFullYear()) ||
      (end.getMonth() === 0 && start.getMonth() === 11 && end.getFullYear() === start.getFullYear() + 1));
  const spansOneYear =
    isMonthStart &&
    start.getMonth() === 0 &&
    end.getMonth() === 0 &&
    end.getFullYear() === start.getFullYear() + 1;

  if (spansOneMonth) {
    const ps = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const pe = new Date(start.getFullYear(), start.getMonth(), 1);
    return { start: ps, end: pe, label: `${MONTH_NAMES[ps.getMonth()]} ${ps.getFullYear()}` };
  }
  if (spansOneYear) {
    const ps = new Date(start.getFullYear() - 1, 0, 1);
    const pe = new Date(start.getFullYear(), 0, 1);
    return { start: ps, end: pe, label: `Año ${ps.getFullYear()}` };
  }
  // Rango custom: mismo tamaño, inmediatamente anterior
  const pe = new Date(start.getTime());
  const ps = new Date(start.getTime() - ms);
  return { start: ps, end: pe, label: 'Período anterior' };
}

/**
 * Filtra cotizaciones por fecha de aceptación dentro del rango.
 * Si start/end son null, no filtra por fecha pero aún así exige status=aceptada.
 */
function filterAcceptedInRange(
  quotes: Quote[],
  start: Date | null,
  end: Date | null,
): Quote[] {
  return quotes.filter((q) => {
    if (q.status !== 'aceptada' || !q.accepted_at) return false;
    if (!start || !end) return true;
    const d = new Date(q.accepted_at);
    return d >= start && d < end;
  });
}

function computeDelta(current: number, previous: number): { pct: number | null; sign: 'up' | 'down' | 'flat' } {
  if (previous === 0) {
    if (current === 0) return { pct: 0, sign: 'flat' };
    return { pct: null, sign: 'up' }; // infinito → sin %
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, sign: 'flat' };
  return { pct: Math.abs(pct), sign: pct > 0 ? 'up' : 'down' };
}

function DeltaBadge({ current, previous, prevLabel }: { current: number; previous: number; prevLabel: string }) {
  const { pct, sign } = computeDelta(current, previous);
  if (!prevLabel) return null;
  const color = sign === 'up' ? '#059669' : sign === 'down' ? '#DC2626' : 'var(--ink-500)';
  const arrow = sign === 'up' ? '↑' : sign === 'down' ? '↓' : '→';
  const pctLabel = pct === null ? '—' : pct.toFixed(pct < 10 ? 1 : 0) + '%';
  return (
    <div
      style={{
        fontSize: 11,
        color,
        fontWeight: 600,
        marginTop: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
      title={`vs ${prevLabel}`}
    >
      <span>{arrow}</span>
      <span>{pctLabel}</span>
      <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>vs {prevLabel}</span>
    </div>
  );
}

export function Reports() {
  const { quotes, loading } = useQuotes();
  const { products } = useProducts();
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);

  // Estado del filtro — default: este año
  const now = new Date();
  const [filter, setFilter] = useState<DateFilter>({
    mode: 'preset',
    preset: 'thisYear',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    from: '',
    to: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await fetchOrgSettings();
        if (!cancelled) setOrgSettings(o);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derivar rango del filtro
  const { start, end, label } = useMemo(() => getPeriodRange(filter), [filter]);
  const prev = useMemo(() => getPreviousPeriod(start, end), [start, end]);

  // Filtrar cotizaciones aceptadas en el período actual y el anterior
  const acceptedInPeriod = useMemo(
    () => filterAcceptedInRange(quotes, start, end),
    [quotes, start, end],
  );
  const acceptedInPrev = useMemo(
    () => filterAcceptedInRange(quotes, prev.start, prev.end),
    [quotes, prev.start, prev.end],
  );

  // Métricas principales (período actual)
  const revenue = useMemo(
    () =>
      acceptedInPeriod.reduce(
        (s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total,
        0,
      ),
    [acceptedInPeriod, products],
  );
  const count = acceptedInPeriod.length;
  const avgTicket = count > 0 ? revenue / count : 0;

  // Métricas período anterior
  const prevRevenue = useMemo(
    () =>
      acceptedInPrev.reduce(
        (s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total,
        0,
      ),
    [acceptedInPrev, products],
  );
  const prevCount = acceptedInPrev.length;
  const prevAvgTicket = prevCount > 0 ? prevRevenue / prevCount : 0;

  // Pipeline activo (snapshot actual, no filtrado — "pipeline" es por definición vigente)
  const pipeline = useMemo(
    () =>
      quotes
        .filter((q) => ['enviada', 'vista', 'negociacion'].includes(q.status))
        .reduce((s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total, 0),
    [quotes, products],
  );

  // Top 5 clientes del período
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const q of acceptedInPeriod) {
      const key = q.client?.id || q.client_id;
      const name = q.client?.company || 'Sin nombre';
      const total = computeQuoteTotals(q.items || [], products, q.discount).total;
      const cur = map.get(key) || { name, total: 0, count: 0 };
      cur.total += total;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [acceptedInPeriod, products]);

  // Top 5 productos del período (por monto aportado — base_price + módulos, sin IGV)
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qty: number }>();
    for (const q of acceptedInPeriod) {
      for (const it of q.items || []) {
        const p = products.find((x) => x.id === it.product_id);
        if (!p) continue;
        let linePre = Number(p.base_price || 0);
        for (const sm of it.modules || []) {
          const m = p.modules?.find((x) => x.id === sm.module_id);
          if (m) linePre += Number(m.price || 0);
        }
        // v2.18: sumar primer período recurrente
        if (p.requires_recurring) {
          for (const sm of it.modules || []) {
            const pm = p.modules?.find((x) => x.id === sm.module_id);
            if (pm && Number(pm.recurring_monthly_price || 0) > 0 && sm.recurring_billing_cycle) {
              const monthly = Number(pm.recurring_monthly_price);
              linePre += sm.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly;
            }
          }
          const anyMod = (it.modules || []).some((sm) => {
            const pm = p.modules?.find((x) => x.id === sm.module_id);
            return pm && Number(pm.recurring_monthly_price || 0) > 0;
          });
          if (!anyMod && Number(p.recurring_monthly_price || 0) > 0 && it.recurring_billing_cycle) {
            const monthly = Number(p.recurring_monthly_price);
            linePre += it.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly;
          }
        }
        const amount = linePre * (it.qty || 1);
        // aplicar descuento proporcional y IGV para reflejar el monto final
        const afterDisc = amount * (1 - (q.discount || 0) / 100);
        const withIgv = afterDisc * 1.18;
        const cur = map.get(p.id) || { name: p.name, total: 0, qty: 0 };
        cur.total += withIgv;
        cur.qty += it.qty || 0;
        map.set(p.id, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [acceptedInPeriod, products]);

  // Años disponibles en las cotizaciones (para el dropdown mes/año)
  const yearsAvailable = useMemo(() => {
    const years = new Set<number>();
    for (const q of quotes) {
      if (q.accepted_at) years.add(new Date(q.accepted_at).getFullYear());
      if (q.created_at) years.add(new Date(q.created_at).getFullYear());
    }
    years.add(now.getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [quotes, now]);

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Reportes" />
        <Loading />
      </div>
    );
  }

  const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
  const showUsd = tc && tc > 0;

  return (
    <div className="fade-in">
      <Topbar title="Reportes" subtitle="Métricas consolidadas del pipeline comercial" />
      <div style={{ padding: '24px 32px' }}>

        {/* ─── Barra de filtros ─── */}
        <div
          className="nx-card"
          style={{
            padding: 16,
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Icon name="filter" size={14} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>
              Período
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--teal-700)',
                fontWeight: 600,
                background: 'var(--teal-50)',
                padding: '3px 10px',
                borderRadius: 999,
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
              · filtrado por fecha de aceptación
            </span>

            {/* Tabs de modo de filtro */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: 'var(--ink-50)', padding: 3, borderRadius: 8 }}>
              {[
                { m: 'preset' as FilterMode, label: 'Presets' },
                { m: 'monthYear' as FilterMode, label: 'Mes/Año' },
                { m: 'range' as FilterMode, label: 'Rango' },
              ].map((t) => (
                <button
                  key={t.m}
                  type="button"
                  onClick={() => setFilter({ ...filter, mode: t.m })}
                  style={{
                    padding: '5px 11px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    borderRadius: 5,
                    border: 'none',
                    background: filter.mode === t.m ? 'white' : 'transparent',
                    color: filter.mode === t.m ? 'var(--teal-700)' : 'var(--ink-500)',
                    cursor: 'pointer',
                    boxShadow: filter.mode === t.m ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Controles según modo */}
          {filter.mode === 'preset' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { p: 'all' as Preset, label: 'Todos' },
                { p: 'thisMonth' as Preset, label: 'Este mes' },
                { p: 'lastMonth' as Preset, label: 'Mes pasado' },
                { p: 'thisYear' as Preset, label: 'Este año' },
                { p: 'lastYear' as Preset, label: 'Año pasado' },
              ]).map((o) => (
                <button
                  key={o.p}
                  type="button"
                  onClick={() => setFilter({ ...filter, preset: o.p })}
                  style={{
                    padding: '7px 14px',
                    fontSize: 12.5,
                    fontWeight: filter.preset === o.p ? 600 : 500,
                    borderRadius: 6,
                    border: '1px solid ' + (filter.preset === o.p ? 'var(--teal-600)' : 'var(--ink-200)'),
                    background: filter.preset === o.p ? 'var(--teal-50)' : 'white',
                    color: filter.preset === o.p ? 'var(--teal-700)' : 'var(--ink-700)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {filter.mode === 'monthYear' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                className="nx-input"
                value={filter.month}
                onChange={(e) => setFilter({ ...filter, month: Number(e.target.value) })}
                style={{ maxWidth: 180 }}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                className="nx-input"
                value={filter.year}
                onChange={(e) => setFilter({ ...filter, year: Number(e.target.value) })}
                style={{ maxWidth: 120 }}
              >
                {yearsAvailable.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    let m = filter.month - 1;
                    let y = filter.year;
                    if (m < 1) { m = 12; y -= 1; }
                    setFilter({ ...filter, month: m, year: y });
                  }}
                  title="Mes anterior"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  ‹
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    let m = filter.month + 1;
                    let y = filter.year;
                    if (m > 12) { m = 1; y += 1; }
                    setFilter({ ...filter, month: m, year: y });
                  }}
                  title="Mes siguiente"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  ›
                </button>
              </div>
            </div>
          )}

          {filter.mode === 'range' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>Desde</label>
                <input
                  type="date"
                  className="nx-input"
                  value={filter.from}
                  onChange={(e) => setFilter({ ...filter, from: e.target.value })}
                  style={{ maxWidth: 170 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>Hasta</label>
                <input
                  type="date"
                  className="nx-input"
                  value={filter.to}
                  onChange={(e) => setFilter({ ...filter, to: e.target.value })}
                  style={{ maxWidth: 170 }}
                />
              </div>
              {(!filter.from || !filter.to) && (
                <span style={{ fontSize: 11.5, color: '#92400E', background: '#FEF3C7', padding: '4px 10px', borderRadius: 5 }}>
                  Completa ambas fechas para filtrar
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── Stats principales con comparativa ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="nx-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
              Ingreso cerrado
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>
              {fmtMoney(revenue)}
            </div>
            <DeltaBadge current={revenue} previous={prevRevenue} prevLabel={prev.label} />
          </div>

          <div className="nx-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
              Cotizaciones cerradas
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>
              {count}
            </div>
            <DeltaBadge current={count} previous={prevCount} prevLabel={prev.label} />
          </div>

          <div className="nx-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
              Ticket promedio
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>
              {fmtMoney(avgTicket)}
            </div>
            <DeltaBadge current={avgTicket} previous={prevAvgTicket} prevLabel={prev.label} />
          </div>

          <div className="nx-card" style={{ padding: 16, background: 'var(--ink-50)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
              Pipeline vigente
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>
              {fmtMoney(pipeline)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>snapshot actual · no filtrado</div>
          </div>
        </div>

        {/* Fila USD */}
        {showUsd && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
                marginBottom: 10,
                fontSize: 11.5,
                color: 'var(--ink-500)',
                fontWeight: 600,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}
            >
              <Icon name="sparkle" size={12} />
              Equivalente en USD · TC referencial S/ {tc!.toFixed(4)} = 1 USD
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 14,
                marginBottom: 20,
              }}
            >
              <Stat label="Ingreso cerrado (USD)" value={fmtUSD(revenue, tc).replace('$ ', '$')} icon="dollar" />
              <Stat label="Ticket promedio (USD)" value={fmtUSD(avgTicket, tc).replace('$ ', '$')} icon="tag" />
              <Stat label="Pipeline vigente (USD)" value={fmtUSD(pipeline, tc).replace('$ ', '$')} icon="chart" />
            </div>
          </>
        )}

        {/* ─── Top 5 clientes + Top 5 productos ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginTop: 20,
            marginBottom: 14,
          }}
        >
          <div className="nx-card nx-card-padded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>Top 5 clientes</h3>
              <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>por ingreso cerrado</span>
            </div>
            {topClients.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)', padding: '12px 0' }}>
                Sin cotizaciones aceptadas en este período.
              </div>
            ) : (
              topClients.map((c, i) => {
                const maxVal = topClients[0].total || 1;
                const pct = (c.total / maxVal) * 100;
                return (
                  <div key={c.name + i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-800)' }}>
                        {i + 1}. {c.name}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'var(--font-display)' }}>
                        {fmtMoney(c.total)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--ink-100)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: 'var(--teal-600)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--ink-500)' }}>
                        {c.count} cot.
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="nx-card nx-card-padded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>Top 5 productos</h3>
              <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>por monto vendido (con IGV)</span>
            </div>
            {topProducts.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)', padding: '12px 0' }}>
                Sin productos vendidos en este período.
              </div>
            ) : (
              topProducts.map((p, i) => {
                const maxVal = topProducts[0].total || 1;
                const pct = (p.total / maxVal) * 100;
                return (
                  <div key={p.name + i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-800)' }}>
                        {i + 1}. {p.name}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'var(--font-display)' }}>
                        {fmtMoney(p.total)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--ink-100)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: 'var(--amber-500, #F59E0B)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--ink-500)' }}>
                        {p.qty} uds.
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Distribución por estado (histórica) ─── */}
        <div className="nx-card nx-card-padded">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>Distribución por estado</h3>
            <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>todas las cotizaciones activas</span>
          </div>
          {['aceptada', 'negociacion', 'vista', 'enviada', 'borrador', 'rechazada'].map((s) => {
            const cnt = quotes.filter((q) => q.status === s).length;
            const pct = quotes.length ? Math.round((cnt / quotes.length) * 100) : 0;
            return (
              <div key={s} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12.5,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ textTransform: 'capitalize', color: 'var(--ink-700)' }}>{s}</span>
                  <span style={{ color: 'var(--ink-500)' }}>
                    {cnt} ({pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: 'var(--ink-100)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: pct + '%',
                      background: 'var(--teal-600)',
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════
// Card: cambiar contraseña propia (cualquier usuario autenticado)
// ═══════════════════════════════════════════════════════════════════════

function ChangePasswordCard({ onSuccess }: { onSuccess: () => void }) {
  const { changePassword } = useAuth();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const submit = async () => {
    setError(null);
    if (newPass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(newPass);
      setNewPass('');
      setConfirmPass('');
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nx-card nx-card-padded" style={{ marginBottom: 14 }}>
      <h3 className="h-display" style={{ margin: '0 0 4px', fontSize: 16 }}>
        Cambiar contraseña
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-500)' }}>
        Escoge una contraseña de al menos 8 caracteres. Asegúrate de guardarla en un gestor de
        contraseñas.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-field">
          <label className="nx-label">Nueva contraseña</label>
          <div style={{ position: 'relative' }}>
            <input
              className="nx-input"
              type={show ? 'text' : 'password'}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink-500)',
                padding: 4,
              }}
              title={show ? 'Ocultar' : 'Mostrar'}
            >
              <Icon name="eye" size={14} />
            </button>
          </div>
        </div>
        <div className="nx-field">
          <label className="nx-label">Confirmar contraseña</label>
          <input
            className="nx-input"
            type={show ? 'text' : 'password'}
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={saving || !newPass || !confirmPass}
        >
          {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
          Actualizar contraseña
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Settings page — con tabs: Perfil / Contraseña / Organización / SMTP
// ═══════════════════════════════════════════════════════════════════════

type SettingsTab = 'profile' | 'password' | 'organization' | 'exchange' | 'smtp' | 'domains';

export function Settings() {
  const { vendor, isSuperAdmin, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  if (!vendor) return null;

  const tabs: { key: SettingsTab; label: string; icon: any; show: boolean }[] = [
    { key: 'profile', label: 'Perfil', icon: 'eye', show: true },
    { key: 'password', label: 'Contraseña', icon: 'settings', show: true },
    { key: 'organization', label: 'Organización', icon: 'building', show: true },
    { key: 'exchange', label: 'TC', icon: 'dollar', show: true },
    { key: 'smtp', label: 'SMTP Server', icon: 'mail', show: isAdmin },
    // v2.21: Dominios permitidos — exclusivo para super_admin
    { key: 'domains', label: 'Dominios permitidos', icon: 'filter', show: isSuperAdmin },
  ];

  return (
    <div className="fade-in">
      <Topbar title="Ajustes" subtitle="Tu perfil y la configuración del sistema" />

      {/* Tabs */}
      <div
        style={{
          padding: '0 32px',
          borderBottom: '1px solid var(--ink-200)',
          background: 'white',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 16px',
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--teal-700)' : 'var(--ink-600)',
                  borderBottom: active ? '2px solid var(--teal-700)' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: -1,
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            );
          })}
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 820 }}>
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'password' && (
          <ChangePasswordCard onSuccess={() => showToast('✓ Contraseña actualizada')} />
        )}
        {activeTab === 'organization' && <OrganizationTab onSaved={() => showToast('✓ Cambios guardados')} />}
        {activeTab === 'exchange' && <ExchangeRateTab onSaved={() => showToast('✓ Tipo de cambio actualizado')} />}
        {activeTab === 'smtp' && isAdmin && (
          <SmtpTab onSaved={() => showToast('✓ Configuración SMTP guardada')} />
        )}
        {activeTab === 'domains' && isSuperAdmin && (
          <AllowedDomainsTab onSaved={() => showToast('✓ Dominio actualizado')} />
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Tab: Perfil ───
function ProfileTab() {
  const { vendor } = useAuth();
  if (!vendor) return null;
  return (
    <div className="nx-card nx-card-padded">
      <h3 className="h-display" style={{ margin: '0 0 12px', fontSize: 16 }}>
        Tu perfil
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Avatar name={vendor.name} color={vendor.color} size={56} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{vendor.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{vendor.email}</div>
          <div style={{ marginTop: 6 }}>
            <span
              className={
                'nx-chip ' +
                (vendor.role === 'super_admin'
                  ? 'chip-teal'
                  : vendor.role === 'admin'
                  ? 'chip-teal'
                  : vendor.role === 'seller'
                  ? 'chip-slate'
                  : 'chip-amber')
              }
            >
              {roleLabel[vendor.role]}
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--ink-500)',
          padding: 12,
          background: 'var(--ink-50)',
          borderRadius: 8,
        }}
      >
        <Icon name="info" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Para cambiar tu rol, contacta a un Super Admin. Puedes cambiar tu contraseña en la pestaña
        "Contraseña".
      </div>
    </div>
  );
}

// ─── Tab: Organización ───
function OrganizationTab({ onSaved }: { onSaved: () => void }) {
  const { isAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    ruc: '',
    email: '',
    phone: '',
    address: '',
    website: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await fetchOrgSettings();
        if (cancelled) return;
        if (o) {
          setOrg(o);
          setForm({
            name: o.name || '',
            legal_name: o.legal_name || '',
            ruc: o.ruc || '',
            email: o.email || '',
            phone: o.phone || '',
            address: o.address || '',
            website: o.website || '',
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgSettings(org.id, form);
      setOrg(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  const dirty =
    org &&
    (form.name !== (org.name || '') ||
      form.legal_name !== (org.legal_name || '') ||
      form.ruc !== (org.ruc || '') ||
      form.email !== (org.email || '') ||
      form.phone !== (org.phone || '') ||
      form.address !== (org.address || '') ||
      form.website !== (org.website || ''));

  return (
    <div className="nx-card nx-card-padded">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>
          Datos de la organización
        </h3>
        {!isAdmin && (
          <span className="nx-chip chip-slate">
            <Icon name="eye" size={11} /> Solo lectura
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-field">
          <label className="nx-label">Nombre comercial</label>
          <input className="nx-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} readOnly={!isAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Razón social</label>
          <input className="nx-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} readOnly={!isAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">RUC</label>
          <input className="nx-input" value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} readOnly={!isAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Teléfono</label>
          <input className="nx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} readOnly={!isAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Email de contacto</label>
          <input className="nx-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} readOnly={!isAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Sitio web</label>
          <input className="nx-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://nexova.pe" readOnly={!isAdmin} />
        </div>
        <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
          <label className="nx-label">Dirección</label>
          <input className="nx-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} readOnly={!isAdmin} />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {isAdmin && dirty && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: SMTP ───
function SmtpTab({ onSaved }: { onSaved: () => void }) {
  const { vendor } = useAuth();
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'Nexova',
    use_tls: true,
    enabled: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSmtpSettings();
        if (cancelled) return;
        if (s) {
          setSmtp(s);
          setForm({
            host: s.host || '',
            port: s.port || 587,
            username: s.username || '',
            password: s.password || '',
            from_email: s.from_email || '',
            from_name: s.from_name || 'Nexova',
            use_tls: s.use_tls ?? true,
            enabled: s.enabled ?? false,
          });
          // Por defecto el test va al from_email (sabemos que existe como buzón real)
          setTestTo(s.from_email || vendor?.email || '');
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!smtp) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSmtpSettings(smtp.id, form);
      setSmtp(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async () => {
    if (!testTo.trim()) {
      setTestResult({ ok: false, msg: 'Ingresa un email destinatario para el test.' });
      return;
    }
    if (!smtp) return;

    // Si el form tiene cambios sin guardar, pedimos guardar primero
    const dirty =
      form.host !== (smtp.host || '') ||
      form.port !== smtp.port ||
      form.username !== (smtp.username || '') ||
      form.password !== (smtp.password || '') ||
      form.from_email !== (smtp.from_email || '') ||
      form.from_name !== (smtp.from_name || '') ||
      form.use_tls !== smtp.use_tls ||
      form.enabled !== smtp.enabled;

    if (dirty) {
      setTestResult({
        ok: false,
        msg: 'Tienes cambios sin guardar. Guarda primero y luego prueba el envío.',
      });
      return;
    }
    if (!form.enabled) {
      setTestResult({
        ok: false,
        msg: 'El envío está deshabilitado. Activa el checkbox y guarda antes de probar.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      await sendEmail({
        to: testTo.trim(),
        subject: 'Nexova · Prueba de envío SMTP',
        html:
          '<div style="font-family:sans-serif;color:#0f172a;"><h2 style="color:#0F766E;">✓ SMTP configurado correctamente</h2>' +
          '<p>Este es un email de prueba enviado desde el panel de Nexova.</p>' +
          '<p style="color:#64748b;font-size:12px;">Si estás recibiendo esto, tu configuración SMTP funciona y la app podrá enviar emails de bienvenida, resets de contraseña y cotizaciones.</p></div>',
        text:
          'SMTP configurado correctamente.\n\n' +
          'Este es un email de prueba desde el panel de Nexova. Si lo recibiste, la config funciona.',
      });
      setTestResult({
        ok: true,
        msg: `Email de prueba enviado a ${testTo.trim()}. Revisa la bandeja (y la carpeta de spam).`,
      });
    } catch (e: any) {
      setTestResult({
        ok: false,
        msg: e?.message || 'No se pudo enviar. Revisa host, puerto, usuario y contraseña.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: 14,
          background: '#fef3c7',
          color: '#92400e',
          borderRadius: 10,
          fontSize: 12.5,
          display: 'flex',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Configuración preparada</div>
          Estos datos se guardan de forma segura para ser usados por una Edge Function que envíe
          emails de cotizaciones y notificaciones. Los emails de "olvidé contraseña" usan el SMTP
          configurado en Supabase Dashboard → Authentication → SMTP Settings (recomendado configurar
          ambos con los mismos datos).
        </div>
      </div>

      <div className="nx-card nx-card-padded">
        <h3 className="h-display" style={{ margin: '0 0 14px', fontSize: 16 }}>
          Servidor SMTP
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Host *</label>
            <input
              className="nx-input"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="smtp.gmail.com, smtp.sendgrid.net, ..."
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Puerto</label>
            <input
              className="nx-input"
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 587 })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Usuario *</label>
            <input
              className="nx-input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="tu@dominio.com"
              autoComplete="off"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Contraseña *</label>
            <input
              className="nx-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Nombre del remitente</label>
            <input
              className="nx-input"
              value={form.from_name}
              onChange={(e) => setForm({ ...form, from_name: e.target.value })}
              placeholder="Nexova"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Email del remitente</label>
            <input
              className="nx-input"
              type="email"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              placeholder="no-reply@nexova.pe"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.use_tls} onChange={(e) => setForm({ ...form, use_tls: e.target.checked })} />
            Usar TLS/STARTTLS (recomendado)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Habilitar envío de emails desde la aplicación
          </label>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
            {error}
          </div>
        )}

        {testResult && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: testResult.ok ? '#ecfdf5' : '#fef2f2',
              color: testResult.ok ? '#065f46' : '#b91c1c',
              borderRadius: 8,
              fontSize: 12.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              lineHeight: 1.5,
            }}
          >
            <Icon name={testResult.ok ? 'check' : 'close'} size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{testResult.msg}</span>
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              padding: 12,
              background: 'var(--ink-50)',
              borderRadius: 10,
              border: '1px solid var(--ink-200)',
            }}
          >
            <label className="nx-label" style={{ marginBottom: 6, display: 'block' }}>
              Probar envío — destinatario
            </label>
            <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginBottom: 8, lineHeight: 1.5 }}>
              💡 Envía a un email que <strong>realmente exista</strong>. Si usas una cuenta externa
              (Gmail, Outlook) casi siempre funciona. Si usas tu dominio (@nexova.pe), asegúrate
              que el buzón esté creado en tu panel de hosting.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="nx-input"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="destinatario@ejemplo.com"
                style={{ flex: 1 }}
                disabled={testing}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={testSmtp}
                disabled={testing || saving || !testTo.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {testing ? <div className="spinner" /> : <Icon name="send" size={14} />}
                Enviar prueba
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Tipo de cambio (TC) ───
// v2.20: presets de providers para configuración sin código
const API_PROVIDER_PRESETS: Record<string, {
  label: string;
  url: string;
  authHeader: string;
  authScheme: string;
  dateParam: string;
  signupUrl: string;
  hint: string;
  warning?: string;
}> = {
  decolecta: {
    label: 'Decolecta (apis.net.pe)',
    url: 'https://api.decolecta.com/v1/tipo-cambio/sunat',
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    dateParam: 'date',
    signupUrl: 'https://apis.net.pe/',
    hint: 'Regístrate gratis en apis.net.pe, ve a "Mi cuenta → Tokens" y copia tu API key.',
  },
  peruapi: {
    label: 'PeruAPI.com',
    url: 'https://peruapi.com/api/tipo_cambio',
    authHeader: 'X-API-KEY',
    authScheme: '',
    dateParam: 'fecha',
    signupUrl: 'https://peruapi.com/panel',
    hint: 'API key disponible en peruapi.com/panel → "Tu API Key".',
    warning: 'PeruAPI.com requiere registrar una IP estática, pero las Edge Functions de Supabase usan IPs dinámicas. Usar este provider con sincronización automática puede fallar con error 401.',
  },
};

function ExchangeRateTab({ onSaved }: { onSaved: () => void }) {
  const { vendor, isAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [autoSyncDirty, setAutoSyncDirty] = useState(false);
  // v2.20: provider config
  const [provider, setProvider] = useState<'decolecta' | 'peruapi' | 'custom'>('decolecta');
  const [apiUrl, setApiUrl] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [authScheme, setAuthScheme] = useState('');
  const [dateParam, setDateParam] = useState('');
  const [providerDirty, setProviderDirty] = useState(false);

  const reload = async () => {
    try {
      const o = await fetchOrgSettings();
      if (o) {
        setOrg(o);
        setRate(o.exchange_rate ? String(o.exchange_rate) : '');
        setApiKey(o.peruapi_key || '');
        setAutoSync(!!o.exchange_rate_auto_sync);
        setApiKeyDirty(false);
        setAutoSyncDirty(false);
        // v2.20
        const prov = (o.exchange_rate_api_provider || 'decolecta') as 'decolecta' | 'peruapi' | 'custom';
        setProvider(prov);
        setApiUrl(o.exchange_rate_api_url || '');
        setAuthHeader(o.exchange_rate_api_auth_header || '');
        setAuthScheme(o.exchange_rate_api_auth_scheme || '');
        setDateParam(o.exchange_rate_api_date_param || '');
        setProviderDirty(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveRate = async () => {
    if (!org || !vendor) return;
    const n = Number(rate);
    if (isNaN(n) || n <= 0) {
      setError('Ingresa un tipo de cambio válido (ej. 3.75).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExchangeRate(org.id, n, vendor.id);
      setOrg(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // v2.20: handler para cambiar provider — si es preset, autocompleta los 4 campos
  const selectProvider = (p: 'decolecta' | 'peruapi' | 'custom') => {
    setProvider(p);
    setProviderDirty(true);
    if (p !== 'custom') {
      const preset = API_PROVIDER_PRESETS[p];
      setApiUrl(preset.url);
      setAuthHeader(preset.authHeader);
      setAuthScheme(preset.authScheme);
      setDateParam(preset.dateParam);
    }
  };

  const saveApiConfig = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const patch: any = {};
      if (apiKeyDirty) patch.peruapi_key = apiKey.trim() || null;
      if (autoSyncDirty) patch.exchange_rate_auto_sync = autoSync;
      if (providerDirty) {
        patch.exchange_rate_api_provider = provider;
        patch.exchange_rate_api_url = apiUrl.trim() || null;
        patch.exchange_rate_api_auth_header = authHeader.trim() || null;
        patch.exchange_rate_api_auth_scheme = authScheme; // puede ser '' válido
        patch.exchange_rate_api_date_param = dateParam.trim() || null;
      }
      const updated = await updatePeruApiConfig(org.id, patch);
      setOrg(updated);
      setApiKeyDirty(false);
      setAutoSyncDirty(false);
      setProviderDirty(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (apiKeyDirty || autoSyncDirty || providerDirty) {
      setSyncResult({
        ok: false,
        msg: 'Guarda primero los cambios antes de sincronizar.',
      });
      return;
    }
    if (!org?.peruapi_key) {
      setSyncResult({ ok: false, msg: 'Configura primero el API key.' });
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await refreshExchangeRateFromApi();
      setSyncResult({
        ok: true,
        msg: `TC actualizado a S/ ${r.rate.toFixed(4)} para la fecha ${r.fecha} (compra S/ ${r.compra.toFixed(4)} / venta S/ ${r.venta.toFixed(4)}).`,
      });
      await reload();
    } catch (e: any) {
      setSyncResult({ ok: false, msg: e?.message || 'No se pudo sincronizar.' });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <Loading />;

  const lastUpdatedText = org?.exchange_rate_updated_at
    ? `Última actualización: ${new Date(org.exchange_rate_updated_at).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'No configurado aún.';

  const lastSyncText = org?.exchange_rate_last_sync_at
    ? `Última sincronización: ${new Date(org.exchange_rate_last_sync_at).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })} · ${org.exchange_rate_last_sync_status || ''}`
    : 'Sin sincronizaciones aún.';

  const sourceLabel =
    org?.exchange_rate_source === 'decolecta'
      ? '🔄 Sincronizado desde SUNAT (apis.net.pe / decolecta)'
      : org?.exchange_rate_source === 'peruapi'
      ? '🔄 Sincronizado desde SUNAT (peruapi.com)'
      : org?.exchange_rate_source === 'custom'
      ? '🔄 Sincronizado desde API personalizado'
      : org?.exchange_rate_source === 'manual'
      ? '✏️ Ingresado manualmente'
      : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Info banner */}
      <div
        style={{
          padding: 14,
          background: '#ecfdf5',
          color: '#065f46',
          borderRadius: 10,
          fontSize: 12.5,
          display: 'flex',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Tipo de cambio PEN → USD</div>
          Se aplica como referencia en las cotizaciones: en cada ítem se muestra el equivalente en
          USD. El cálculo es <strong>monto PEN ÷ TC</strong>. Por ejemplo, si el TC es 3.75 y el
          subtotal es S/ 1,270, el equivalente en USD es $ 338.67.
        </div>
      </div>

      {/* Card 1: Tipo de cambio actual */}
      <div className="nx-card nx-card-padded">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>
            Tipo de cambio actual
          </h3>
          {!isAdmin && (
            <span className="nx-chip chip-slate">
              <Icon name="eye" size={11} /> Solo lectura
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, alignItems: 'end' }}>
          <div className="nx-field">
            <label className="nx-label">PEN por 1 USD</label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-500)',
                  fontSize: 13,
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                S/
              </span>
              <input
                className="nx-input"
                type="number"
                step="0.0001"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="3.7500"
                readOnly={!isAdmin}
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>
          <div
            style={{
              padding: 12,
              background: 'var(--ink-50)',
              borderRadius: 8,
              fontSize: 12.5,
              color: 'var(--ink-600)',
              lineHeight: 1.5,
            }}
          >
            {lastUpdatedText}
            {org?.exchange_rate && (
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Equivalencia: <strong>S/ {Number(org.exchange_rate).toFixed(4)}</strong> = 1 USD
              </div>
            )}
            {sourceLabel && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-500)' }}>
                {sourceLabel}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              borderRadius: 8,
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveRate} disabled={saving}>
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar tipo de cambio manual
            </button>
          </div>
        )}
      </div>

      {/* Card 2: Sincronización automática con proveedor configurable */}
      {isAdmin && (
        <div className="nx-card nx-card-padded">
          <h3 className="h-display" style={{ margin: '0 0 4px', fontSize: 16 }}>
            Sincronización automática con SUNAT
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5 }}>
            Configura tu proveedor de API para traer el tipo de cambio oficial de SUNAT
            automáticamente. El cron actualiza el TC todos los días a las 8 AM hora Lima.
          </p>

          {/* Dropdown de provider */}
          <div className="nx-field">
            <label className="nx-label">Proveedor de API</label>
            <select
              className="nx-input"
              value={provider}
              onChange={(e) => selectProvider(e.target.value as 'decolecta' | 'peruapi' | 'custom')}
            >
              <option value="decolecta">Decolecta (apis.net.pe) — recomendado</option>
              <option value="peruapi">PeruAPI.com</option>
              <option value="custom">Personalizado</option>
            </select>
            {provider !== 'custom' && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 6, lineHeight: 1.5 }}>
                {API_PROVIDER_PRESETS[provider].hint}{' '}
                <a
                  href={API_PROVIDER_PRESETS[provider].signupUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--teal-700)', fontWeight: 600 }}
                >
                  Ir al panel del proveedor →
                </a>
              </div>
            )}
            {provider === 'peruapi' && API_PROVIDER_PRESETS.peruapi.warning && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  borderRadius: 6,
                  fontSize: 11.5,
                  color: '#92400E',
                  lineHeight: 1.5,
                }}
              >
                ⚠ {API_PROVIDER_PRESETS.peruapi.warning}
              </div>
            )}
          </div>

          {/* API Key — siempre editable */}
          <div className="nx-field">
            <label className="nx-label">API key</label>
            <input
              className="nx-input"
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyDirty(true);
              }}
              placeholder={provider === 'decolecta' ? 'apis-token-1.xxxxxxxxxxxxxxxxxxxxxxxx' : 'aa0fa079ea66d38010a6337aaf72b93f'}
              autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            />
          </div>

          {/* Campos técnicos — read-only en preset, editable en custom */}
          <details style={{ marginTop: 4, marginBottom: 8 }}>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--ink-500)',
                fontWeight: 600,
                padding: '6px 0',
              }}
            >
              {provider === 'custom' ? 'Configuración del endpoint (requerida)' : 'Configuración técnica del endpoint (avanzado)'}
            </summary>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: 10,
                padding: 12,
                background: 'var(--ink-50)',
                borderRadius: 8,
                marginTop: 6,
              }}
            >
              <div className="nx-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="nx-label" style={{ fontSize: 11 }}>URL base del endpoint</label>
                <input
                  className="nx-input"
                  type="text"
                  value={apiUrl}
                  onChange={(e) => {
                    setApiUrl(e.target.value);
                    setProviderDirty(true);
                  }}
                  readOnly={provider !== 'custom'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: provider !== 'custom' ? 'white' : undefined }}
                  placeholder="https://api.decolecta.com/v1/tipo-cambio/sunat"
                />
              </div>
              <div className="nx-field" style={{ margin: 0 }}>
                <label className="nx-label" style={{ fontSize: 11 }}>Header de auth</label>
                <input
                  className="nx-input"
                  type="text"
                  value={authHeader}
                  onChange={(e) => {
                    setAuthHeader(e.target.value);
                    setProviderDirty(true);
                  }}
                  readOnly={provider !== 'custom'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: provider !== 'custom' ? 'white' : undefined }}
                  placeholder="Authorization"
                />
              </div>
              <div className="nx-field" style={{ margin: 0 }}>
                <label className="nx-label" style={{ fontSize: 11 }}>Prefix del valor</label>
                <input
                  className="nx-input"
                  type="text"
                  value={authScheme}
                  onChange={(e) => {
                    setAuthScheme(e.target.value);
                    setProviderDirty(true);
                  }}
                  readOnly={provider !== 'custom'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: provider !== 'custom' ? 'white' : undefined }}
                  placeholder="Bearer (o vacío)"
                />
              </div>
              <div className="nx-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="nx-label" style={{ fontSize: 11 }}>Nombre del query param de fecha</label>
                <input
                  className="nx-input"
                  type="text"
                  value={dateParam}
                  onChange={(e) => {
                    setDateParam(e.target.value);
                    setProviderDirty(true);
                  }}
                  readOnly={provider !== 'custom'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: provider !== 'custom' ? 'white' : undefined }}
                  placeholder="date"
                />
                <div style={{ fontSize: 10.5, color: 'var(--ink-500)', marginTop: 4, lineHeight: 1.45 }}>
                  Se enviará como <code style={{ fontSize: 10.5 }}>?{dateParam || 'date'}=YYYY-MM-DD</code> a la URL base.
                </div>
              </div>
            </div>
          </details>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 14,
            }}
          >
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => {
                setAutoSync(e.target.checked);
                setAutoSyncDirty(true);
              }}
              disabled={!apiKey.trim()}
            />
            Sincronizar automáticamente cada día a las 8 AM (Lima)
          </label>

          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: 'var(--ink-50)',
              borderRadius: 8,
              fontSize: 11.5,
              color: 'var(--ink-600)',
              lineHeight: 1.5,
            }}
          >
            {lastSyncText}
          </div>

          {syncResult && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: syncResult.ok ? '#ecfdf5' : '#fef2f2',
                color: syncResult.ok ? '#065f46' : '#b91c1c',
                borderRadius: 8,
                fontSize: 12.5,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                lineHeight: 1.5,
              }}
            >
              <Icon
                name={syncResult.ok ? 'check' : 'close'}
                size={14}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <span>{syncResult.msg}</span>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={syncNow}
              disabled={syncing || saving || !apiKey.trim() || apiKeyDirty || autoSyncDirty || providerDirty}
              title={
                apiKeyDirty || autoSyncDirty || providerDirty
                  ? 'Guarda primero los cambios'
                  : 'Consulta el API y actualiza el TC ahora'
              }
            >
              {syncing ? <div className="spinner" /> : <Icon name="sparkle" size={14} />}
              Sincronizar ahora
            </button>
            <button
              className="btn btn-primary"
              onClick={saveApiConfig}
              disabled={saving || (!apiKeyDirty && !autoSyncDirty && !providerDirty)}
            >
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar configuración
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Dominios permitidos (v2.21) ───
// Solo visible para super_admin. Gestiona la whitelist de dominios que pueden
// registrarse como vendors en la plataforma.
function AllowedDomainsTab({ onSaved }: { onSaved: () => void }) {
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const d = await fetchAllowedDomains();
      setDomains(d);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los dominios.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async () => {
    const raw = newDomain.trim();
    if (!raw) return;
    setSaving(true);
    setError(null);
    try {
      await addAllowedDomain(raw);
      setNewDomain('');
      await reload();
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo agregar el dominio.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (d: AllowedDomain) => {
    if (!confirm(`¿Quitar "@${d.domain}" de los dominios permitidos?\n\nLos usuarios con este dominio que ya existen no se ven afectados, pero no podrás crear nuevos usuarios con este dominio.`)) return;
    setRemovingId(d.id);
    setError(null);
    try {
      await removeAllowedDomain(d.id);
      await reload();
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar.');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <Loading />;

  const normalized = normalizeDomain(newDomain);
  const preview = normalized ? `@${normalized}` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Info banner */}
      <div
        style={{
          padding: 14,
          background: '#eff6ff',
          color: '#1e40af',
          borderRadius: 10,
          fontSize: 12.5,
          lineHeight: 1.5,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <Icon name="filter" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Control de acceso por dominio.</strong> Solo los emails con estos dominios podrán
          crearse como usuarios en la plataforma. Los usuarios existentes con dominios fuera de la
          lista siguen funcionando — la validación se aplica solo al crear nuevos usuarios.
          Si la lista está vacía, no se aplica restricción.
        </div>
      </div>

      {/* Card: listado */}
      <div className="nx-card nx-card-padded">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>Dominios permitidos</h3>
          <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
            {domains.length === 0
              ? 'Sin restricción activa'
              : `${domains.length} dominio${domains.length !== 1 ? 's' : ''} permitido${domains.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Lista de chips */}
        {domains.length === 0 ? (
          <div
            style={{
              padding: '16px 14px',
              background: 'var(--ink-50)',
              borderRadius: 8,
              fontSize: 12.5,
              color: 'var(--ink-500)',
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            Aún no hay dominios configurados. Cualquier email puede registrarse.
            <br />
            <span style={{ fontSize: 11.5 }}>
              Agrega al menos uno abajo para activar la whitelist.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {domains.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--teal-50)',
                  border: '1px solid var(--teal-100)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--teal-700)',
                    }}
                  >
                    @{d.domain}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-500)' }}>
                    añadido {fmtDate(d.created_at)}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemove(d)}
                  disabled={removingId === d.id}
                  title="Quitar dominio"
                  style={{ color: '#dc2626' }}
                >
                  {removingId === d.id ? <div className="spinner" /> : <Icon name="trash" size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Form: agregar dominio */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--ink-100)' }}>
          <label className="nx-label" style={{ fontSize: 12 }}>Agregar nuevo dominio</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
            <div
              style={{
                position: 'relative',
                flex: 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-400)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              >
                @
              </span>
              <input
                className="nx-input"
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !saving && newDomain.trim()) {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="nexova.pe"
                autoComplete="off"
                style={{
                  paddingLeft: 26,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={saving || !newDomain.trim()}
            >
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Agregar
            </button>
          </div>
          {preview && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 6 }}>
              Se guardará como: <strong style={{ fontFamily: 'var(--font-mono)' }}>{preview}</strong>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              borderRadius: 8,
              fontSize: 12.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Icon name="close" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

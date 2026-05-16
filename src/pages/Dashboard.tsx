import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, StatusChip, Topbar } from '../components/UI';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useVendors } from '../hooks/useVendors';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtDate, fmtMoney } from '../lib/utils';
import type { QuoteStatus } from '../lib/types';

interface DashboardProps {
  onOpenQuote: (id: string) => void;
  onNewQuote: () => void;
}

export function Dashboard({ onOpenQuote, onNewQuote }: DashboardProps) {
  const { vendor, isAdmin } = useAuth();
  const { quotes, loading: loadingQ, error: errorQ, reload: reloadQ } = useQuotes();
  const { products, loading: loadingP, error: errorP, reload: reloadP } = useProducts();
  const { vendors } = useVendors();
  const [filter, setFilter] = useState<QuoteStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const visibleQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (filter !== 'all' && q.status !== filter) return false;
      if (query) {
        const s = query.toLowerCase();
        if (
          !q.code.toLowerCase().includes(s) &&
          !(q.client?.company || '').toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [quotes, filter, query]);

  // v2.28: el Dashboard suma valores que pueden venir de cotizaciones en PEN
  // o USD. Convertimos todo a soles usando el TC snapshot de cada quote.
  // Si una cotización USD no tiene exchange_rate, no se puede sumar — se omite
  // (es legacy o estado inconsistente; el contador 'total' la sigue contando).
  const metrics = useMemo(() => {
    let totalValue = 0;
    let won = 0;
    let active = 0;
    for (const q of quotes) {
      const qCurrency = q.currency || 'PEN';
      const totals = computeQuoteTotals(
        q.items || [],
        products,
        q.discount,
        qCurrency,
        q.exchange_rate,
      );
      // Convertir el total a soles para agregar.
      let totalInPEN = totals.total;
      if (qCurrency === 'USD') {
        totalInPEN = q.exchange_rate && q.exchange_rate > 0
          ? totals.total * q.exchange_rate
          : 0; // sin TC no podemos sumar
      }
      totalValue += totalInPEN;
      if (q.status === 'aceptada') won++;
      if (['enviada', 'vista', 'negociacion'].includes(q.status)) active++;
    }
    return {
      total: quotes.length,
      totalValue,
      winRate: quotes.length ? Math.round((won / quotes.length) * 100) : 0,
      active,
    };
  }, [quotes, products]);

  if (loadingQ || loadingP) {
    return (
      <div className="fade-in">
        <Topbar title={isAdmin ? 'Panel general' : `Hola, ${vendor?.name.split(' ')[0]} 👋`} />
        <Loading label="Cargando cotizaciones…" />
      </div>
    );
  }

  if (errorQ || errorP) {
    const err = errorQ || errorP;
    return (
      <div className="fade-in">
        <Topbar title={isAdmin ? 'Panel general' : `Hola, ${vendor?.name.split(' ')[0]} 👋`} />
        <div
          style={{
            padding: '48px 32px',
            maxWidth: 600,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              padding: 24,
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: 12,
              color: '#991B1B',
              marginBottom: 16,
            }}
          >
            <Icon name="info" size={32} style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              No pudimos cargar los datos
            </div>
            <div style={{ fontSize: 13 }}>{err?.message || 'Error desconocido'}</div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (errorQ) reloadQ();
              if (errorP) reloadP();
            }}
          >
            <Icon name="sparkle" size={14} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Topbar
        title={isAdmin ? 'Panel general' : `Hola, ${vendor?.name.split(' ')[0]} 👋`}
        subtitle={
          isAdmin
            ? 'Resumen consolidado de todo el equipo comercial'
            : 'Este es el resumen de tu actividad comercial'
        }
        actions={
          <button className="btn btn-primary btn-sm" onClick={onNewQuote}>
            <Icon name="plus" size={14} /> Nueva cotización
          </button>
        }
      />

      <div style={{ padding: '24px 32px 48px' }}>
        {/* Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 22,
          }}
        >
          <Stat label="Cotizaciones" value={metrics.total} icon="file" />
          <Stat
            label="Valor total (S/)"
            value={fmtMoney(metrics.totalValue, 'PEN').replace('S/ ', 'S/')}
            icon="dollar"
          />
          <Stat label="Tasa de cierre" value={metrics.winRate + '%'} icon="chart" />
          <Stat label="En seguimiento" value={metrics.active} icon="clock" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
          {/* Table */}
          <div className="nx-card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: '1px solid var(--ink-200)',
              }}
            >
              <h3
                className="h-display"
                style={{ margin: 0, fontSize: 15.5, fontWeight: 700, flex: 1 }}
              >
                Cotizaciones recientes
              </h3>
              <div style={{ position: 'relative' }}>
                <Icon
                  name="search"
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-400)',
                  }}
                />
                <input
                  className="nx-input"
                  placeholder="Buscar..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ padding: '7px 10px 7px 30px', fontSize: 12.5, width: 200, height: 34 }}
                />
              </div>
              <select
                className="nx-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                style={{
                  padding: '7px 28px 7px 10px',
                  fontSize: 12.5,
                  height: 34,
                  width: 150,
                }}
              >
                <option value="all">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="enviada">Enviada</option>
                <option value="vista">Vista</option>
                <option value="negociacion">Negociación</option>
                <option value="aceptada">Aceptada</option>
                <option value="rechazada">Rechazada</option>
              </select>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--ink-50)',
                    color: 'var(--ink-500)',
                    fontSize: 11,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  <th style={{ textAlign: 'left', padding: '10px 20px' }}>Código</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Cliente</th>
                  {isAdmin && (
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Vendedor</th>
                  )}
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Estado</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Fecha</th>
                  <th style={{ width: 40, padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleQuotes.map((q) => {
                  const qCurrency = q.currency || 'PEN';
                  const totals = computeQuoteTotals(
                    q.items || [],
                    products,
                    q.discount,
                    qCurrency,
                    q.exchange_rate,
                  );
                  const v = q.vendor;
                  return (
                    <tr
                      key={q.id}
                      onClick={() => onOpenQuote(q.id)}
                      style={{
                        borderTop: '1px solid var(--ink-100)',
                        cursor: 'pointer',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--teal-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 20px' }}>
                        <span
                          className="mono"
                          style={{ fontSize: 12.5, color: 'var(--teal-700)', fontWeight: 600 }}
                        >
                          {q.code}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                          {q.client?.company}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                          {q.client?.contact}
                        </div>
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '12px 12px' }}>
                          {v ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={v.name} color={v.color} size={24} />
                              <span style={{ fontSize: 12.5 }}>{v.name.split(' ')[0]}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink-400)' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding: '12px 12px' }}>
                        <StatusChip status={q.status} />
                      </td>
                      <td
                        style={{
                          padding: '12px 12px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                        }}
                      >
                        {fmtMoney(totals.total, qCurrency)}
                      </td>
                      <td style={{ padding: '12px 12px', color: 'var(--ink-500)', fontSize: 12.5 }}>
                        {fmtDate(q.created_at)}
                      </td>
                      <td style={{ padding: '12px 12px', color: 'var(--ink-400)' }}>
                        <Icon name="chevRight" size={14} />
                      </td>
                    </tr>
                  );
                })}
                {visibleQuotes.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="empty-state">
                      {quotes.length === 0
                        ? 'Aún no hay cotizaciones. Crea la primera con "Nueva cotización".'
                        : 'No se encontraron cotizaciones con estos filtros.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, var(--teal-900), var(--teal-700))',
                  color: 'white',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    opacity: 0.75,
                    marginBottom: 6,
                  }}
                >
                  <Icon name="sparkle" size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                  NEXOVA INSIGHTS · IA
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 14.5,
                    lineHeight: 1.35,
                  }}
                >
                  Conclusiones de tu pipeline
                </div>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {generateInsights(quotes, products).map((i, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: 10,
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: 'var(--ink-700)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '.08em',
                        padding: '3px 7px',
                        height: 20,
                        borderRadius: 4,
                        flexShrink: 0,
                        background: i.bg,
                        color: i.color,
                      }}
                    >
                      {i.tag}
                    </span>
                    <span style={{ flex: 1 }}>{i.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vendor leaderboard (visible a todos) */}
            {vendors.length > 0 && (
              <div className="nx-card" style={{ padding: 16 }}>
                <h4
                  className="h-display"
                  style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700 }}
                >
                  Equipo comercial
                </h4>
                {vendors.map((v) => {
                  const vQuotes = quotes.filter((q) => q.vendor_id === v.id);
                  const closed = vQuotes.filter((q) => q.status === 'aceptada').length;
                  return (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 0',
                        fontSize: 12.5,
                      }}
                    >
                      <Avatar name={v.name} color={v.color} size={26} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                          {closed} cerradas · {vQuotes.length} cotiz.
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Pequeño generador de insights basado en los datos
function generateInsights(
  quotes: any[],
  _products: any[]
): { tag: string; color: string; bg: string; text: string }[] {
  const out: { tag: string; color: string; bg: string; text: string }[] = [];

  const pending = quotes.filter((q) =>
    ['enviada', 'vista', 'negociacion'].includes(q.status)
  );
  const unviewed = quotes.filter((q) => q.status === 'enviada' && q.views === 0);
  const highViews = quotes.filter((q) => q.views >= 3 && q.status !== 'aceptada');
  const negotiating = quotes.filter((q) => q.status === 'negociacion');

  if (highViews.length > 0) {
    out.push({
      tag: 'OPORTUNIDAD',
      color: 'var(--success)',
      bg: 'var(--success-soft)',
      text: `${highViews[0].client?.company || 'Un cliente'} abrió tu cotización ${highViews[0].views} veces sin responder. Sugerencia: seguimiento personalizado.`,
    });
  }
  if (negotiating.length > 0) {
    out.push({
      tag: 'ATENCIÓN',
      color: 'var(--danger)',
      bg: 'var(--danger-soft)',
      text: `Tienes ${negotiating.length} cotizaci${
        negotiating.length === 1 ? 'ón' : 'ones'
      } en negociación. Considera agendar llamadas de cierre.`,
    });
  }
  if (unviewed.length > 0) {
    out.push({
      tag: 'RECORDATORIO',
      color: '#B45309',
      bg: 'var(--accent-soft)',
      text: `${unviewed.length} cotizaci${
        unviewed.length === 1 ? 'ón enviada aún no ha sido vista' : 'ones enviadas aún no han sido vistas'
      } por los clientes.`,
    });
  }
  if (out.length === 0) {
    out.push({
      tag: 'TIP',
      color: 'var(--teal-700)',
      bg: 'var(--teal-50)',
      text:
        pending.length > 0
          ? `Tienes ${pending.length} cotización${pending.length === 1 ? '' : 'es'} en seguimiento.`
          : 'Todo al día. Empieza con una nueva cotización cuando estés listo.',
    });
  }
  return out.slice(0, 3);
}

import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, NexovaLogo } from '../components/UI';
import { fetchQuoteByPublicToken, incrementQuoteView, fetchProductsWithModules, fetchOrgSettings } from '../lib/db';
import { useBranding } from '../contexts/BrandingContext';
import { computeQuoteTotals, fmtDate, fmtMoney, fmtUSD, getRecurringCharges, getRecurringHeaderText, getRecurringRowSubtext } from '../lib/utils';
import type { OrganizationSettings, Product, Quote } from '../lib/types';

export function PublicLink({ token }: { token: string }) {
  const { branding } = useBranding();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [q, ps, org] = await Promise.all([
          fetchQuoteByPublicToken(token),
          fetchProductsWithModules(),
          fetchOrgSettings().catch(() => null),
        ]);
        setQuote(q);
        setProducts(ps);
        setOrgSettings(org);
        if (q) await incrementQuoteView(token);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <Loading label="Cargando cotización…" />;
  if (!quote) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ink-900)',
          color: 'white',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Cotización no encontrada</h1>
          <p style={{ color: 'rgba(255,255,255,.6)' }}>
            El enlace no es válido o la cotización fue eliminada.
          </p>
        </div>
      </div>
    );
  }

  const totals = computeQuoteTotals(quote.items || [], products, quote.discount);
  const recurring = getRecurringCharges(quote.items || [], products);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, var(--ink-100), var(--ink-50) 30%)',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: 'white',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '32px 40px',
            background: 'linear-gradient(135deg, var(--teal-900) 0%, var(--teal-700) 100%)',
            color: 'white',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <NexovaLogo size={36} light />
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '.14em',
                  fontWeight: 700,
                  opacity: 0.75,
                }}
              >
                COTIZACIÓN
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>
                {quote.code}
              </div>
            </div>
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Propuesta comercial para {quote.client?.company}
          </h1>
          <div
            style={{
              marginTop: 10,
              color: 'rgba(255,255,255,.78)',
              fontSize: 13.5,
              display: 'flex',
              gap: 16,
            }}
          >
            <span>Emitida el {fmtDate(quote.created_at)}</span>
            <span>·</span>
            <span>Válida hasta {fmtDate(quote.valid_until)}</span>
          </div>
        </div>

        <div style={{ padding: '36px 40px' }}>
          {quote.proposal_text && (
            <div
              style={{
                padding: 20,
                background: 'var(--teal-50)',
                borderRadius: 10,
                marginBottom: 28,
                fontSize: 14,
                lineHeight: 1.65,
                color: 'var(--ink-800)',
                whiteSpace: 'pre-wrap',
                borderLeft: '4px solid var(--teal-600)',
              }}
            >
              {quote.proposal_text}
            </div>
          )}

          <h3 className="h-display" style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
            Inversión detallada
          </h3>
          {(quote.items || []).map((it) => {
            const p = products.find((x) => x.id === it.product_id);
            if (!p) return null;
            let line = Number(p.base_price || 0);
            for (const sm of it.modules) {
              const m = p.modules?.find((x) => x.id === sm.module_id);
              if (m) line += Number(m.price || 0);
            }
            line *= it.qty;
            // v2.18: sumar primer período recurrente al total mostrado del item
            if (p.requires_recurring) {
              for (const sm of it.modules) {
                const pm = p.modules?.find((x) => x.id === sm.module_id);
                if (pm && Number(pm.recurring_monthly_price || 0) > 0 && sm.recurring_billing_cycle) {
                  const monthly = Number(pm.recurring_monthly_price);
                  line += (sm.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly) * it.qty;
                }
              }
              const anyMod = it.modules.some((sm) => {
                const pm = p.modules?.find((x) => x.id === sm.module_id);
                return pm && Number(pm.recurring_monthly_price || 0) > 0;
              });
              if (!anyMod && Number(p.recurring_monthly_price || 0) > 0 && it.recurring_billing_cycle) {
                const monthly = Number(p.recurring_monthly_price);
                line += (it.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly) * it.qty;
              }
            }
            return (
              <div
                key={it.id}
                style={{
                  padding: '16px 0',
                  borderBottom: '1px solid var(--ink-200)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 14,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink-900)', fontSize: 15 }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>
                      {p.description}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 17,
                        fontWeight: 700,
                      }}
                    >
                      {fmtMoney(line)}
                    </div>
                    {orgSettings?.exchange_rate && Number(orgSettings.exchange_rate) > 0 && (
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--ink-500)',
                          marginTop: 2,
                        }}
                      >
                        {fmtUSD(line, Number(orgSettings.exchange_rate))}
                      </div>
                    )}
                  </div>
                </div>
                {it.modules.length > 0 && (
                  <ul
                    style={{
                      margin: '10px 0 0 20px',
                      padding: 0,
                      fontSize: 12.5,
                      color: 'var(--ink-600)',
                    }}
                  >
                    {it.modules.map((sm) => {
                      const m = p.modules?.find((x) => x.id === sm.module_id);
                      if (!m) return null;
                      const hasRec = p.requires_recurring && Number(m.recurring_monthly_price || 0) > 0;
                      const cycle = sm.recurring_billing_cycle;
                      const firstPeriod = hasRec && cycle
                        ? (cycle === 'annual' ? Number(m.recurring_monthly_price) * 12 : Number(m.recurring_monthly_price)) * it.qty
                        : 0;
                      const periodLabel = cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes';
                      return (
                        <li key={sm.module_id} style={{ marginBottom: 3 }}>
                          {m.name} <span style={{ color: 'var(--ink-400)' }}>+{fmtMoney(m.price)}</span>
                          {hasRec && cycle && (
                            <span style={{ color: 'var(--ink-500)' }}>
                              {' '}· {periodLabel} <span style={{ color: 'var(--ink-400)' }}>+{fmtMoney(firstPeriod)}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {/* Fallback item-level recurring */}
                    {p.requires_recurring &&
                      !it.modules.some((sm) => {
                        const pm = p.modules?.find((x) => x.id === sm.module_id);
                        return pm && Number(pm.recurring_monthly_price || 0) > 0;
                      }) &&
                      Number(p.recurring_monthly_price || 0) > 0 &&
                      it.recurring_billing_cycle && (
                        <li style={{ marginBottom: 3 }}>
                          <span style={{ color: 'var(--ink-500)' }}>
                            Renovación · {it.recurring_billing_cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes'}
                          </span>{' '}
                          <span style={{ color: 'var(--ink-400)' }}>
                            +{fmtMoney(
                              (it.recurring_billing_cycle === 'annual'
                                ? Number(p.recurring_monthly_price) * 12
                                : Number(p.recurring_monthly_price)) * it.qty
                            )}
                          </span>
                        </li>
                      )}
                  </ul>
                )}
              </div>
            );
          })}

          <div
            style={{
              marginTop: 24,
              padding: 20,
              background: 'var(--ink-900)',
              color: 'white',
              borderRadius: 12,
            }}
          >
            {(() => {
              const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
              const hasTc = !!(tc && tc > 0);
              // Grid: label | S/ | USD (si hay TC). Si no hay TC, solo label | S/.
              const gridCols = hasTc ? '1fr auto auto' : '1fr auto';
              const headerStyle = {
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.1em',
                opacity: 0.45,
                textAlign: 'right' as const,
                paddingBottom: 4,
              };
              return (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      columnGap: 20,
                      rowGap: 6,
                      fontSize: 13,
                      alignItems: 'baseline',
                    }}
                  >
                    {/* Headers de columna */}
                    <span />
                    <span style={headerStyle}>S/</span>
                    {hasTc && <span style={headerStyle}>USD</span>}

                    {/* Subtotal */}
                    <span style={{ opacity: 0.7 }}>Subtotal</span>
                    <span style={{ textAlign: 'right' }}>{fmtMoney(totals.subtotal)}</span>
                    {hasTc && (
                      <span style={{ textAlign: 'right', opacity: 0.55 }}>
                        {fmtUSD(totals.subtotal, tc)}
                      </span>
                    )}

                    {/* Descuento */}
                    {quote.discount > 0 && (
                      <>
                        <span style={{ color: 'var(--teal-300)' }}>
                          Descuento ({quote.discount}%)
                        </span>
                        <span style={{ textAlign: 'right', color: 'var(--teal-300)' }}>
                          - {fmtMoney(totals.discountAmt)}
                        </span>
                        {hasTc && (
                          <span
                            style={{
                              textAlign: 'right',
                              color: 'var(--teal-300)',
                              opacity: 0.8,
                            }}
                          >
                            - {fmtUSD(totals.discountAmt, tc)}
                          </span>
                        )}
                      </>
                    )}

                    {/* IGV */}
                    <span style={{ opacity: 0.7 }}>IGV (18%)</span>
                    <span style={{ textAlign: 'right', opacity: 0.7 }}>
                      {fmtMoney(totals.igv)}
                    </span>
                    {hasTc && (
                      <span style={{ textAlign: 'right', opacity: 0.5 }}>
                        {fmtUSD(totals.igv, tc)}
                      </span>
                    )}
                  </div>

                  {/* Total — destacado, en bloque separado */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid rgba(255,255,255,.15)',
                    }}
                  >
                    <span style={{ fontSize: 13.5, opacity: 0.8 }}>Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 28,
                          fontWeight: 700,
                        }}
                      >
                        {fmtMoney(totals.total)}
                      </div>
                      {hasTc && (
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 13,
                            fontWeight: 500,
                            opacity: 0.6,
                            marginTop: 4,
                          }}
                        >
                          Referencial en dólares - {fmtUSD(totals.total, tc)}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Pagos recurrentes (cargos periódicos posteriores a la implementación) */}
          {recurring.length > 0 && (() => {
            const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
            const hasTc = !!(tc && tc > 0);
            return (
              <div
                style={{
                  marginTop: 20,
                  padding: 18,
                  background: 'var(--ink-50)',
                  borderRadius: 10,
                  borderLeft: '3px solid #F59E0B',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--ink-900)',
                    marginBottom: 4,
                  }}
                >
                  Pagos recurrentes
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-500)',
                    marginBottom: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {getRecurringHeaderText(recurring)}
                </div>
                {recurring.map((r, idx) => {
                  const periodLabel = r.cycle === 'annual' ? 'año' : 'mes';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: '10px 0',
                        borderTop: idx > 0 ? '1px dashed var(--ink-200)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink-900)' }}>
                          {r.label}
                          {r.qty > 1 && (
                            <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>
                              {' '}× {r.qty}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
                          {r.product_name} · {getRecurringRowSubtext(r)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--ink-900)',
                          }}
                        >
                          {fmtMoney(r.renewal_amount)} / {periodLabel}
                        </div>
                        {hasTc && (
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--ink-500)',
                              marginTop: 2,
                            }}
                          >
                            {fmtUSD(r.renewal_amount, tc!)} / {periodLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div
            style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns:
                orgSettings?.exchange_rate && Number(orgSettings.exchange_rate) > 0
                  ? '1fr 1fr 1fr'
                  : '1fr 1fr',
              gap: 16,
              fontSize: 13,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  color: 'var(--ink-400)',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Tiempo de implementación
              </div>
              <div style={{ fontWeight: 600 }}>{quote.delivery_weeks} semanas</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  color: 'var(--ink-400)',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Condiciones de pago
              </div>
              <div style={{ fontWeight: 600 }}>{quote.payment_terms || '—'}</div>
            </div>
            {orgSettings?.exchange_rate && Number(orgSettings.exchange_rate) > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    color: 'var(--ink-400)',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Tipo de cambio referencial
                </div>
                <div style={{ fontWeight: 600 }}>
                  S/ {Number(orgSettings.exchange_rate).toFixed(4)} = 1 USD
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 32,
              padding: 20,
              background: 'var(--ink-50)',
              borderRadius: 10,
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--ink-600)',
            }}
          >
            ¿Preguntas? Contacta directamente con{' '}
            <strong style={{ color: 'var(--ink-900)' }}>{quote.vendor?.name}</strong>{' '}
            en{' '}
            <a
              href={`mailto:${quote.vendor?.email}`}
              style={{ color: 'var(--teal-700)', fontWeight: 600 }}
            >
              {quote.vendor?.email}
            </a>
          </div>
        </div>

        <div
          style={{
            padding: '16px 40px',
            background: 'var(--ink-900)',
            color: 'rgba(255,255,255,.55)',
            fontSize: 11,
            textAlign: 'center',
          }}
        >
          <Icon name="sparkle" size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Generado por {branding.commercial_name || orgSettings?.name || 'Nexova'}
          {orgSettings?.email && ` · ${orgSettings.email}`}
        </div>
      </div>
    </div>
  );
}

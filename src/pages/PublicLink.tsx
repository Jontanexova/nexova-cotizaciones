import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, NexovaLogo } from '../components/UI';
import { fetchQuoteByPublicToken, incrementQuoteView, fetchProductsWithModules, fetchOrgSettings } from '../lib/db';
import { computeQuoteTotals, fmtDate, fmtMoney, fmtUSD } from '../lib/utils';
import type { OrganizationSettings, Product, Quote } from '../lib/types';

export function PublicLink({ token }: { token: string }) {
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
            for (const mid of it.module_ids) {
              const m = p.modules?.find((x) => x.id === mid);
              if (m) line += Number(m.price || 0);
            }
            line *= it.qty;
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
                {it.module_ids.length > 0 && (
                  <ul
                    style={{
                      margin: '10px 0 0 20px',
                      padding: 0,
                      fontSize: 12.5,
                      color: 'var(--ink-600)',
                    }}
                  >
                    {it.module_ids.map((mid) => {
                      const m = p.modules?.find((x) => x.id === mid);
                      return m ? (
                        <li key={mid} style={{ marginBottom: 3 }}>
                          {m.name} <span style={{ color: 'var(--ink-400)' }}>+{fmtMoney(m.price)}</span>
                        </li>
                      ) : null;
                    })}
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
              const hasTc = tc && tc > 0;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ opacity: 0.7 }}>Subtotal</span>
                    <span>
                      {fmtMoney(totals.subtotal)}
                      {hasTc && (
                        <span style={{ opacity: 0.55, marginLeft: 8, fontSize: 12 }}>
                          · {fmtUSD(totals.subtotal, tc)}
                        </span>
                      )}
                    </span>
                  </div>
                  {quote.discount > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginTop: 6,
                        color: 'var(--teal-300)',
                      }}
                    >
                      <span>Descuento ({quote.discount}%)</span>
                      <span>- {fmtMoney(totals.discountAmt)}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginTop: 6,
                      opacity: 0.7,
                    }}
                  >
                    <span>IGV (18%)</span>
                    <span>{fmtMoney(totals.igv)}</span>
                  </div>
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
                            fontSize: 14,
                            fontWeight: 600,
                            opacity: 0.6,
                            marginTop: 2,
                          }}
                        >
                          {fmtUSD(totals.total, tc)}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

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
          Generado con Nexova · contacto@nexova.pe
        </div>
      </div>
    </div>
  );
}

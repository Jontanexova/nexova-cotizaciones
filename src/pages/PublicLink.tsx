/**
 * v2.25 — Vista pública de la cotización por token (lo que ve el cliente).
 *
 * Layout espejo del PDF (src/lib/quotePdf.ts):
 *  - Header band con brand + contacto
 *  - Title bar "COTIZACIÓN / PROFORMA" + N° COTIZACIÓN
 *  - EMISOR / CLIENTE (2 columnas)
 *  - DESCRIPCIÓN DEL PROYECTO (3 chips)  — opcional, solo si hay datos IA
 *  - JUSTIFICACIÓN Y CARACTERÍSTICAS     — fallback a proposal_text
 *  - DETALLE DE SERVICIOS Y COSTOS (tabla numerada)
 *  - TOTALES (right-aligned, sin cuadro oscuro, con S/ | USD)
 *  - "Son: …" monto en palabras
 *  - PAGOS RECURRENTES (ink-50 + borde izquierdo ámbar)
 *  - 5 chips de condiciones (Moneda / Forma de pago / Validez / Entrega / TC)
 *  - NOTAS Y CONDICIONES (numeradas)
 *  - APROBACIÓN DE COTIZACIÓN (doble bloque de firma)
 */
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/UI';
import {
  fetchOrgSettings,
  fetchProductsWithModules,
  fetchQuoteByPublicToken,
  incrementQuoteView,
} from '../lib/db';
import { useBranding } from '../contexts/BrandingContext';
import {
  computeQuoteTotals,
  fmtDateNumeric,
  fmtMoney,
  fmtUSD,
  formalRoleLabel,
  getRecurringCharges,
  getRecurringHeaderText,
  getRecurringRowSubtext,
  moneyToSonText,
} from '../lib/utils';
import type { OrganizationSettings, Product, Quote } from '../lib/types';

// Labels con espaciado tipo "E M I S O R" — helper visual
function SpacedLabel({ children, color = 'var(--teal-900)', size = 10 }: {
  children: React.ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '.18em',
        color,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

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
  const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
  const hasTc = !!(tc && tc > 0);

  const justText =
    (quote.justification_text && quote.justification_text.trim()) ||
    (quote.proposal_text && quote.proposal_text.trim()) ||
    '';

  const hasAnyChip = !!(
    quote.solution_summary ||
    quote.scope_summary ||
    quote.modality_summary
  );

  const termsRaw =
    (quote.terms && quote.terms.trim()) ||
    (orgSettings?.default_terms && orgSettings.default_terms.trim()) ||
    '';
  const termsList = termsRaw
    ? termsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];

  const brandName = (orgSettings?.name || 'NEXOVA').toUpperCase();
  const tagline =
    orgSettings?.legal_name && orgSettings.legal_name !== orgSettings.name
      ? orgSettings.legal_name
      : 'SOFTWARE EMPRESARIAL';

  const clientLines = [
    quote.client?.address,
    quote.client?.email,
    quote.client?.phone,
  ].filter(Boolean);

  const emisorLines = [
    orgSettings?.address,
    orgSettings?.email && orgSettings?.website
      ? `${orgSettings.email} · ${orgSettings.website}`
      : orgSettings?.email || orgSettings?.website,
  ].filter(Boolean);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, var(--ink-100), var(--ink-50) 30%)',
        padding: '40px 16px',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: 'white',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          padding: '48px 54px',
        }}
      >
        {/* ▸ Header band */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                fontWeight: 700,
                color: 'var(--teal-900)',
                letterSpacing: '.02em',
                lineHeight: 1,
              }}
            >
              {brandName}
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.28em',
                color: 'var(--ink-500)',
                marginTop: 5,
                fontWeight: 600,
              }}
            >
              {tagline.toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.55 }}>
            {orgSettings?.phone && <div>{orgSettings.phone}</div>}
            {orgSettings?.email && <div>{orgSettings.email}</div>}
            {orgSettings?.website && (
              <div style={{ color: 'var(--teal-700)', fontWeight: 600 }}>{orgSettings.website}</div>
            )}
          </div>
        </div>

        {/* Doble línea teal */}
        <hr style={{ border: 0, borderTop: '1.5px solid var(--teal-700)', margin: '16px 0 0' }} />
        <hr style={{ border: 0, borderTop: '0.5px solid var(--teal-700)', margin: '2px 0 22px' }} />

        {/* ▸ Title bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--ink-900)',
                letterSpacing: '.02em',
              }}
            >
              COTIZACIÓN / PROFORMA
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
              Propuesta comercial formal
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 200 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.18em',
                color: '#b91c1c',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              N° COTIZACIÓN
            </div>
            <div
              className="mono"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--ink-900)',
                marginTop: 2,
              }}
            >
              {quote.code}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-700)', marginTop: 5 }}>
              Fecha: {fmtDateNumeric(quote.created_at)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-700)' }}>
              Válido hasta: {fmtDateNumeric(quote.valid_until)}
            </div>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '0.5px solid var(--ink-200)', margin: '22px 0 18px' }} />

        {/* ▸ EMISOR / CLIENTE */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <SpacedLabel>Emisor</SpacedLabel>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink-900)' }}>
                {orgSettings?.legal_name || orgSettings?.name || 'NEXOVA'}
              </div>
              {orgSettings?.ruc && (
                <div style={{ color: 'var(--ink-700)' }}>RUC: {orgSettings.ruc}</div>
              )}
              {emisorLines.map((l, i) => (
                <div key={i} style={{ color: 'var(--ink-700)' }}>{l}</div>
              ))}
            </div>
          </div>
          <div>
            <SpacedLabel>Cliente</SpacedLabel>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink-900)' }}>
                {quote.client?.company || 'Cliente'}
              </div>
              {quote.client?.ruc && (
                <div style={{ color: 'var(--ink-700)' }}>RUC: {quote.client.ruc}</div>
              )}
              {clientLines.map((l, i) => (
                <div key={i} style={{ color: 'var(--ink-700)' }}>{l}</div>
              ))}
              {quote.client?.contact && (
                <div style={{ marginTop: 4, color: 'var(--ink-900)' }}>
                  <span style={{ color: 'var(--ink-500)' }}>Attn:</span> {quote.client.contact}
                  {quote.client.contact_role && (
                    <span style={{ color: 'var(--ink-500)' }}> · {quote.client.contact_role}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '0.5px solid var(--ink-200)', margin: '22px 0 18px' }} />

        {/* ▸ DESCRIPCIÓN DEL PROYECTO (3 chips) */}
        {hasAnyChip && (
          <div style={{ marginBottom: 22 }}>
            <SpacedLabel>Descripción del proyecto</SpacedLabel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12,
                marginTop: 12,
              }}
            >
              {[
                { label: 'Solución', value: quote.solution_summary },
                { label: 'Alcance', value: quote.scope_summary },
                { label: 'Modalidad', value: quote.modality_summary },
              ].map((c) => (
                <div
                  key={c.label}
                  style={{
                    background: 'var(--ink-50)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    border: '0.5px solid var(--ink-200)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '.16em',
                      fontWeight: 600,
                      color: 'var(--ink-500)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {c.label}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--ink-900)',
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {c.value || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ▸ JUSTIFICACIÓN Y CARACTERÍSTICAS */}
        {justText && (
          <div style={{ marginBottom: 22 }}>
            <SpacedLabel>Justificación y características del proyecto</SpacedLabel>
            <div
              style={{
                fontSize: 13.5,
                color: 'var(--ink-700)',
                lineHeight: 1.65,
                marginTop: 10,
                textAlign: 'justify',
                whiteSpace: 'pre-wrap',
              }}
            >
              {justText}
            </div>
          </div>
        )}

        {/* ▸ DETALLE DE SERVICIOS Y COSTOS */}
        <div style={{ marginTop: 10 }}>
          <SpacedLabel>Detalle de servicios y costos</SpacedLabel>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12.5,
              marginTop: 14,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ink-900)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', width: 28, ...thStyle }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', ...thStyle }}>
                  Descripción del servicio
                </th>
                <th style={{ textAlign: 'right', padding: '8px 4px', width: 56, ...thStyle }}>
                  Cant.
                </th>
                <th style={{ textAlign: 'right', padding: '8px 4px', width: 92, ...thStyle }}>
                  P. Unit.
                </th>
                <th style={{ textAlign: 'right', padding: '8px 4px', width: 104, ...thStyle }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {(quote.items || []).map((it, idx) => {
                const p = products.find((x) => x.id === it.product_id);
                if (!p) return null;

                // Precio unitario + primer período recurrente
                const basePerUnit =
                  Number(p.base_price || 0) +
                  (it.modules || []).reduce((s, sm) => {
                    const m = p.modules?.find((x) => x.id === sm.module_id);
                    return s + Number(m?.price || 0);
                  }, 0);

                const recurringLines: { label: string; amount: number }[] = [];
                let recurringAdd = 0;
                if (p.requires_recurring) {
                  const modsWithRec = (it.modules || [])
                    .map((sm) => ({ sm, pm: p.modules?.find((x) => x.id === sm.module_id) }))
                    .filter(
                      (x) =>
                        x.pm &&
                        Number(x.pm.recurring_monthly_price || 0) > 0 &&
                        x.sm.recurring_billing_cycle,
                    );
                  for (const { sm, pm } of modsWithRec) {
                    const monthly = Number(pm!.recurring_monthly_price);
                    const amt =
                      sm.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly;
                    if (amt > 0) {
                      recurringAdd += amt;
                      recurringLines.push({
                        label: `${pm!.name} · ${
                          sm.recurring_billing_cycle === 'annual'
                            ? 'primer año (12 meses)'
                            : 'primer mes'
                        }`,
                        amount: amt,
                      });
                    }
                  }
                  if (
                    modsWithRec.length === 0 &&
                    Number(p.recurring_monthly_price || 0) > 0 &&
                    it.recurring_billing_cycle
                  ) {
                    const monthly = Number(p.recurring_monthly_price);
                    const amt =
                      it.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly;
                    if (amt > 0) {
                      recurringAdd += amt;
                      recurringLines.push({
                        label: `Renovación · ${
                          it.recurring_billing_cycle === 'annual'
                            ? 'primer año (12 meses)'
                            : 'primer mes'
                        }`,
                        amount: amt,
                      });
                    }
                  }
                }

                const unitPrice = basePerUnit + recurringAdd;
                const lineTotal = unitPrice * it.qty;

                const modules = (it.modules || [])
                  .map((sm) => p.modules?.find((x) => x.id === sm.module_id))
                  .filter((m): m is NonNullable<typeof m> => !!m);

                return (
                  <tr key={it.id} style={{ borderBottom: '0.5px solid var(--ink-200)' }}>
                    <td style={{ padding: '12px 4px', verticalAlign: 'top', color: 'var(--ink-500)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '12px 4px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink-900)', fontSize: 13 }}>
                        {p.name}
                      </div>
                      {p.description && (
                        <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 3, lineHeight: 1.45 }}>
                          {p.description}
                        </div>
                      )}
                      {modules.length > 0 && (
                        <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 16px', fontSize: 11.5, color: 'var(--ink-700)' }}>
                          {modules.map((m) => (
                            <li key={m.id} style={{ marginBottom: 2 }}>
                              {m.name}{' '}
                              <span style={{ color: 'var(--ink-400)' }}>+{fmtMoney(m.price)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {recurringLines.filter((r) => r.amount > 0).length > 0 && (
                        <ul style={{ margin: '4px 0 0 0', padding: '0 0 0 16px', fontSize: 11.5, color: 'var(--ink-500)' }}>
                          {recurringLines
                            .filter((r) => r.amount > 0)
                            .map((rl, i) => (
                              <li key={i} style={{ marginBottom: 2 }}>
                                {rl.label}{' '}
                                <span style={{ color: 'var(--ink-400)' }}>+{fmtMoney(rl.amount)}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </td>
                    <td style={{ padding: '12px 4px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                      {it.qty}
                    </td>
                    <td style={{ padding: '12px 4px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMoney(unitPrice)}
                    </td>
                    <td style={{ padding: '12px 4px', textAlign: 'right', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(lineTotal)}
                      </div>
                      {hasTc && (
                        <div style={{ fontSize: 11, color: 'var(--ink-400)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                          {fmtUSD(lineTotal, tc!)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ▸ TOTALES (right-aligned, sin cuadro oscuro) */}
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <table
            style={{
              fontSize: 13,
              borderCollapse: 'collapse',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hasTc && (
              <thead>
                <tr>
                  <td />
                  <td
                    style={{
                      textAlign: 'right',
                      fontSize: 10,
                      letterSpacing: '.16em',
                      color: 'var(--ink-400)',
                      fontWeight: 600,
                      paddingBottom: 4,
                      paddingRight: 16,
                    }}
                  >
                    S/
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontSize: 10,
                      letterSpacing: '.16em',
                      color: 'var(--ink-400)',
                      fontWeight: 600,
                      paddingBottom: 4,
                      minWidth: 96,
                    }}
                  >
                    USD
                  </td>
                </tr>
              </thead>
            )}
            <tbody>
              <tr>
                <td style={{ paddingRight: 36, color: 'var(--ink-700)' }}>Subtotal</td>
                <td style={{ textAlign: 'right', paddingRight: 16, minWidth: 96 }}>
                  {fmtMoney(totals.subtotal).replace('S/ ', '')}
                </td>
                {hasTc && (
                  <td style={{ textAlign: 'right', color: 'var(--ink-500)' }}>
                    {fmtUSD(totals.subtotal, tc!).replace('$ ', '')}
                  </td>
                )}
              </tr>
              {quote.discount > 0 && (
                <tr>
                  <td style={{ paddingRight: 36, color: 'var(--teal-700)' }}>
                    Descuento ({quote.discount}%)
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 16, color: 'var(--teal-700)' }}>
                    − {fmtMoney(totals.discountAmt).replace('S/ ', '')}
                  </td>
                  {hasTc && (
                    <td style={{ textAlign: 'right', color: 'var(--teal-700)' }}>
                      − {fmtUSD(totals.discountAmt, tc!).replace('$ ', '')}
                    </td>
                  )}
                </tr>
              )}
              <tr>
                <td style={{ paddingRight: 36, color: 'var(--ink-700)' }}>IGV (18%)</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  {fmtMoney(totals.igv).replace('S/ ', '')}
                </td>
                {hasTc && (
                  <td style={{ textAlign: 'right', color: 'var(--ink-500)' }}>
                    {fmtUSD(totals.igv, tc!).replace('$ ', '')}
                  </td>
                )}
              </tr>
              <tr style={{ borderTop: '1px solid var(--ink-900)' }}>
                <td style={{ paddingTop: 10, paddingRight: 36, fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
                  TOTAL
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    paddingTop: 10,
                    paddingRight: 16,
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--ink-900)',
                  }}
                >
                  {fmtMoney(totals.total)}
                </td>
                {hasTc && (
                  <td
                    style={{
                      textAlign: 'right',
                      paddingTop: 10,
                      fontWeight: 700,
                      fontSize: 15,
                      color: 'var(--ink-900)',
                    }}
                  >
                    {fmtUSD(totals.total, tc!)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ▸ "Son: …" */}
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-700)' }}>
          <span style={{ color: 'var(--ink-500)' }}>Son: </span>
          <span style={{ fontWeight: 700 }}>{moneyToSonText(totals.total)}</span>
        </div>

        {/* ▸ PAGOS RECURRENTES */}
        {recurring.length > 0 && (
          <div
            style={{
              marginTop: 24,
              padding: 18,
              background: 'var(--ink-50)',
              borderRadius: 10,
              borderLeft: '3px solid #F59E0B',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
              Pagos recurrentes
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 12, lineHeight: 1.45 }}>
              {getRecurringHeaderText(recurring)}
            </div>
            {recurring.map((r, idx) => {
              const period = r.cycle === 'annual' ? 'año' : 'mes';
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
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink-900)' }}>
                      {r.label}
                      {r.qty > 1 && (
                        <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}> × {r.qty}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
                      {r.product_name} · {getRecurringRowSubtext(r)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
                      {fmtMoney(r.renewal_amount)} / {period}
                    </div>
                    {hasTc && (
                      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                        {fmtUSD(r.renewal_amount, tc!)} / {period}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ▸ 5 CHIPS DE CONDICIONES */}
        <div
          style={{
            marginTop: 26,
            display: 'grid',
            gridTemplateColumns: hasTc ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)',
            gap: 14,
          }}
        >
          <ConditionChip label="Moneda" v1="PEN" v2="Soles Peruanos" />
          <ConditionChip label="Forma de pago" v1={quote.payment_terms || '—'} />
          <ConditionChip label="Validez" v1={`${quote.valid_days} días`} v2="Desde emisión" />
          <ConditionChip
            label="Entrega"
            v1={`${quote.delivery_weeks} semanas`}
            v2="Hasta entrega final"
          />
          {hasTc && (
            <ConditionChip label="T.C. Referencial" v1={`S/ ${tc!.toFixed(4)}`} v2="= 1 USD" />
          )}
        </div>

        <hr style={{ border: 0, borderTop: '0.5px solid var(--ink-200)', margin: '26px 0 18px' }} />

        {/* ▸ NOTAS Y CONDICIONES */}
        {termsList.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SpacedLabel>Notas y condiciones</SpacedLabel>
            <ol
              style={{
                margin: '10px 0 0',
                padding: '0 0 0 22px',
                fontSize: 12.5,
                color: 'var(--ink-700)',
                lineHeight: 1.65,
              }}
            >
              {termsList.map((t, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ▸ APROBACIÓN DE COTIZACIÓN */}
        <div style={{ marginTop: 24 }}>
          <SpacedLabel>Aprobación de cotización</SpacedLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
              marginTop: 12,
            }}
          >
            <SignatureBlock
              name={quote.vendor?.name || '—'}
              title={`${
                quote.vendor?.role
                  ? formalRoleLabel[quote.vendor.role as keyof typeof formalRoleLabel] ||
                    'Ejecutivo Comercial'
                  : 'Ejecutivo Comercial'
              } · ${orgSettings?.name || 'NEXOVA'}`}
              email={quote.vendor?.email || null}
            />
            <SignatureBlock
              name={quote.client?.contact || '—'}
              title={
                quote.client?.contact_role
                  ? `${quote.client.contact_role} · ${quote.client.company}`
                  : quote.client?.company || '—'
              }
              dateLine="Fecha de aceptación: ___/___/______"
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: '0.5px solid var(--ink-200)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--ink-400)',
          }}
        >
          <div>
            <Icon name="sparkle" size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {[
              branding.commercial_name || orgSettings?.name || 'Nexova',
              orgSettings?.website,
              orgSettings?.phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
            Cotización {quote.code}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ───

const thStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '.14em',
  fontWeight: 600,
  color: 'var(--ink-500)',
  textTransform: 'uppercase',
};

function ConditionChip({
  label,
  v1,
  v2,
}: {
  label: string;
  v1: string;
  v2?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.16em',
          fontWeight: 600,
          color: 'var(--ink-500)',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>{v1}</div>
      {v2 && <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>{v2}</div>}
    </div>
  );
}

function SignatureBlock({
  name,
  title,
  email,
  dateLine,
}: {
  name: string;
  title: string;
  email?: string | null;
  dateLine?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--ink-50)',
        borderRadius: 8,
        padding: '18px 18px 16px',
        minHeight: 92,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div style={{ borderTop: '1px solid var(--ink-700)', marginBottom: 10 }} />
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>{name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>{title}</div>
      {email && (
        <div style={{ fontSize: 11.5, color: 'var(--teal-700)', marginTop: 2 }}>{email}</div>
      )}
      {dateLine && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 6 }}>{dateLine}</div>
      )}
    </div>
  );
}

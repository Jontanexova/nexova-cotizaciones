import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, NexovaLogo, StatusChip, Toast } from '../components/UI';
import { fetchQuoteById, publishQuote, updateQuoteStatus, sendQuotePromptEmail, fetchOrgSettings, archiveQuote, deleteQuote } from '../lib/db';
import { useBranding } from '../contexts/BrandingContext';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtDate, fmtMoney, fmtUSD, getRecurringCharges, getRecurringHeaderText, getRecurringRowSubtext } from '../lib/utils';
import type { OrganizationSettings, Quote, QuoteStatus } from '../lib/types';

interface QuotePreviewProps {
  quoteId: string;
  onBack: () => void;
  onEditQuote: (q: Quote) => void;
}

export function QuotePreview({ quoteId, onBack, onEditQuote }: QuotePreviewProps) {
  const { vendor, isSuperAdmin } = useAuth();
  const { branding } = useBranding();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { products, loading: loadingP } = useProducts();

  const reload = async () => {
    setLoading(true);
    try {
      const [q, org] = await Promise.all([
        fetchQuoteById(quoteId),
        fetchOrgSettings().catch(() => null), // si falla, no bloquea la carga
      ]);
      setQuote(q);
      setOrgSettings(org);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [quoteId]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const doPublish = async () => {
    if (!quote) return;
    setWorking(true);
    try {
      const token = await publishQuote(quote.id);
      const url = `${window.location.origin}/public/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('✓ Link público copiado al portapapeles');
      } catch {
        showToast('✓ Cotización publicada');
      }
      await reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo publicar'));
    } finally {
      setWorking(false);
    }
  };

  const doStatus = async (status: QuoteStatus) => {
    if (!quote) return;
    setWorking(true);
    try {
      await updateQuoteStatus(quote.id, status);
      showToast('Estado actualizado');
      await reload();
    } finally {
      setWorking(false);
    }
  };

  const doSendPrompt = async () => {
    if (!quote || !vendor) return;
    setSendingPrompt(true);
    try {
      // Code splitting: jsPDF solo se descarga cuando se usa
      const { generatePromptPdf } = await import('../lib/promptPdf');
      const pdfBase64 = generatePromptPdf(quote, vendor, products);
      await sendQuotePromptEmail(vendor, quote, pdfBase64);
      showToast(`✓ Prompt enviado a ${vendor.email}`);
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo enviar el prompt'));
    } finally {
      setSendingPrompt(false);
    }
  };

  const doDownload = async () => {
    if (!quote) return;
    setDownloading(true);
    try {
      // Code splitting: jsPDF solo se descarga cuando se usa.
      const { downloadQuotePdf } = await import('../lib/quotePdf');
      downloadQuotePdf(quote, products, orgSettings);
      showToast('✓ Cotización descargada');
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo generar el PDF'));
    } finally {
      setDownloading(false);
    }
  };

  // Acciones de super_admin sobre cotizaciones aceptadas
  const doRevert = async () => {
    if (!quote) return;
    if (!confirm('Se revertirá a estado "enviada" para poder editarla. ¿Continuar?')) return;
    setWorking(true);
    try {
      await updateQuoteStatus(quote.id, 'enviada');
      showToast('✓ Cotización revertida a "enviada". Ya puedes editarla.');
      await reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo revertir'));
    } finally {
      setWorking(false);
    }
  };

  const doArchive = async () => {
    if (!quote) return;
    if (
      !confirm(
        'Archivar oculta esta cotización de reportes y totales (soft delete). Se puede desarchivar después. ¿Continuar?',
      )
    )
      return;
    setWorking(true);
    try {
      await archiveQuote(quote.id);
      showToast('✓ Cotización archivada');
      onBack();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo archivar'));
    } finally {
      setWorking(false);
    }
  };

  const doDelete = async () => {
    if (!quote) return;
    if (
      !confirm(
        '⚠️ ELIMINAR PERMANENTE. No se puede deshacer. La cotización se borrará de la DB. ¿Continuar?',
      )
    )
      return;
    setWorking(true);
    try {
      await deleteQuote(quote.id);
      showToast('✓ Cotización eliminada');
      onBack();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo eliminar'));
    } finally {
      setWorking(false);
    }
  };

  if (loading || loadingP) return <Loading label="Cargando cotización…" />;
  if (!quote) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p>Cotización no encontrada.</p>
        <button className="btn btn-primary" onClick={onBack}>
          Volver
        </button>
      </div>
    );
  }

  const totals = computeQuoteTotals(quote.items || [], products, quote.discount);
  const recurring = getRecurringCharges(quote.items || [], products);
  const publicUrl = quote.public_token
    ? `${window.location.origin}/public/${quote.public_token}`
    : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink-50)' }}>
      {/* Action bar */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid var(--ink-200)',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Volver
        </button>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-700)' }}>
            {quote.code}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
            Creada {fmtDate(quote.created_at)} · {quote.views} vista{quote.views === 1 ? '' : 's'}
          </div>
        </div>
        <StatusChip status={quote.status} />
        {(['enviada', 'vista', 'negociacion', 'aceptada', 'rechazada'] as QuoteStatus[]).includes(
          quote.status,
        ) && (
          <button
            className="btn btn-soft btn-sm"
            onClick={doDownload}
            disabled={downloading || working}
            title="Descargar cotización como PDF para compartir con el cliente"
          >
            {downloading ? <div className="spinner" /> : <Icon name="download" size={13} />}
            Descargar
          </button>
        )}
        {isSuperAdmin && !quote.archived && (
          <button
            className="btn btn-soft btn-sm"
            onClick={() => onEditQuote(quote)}
            disabled={working}
            title="Editar esta cotización"
            style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', borderColor: 'var(--teal-100)' }}
          >
            <Icon name="edit" size={13} /> Editar
          </button>
        )}
        <button
          className="btn btn-soft btn-sm"
          onClick={doSendPrompt}
          disabled={sendingPrompt || working}
          title={`Genera un PDF con un prompt para Claude basado en los requerimientos, y lo envía a ${vendor?.email || 'tu email'}`}
          style={{ background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', color: '#6d28d9', borderColor: '#c4b5fd' }}
        >
          {sendingPrompt ? <div className="spinner" /> : <Icon name="sparkle" size={13} />}
          Enviar Prompt
        </button>
        {quote.status === 'enviada' || quote.status === 'vista' ? (
          <>
            <button
              className="btn btn-soft btn-sm"
              onClick={() => doStatus('aceptada')}
              disabled={working}
            >
              <Icon name="check" size={13} /> Marcar aceptada
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => doStatus('rechazada')}
              disabled={working}
            >
              Rechazada
            </button>
          </>
        ) : null}
        {isSuperAdmin && quote.status === 'aceptada' && (
          <>
            <button
              className="btn btn-soft btn-sm"
              onClick={doRevert}
              disabled={working}
              title="Vuelve a estado 'enviada' para poder editar"
              style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
            >
              <Icon name="arrowLeft" size={13} /> Revertir a enviada
            </button>
            <button
              className="btn btn-soft btn-sm"
              onClick={doArchive}
              disabled={working}
              title="Archivar (soft delete, oculta de reportes)"
              style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#c4b5fd' }}
            >
              <Icon name="box" size={13} /> Archivar
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={doDelete}
              disabled={working}
              title="Eliminar permanentemente"
            >
              <Icon name="trash" size={13} /> Eliminar
            </button>
          </>
        )}
        {publicUrl ? (
          <button
            className="btn btn-soft btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(publicUrl);
                showToast('✓ Link copiado');
              } catch {
                showToast(publicUrl);
              }
            }}
          >
            <Icon name="copy" size={13} /> Copiar link
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={doPublish}
            disabled={working || quote.items?.length === 0}
          >
            {working ? <div className="spinner" /> : <Icon name="send" size={13} />}
            Publicar & enviar
          </button>
        )}
      </div>

      {/* Document */}
      <div
        style={{
          maxWidth: 820,
          margin: '32px auto',
          background: 'white',
          borderRadius: 12,
          border: '1px solid var(--ink-200)',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '28px 40px',
            background:
              'linear-gradient(135deg, var(--teal-900) 0%, var(--teal-700) 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <NexovaLogo size={36} light />
          <div style={{ flex: 1 }} />
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
            <div
              className="mono"
              style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}
            >
              {quote.code}
            </div>
          </div>
        </div>

        <div style={{ padding: '32px 40px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 24,
              marginBottom: 24,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  color: 'var(--ink-400)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}
              >
                Para
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>
                {quote.client?.company}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 2 }}>
                {quote.client?.contact}
                {quote.client?.email ? ' · ' + quote.client.email : ''}
              </div>
              {quote.client?.ruc && (
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
                  RUC {quote.client.ruc}
                </div>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  color: 'var(--ink-400)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}
              >
                Emitido por
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {quote.vendor && (
                  <Avatar name={quote.vendor.name} color={quote.vendor.color} size={36} />
                )}
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink-900)' }}>
                    {quote.vendor?.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                    {quote.vendor?.email}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-500)',
                  marginTop: 10,
                  display: 'flex',
                  gap: 14,
                }}
              >
                <span>Emitida {fmtDate(quote.created_at)}</span>
                <span>Válida hasta {fmtDate(quote.valid_until)}</span>
              </div>
            </div>
          </div>

          {quote.proposal_text && (
            <div
              style={{
                padding: 16,
                background: 'var(--ink-50)',
                borderRadius: 10,
                marginBottom: 24,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: 'var(--ink-700)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {quote.proposal_text}
            </div>
          )}

          <h3 className="h-display" style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Alcance de la propuesta
          </h3>
          {(() => {
            const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
            const showUsd = tc && tc > 0;
            return (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--ink-900)',
                  color: 'var(--ink-900)',
                  fontWeight: 700,
                }}
              >
                <th style={{ textAlign: 'left', padding: '8px 0' }}>Descripción</th>
                <th style={{ width: 70, textAlign: 'center', padding: '8px 0' }}>Cant.</th>
                <th style={{ width: 120, textAlign: 'right', padding: '8px 0' }}>S/ Subtotal</th>
                {showUsd && (
                  <th style={{ width: 120, textAlign: 'right', padding: '8px 0' }}>USD Subtotal</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(quote.items || []).map((it) => {
                const p = products.find((x) => x.id === it.product_id);
                if (!p) return null;
                let line = Number(p.base_price || 0);
                for (const sm of it.modules) {
                  const m = p.modules?.find((x) => x.id === sm.module_id);
                  if (m) line += Number(m.price || 0);
                }
                line *= it.qty;
                // v2.18: sumar primer período recurrente al total del item
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
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--ink-200)' }}>
                    <td style={{ padding: '12px 0', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                        {p.description}
                      </div>
                      {it.modules.length > 0 && (
                        <ul
                          style={{
                            margin: '8px 0 0 16px',
                            padding: 0,
                            fontSize: 12,
                            color: 'var(--ink-600)',
                          }}
                        >
                          {it.modules.map((sm) => {
                            const m = p.modules?.find((x) => x.id === sm.module_id);
                            if (!m) return null;
                            const hasRec = p.requires_recurring && Number(m.recurring_monthly_price || 0) > 0;
                            const cycle = sm.recurring_billing_cycle;
                            const periodLabel = cycle === 'annual' ? 'primer año' : 'primer mes';
                            return (
                              <li key={sm.module_id}>
                                {m.name}
                                {hasRec && cycle && (
                                  <span style={{ color: 'var(--ink-500)' }}> · {periodLabel}</span>
                                )}
                              </li>
                            );
                          })}
                          {p.requires_recurring &&
                            !it.modules.some((sm) => {
                              const pm = p.modules?.find((x) => x.id === sm.module_id);
                              return pm && Number(pm.recurring_monthly_price || 0) > 0;
                            }) &&
                            Number(p.recurring_monthly_price || 0) > 0 &&
                            it.recurring_billing_cycle && (
                              <li style={{ color: 'var(--ink-500)' }}>
                                Renovación · {it.recurring_billing_cycle === 'annual' ? 'primer año' : 'primer mes'}
                              </li>
                            )}
                        </ul>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 0', verticalAlign: 'top' }}>{it.qty}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '12px 0',
                        verticalAlign: 'top',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                      }}
                    >
                      {fmtMoney(line)}
                    </td>
                    {showUsd && (
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '12px 0',
                          verticalAlign: 'top',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          color: 'var(--ink-600)',
                        }}
                      >
                        {fmtUSD(line, tc)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ width: 300 }}>
              <SummaryRow label="Subtotal" value={fmtMoney(totals.subtotal)} />
              {quote.discount > 0 && (
                <SummaryRow
                  label={`Descuento (${quote.discount}%)`}
                  value={'- ' + fmtMoney(totals.discountAmt)}
                  color="var(--danger)"
                />
              )}
              <SummaryRow label="IGV (18%)" value={fmtMoney(totals.igv)} muted />
              <div
                style={{
                  borderTop: '2px solid var(--ink-900)',
                  marginTop: 8,
                  paddingTop: 10,
                }}
              >
                <SummaryRow label="Total" value={fmtMoney(totals.total)} large bold />
                {orgSettings?.exchange_rate && Number(orgSettings.exchange_rate) > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      color: 'var(--ink-500)',
                    }}
                  >
                    <span>Referencial en dólares</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                      {fmtUSD(totals.total, Number(orgSettings.exchange_rate))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pagos recurrentes (cargos periódicos posteriores a la implementación) */}
          {recurring.length > 0 && (() => {
            const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
            const hasTc = !!(tc && tc > 0);
            return (
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  background: 'var(--ink-50)',
                  borderRadius: 10,
                  borderLeft: '3px solid #F59E0B',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--ink-900)',
                    marginBottom: 3,
                  }}
                >
                  Pagos recurrentes
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-500)',
                    marginBottom: 10,
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
                        padding: '8px 0',
                        borderTop: idx > 0 ? '1px dashed var(--ink-200)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ink-900)' }}>
                          {r.label}
                          {r.qty > 1 && (
                            <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>
                              {' '}× {r.qty}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 1 }}>
                          {r.product_name} · {getRecurringRowSubtext(r)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 13,
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
                              fontSize: 11.5,
                              fontWeight: 500,
                              color: 'var(--ink-500)',
                              marginTop: 1,
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
              display: 'grid',
              gridTemplateColumns: orgSettings?.exchange_rate ? '1fr 1fr 1fr' : '1fr 1fr',
              gap: 16,
              padding: 16,
              background: 'var(--ink-50)',
              borderRadius: 10,
              fontSize: 12.5,
            }}
          >
            <div>
              <div style={{ color: 'var(--ink-500)', fontWeight: 600, marginBottom: 4 }}>
                Tiempo estimado
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                {quote.delivery_weeks} semanas
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-500)', fontWeight: 600, marginBottom: 4 }}>
                Condiciones de pago
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                {quote.payment_terms || '—'}
              </div>
            </div>
            {orgSettings?.exchange_rate && Number(orgSettings.exchange_rate) > 0 && (
              <div>
                <div style={{ color: 'var(--ink-500)', fontWeight: 600, marginBottom: 4 }}>
                  Tipo de cambio referencial
                </div>
                <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                  S/ {Number(orgSettings.exchange_rate).toFixed(4)} = 1 USD
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '16px 40px',
            background: 'var(--ink-900)',
            color: 'rgba(255,255,255,.6)',
            fontSize: 11,
            textAlign: 'center',
          }}
        >
          © {new Date().getFullYear()} {orgSettings?.name || 'Nexova'}
          {orgSettings?.legal_name && orgSettings.legal_name !== orgSettings.name && ` · ${orgSettings.legal_name}`}
          {orgSettings?.email && ` · ${orgSettings.email}`}
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
  muted,
  bold,
  large,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontSize: large ? 15 : 13,
      }}
    >
      <span
        style={{
          color: muted ? 'var(--ink-500)' : 'var(--ink-700)',
          fontWeight: bold ? 700 : 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: color || 'var(--ink-900)',
          fontFamily: 'var(--font-display)',
          fontWeight: bold ? 700 : 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

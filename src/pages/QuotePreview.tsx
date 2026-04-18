import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, NexovaLogo, StatusChip, Toast } from '../components/UI';
import { fetchQuoteById, publishQuote, updateQuoteStatus } from '../lib/db';
import { useProducts } from '../hooks/useProducts';
import { computeQuoteTotals, fmtDate, fmtMoney } from '../lib/utils';
import type { Quote, QuoteStatus } from '../lib/types';

interface QuotePreviewProps {
  quoteId: string;
  onBack: () => void;
}

export function QuotePreview({ quoteId, onBack }: QuotePreviewProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { products, loading: loadingP } = useProducts();

  const reload = async () => {
    setLoading(true);
    try {
      const q = await fetchQuoteById(quoteId);
      setQuote(q);
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
                <th style={{ width: 120, textAlign: 'right', padding: '8px 0' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
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
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--ink-200)' }}>
                    <td style={{ padding: '12px 0', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                        {p.description}
                      </div>
                      {it.module_ids.length > 0 && (
                        <ul
                          style={{
                            margin: '8px 0 0 16px',
                            padding: 0,
                            fontSize: 12,
                            color: 'var(--ink-600)',
                          }}
                        >
                          {it.module_ids.map((mid) => {
                            const m = p.modules?.find((x) => x.id === mid);
                            return m ? <li key={mid}>{m.name}</li> : null;
                          })}
                        </ul>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 0' }}>{it.qty}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '12px 0',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                      }}
                    >
                      {fmtMoney(line)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

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
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
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
          © 2026 Nexova · Software Empresarial · contacto@nexova.io
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

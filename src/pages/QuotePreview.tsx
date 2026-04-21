import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, Modal, StatusChip, Toast } from '../components/UI';
import { fetchQuoteById, publishQuote, updateQuoteStatus, sendQuotePromptEmail, fetchOrgSettings, archiveQuote, deleteQuote, updateQuoteTerms } from '../lib/db';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { fmtDate } from '../lib/utils';
import { QuoteDocument } from '../components/QuoteDocument';
import type { OrganizationSettings, Quote, QuoteStatus } from '../lib/types';

interface QuotePreviewProps {
  quoteId: string;
  onBack: () => void;
  onEditQuote: (q: Quote) => void;
}

export function QuotePreview({ quoteId, onBack, onEditQuote }: QuotePreviewProps) {
  const { vendor, isSuperAdmin } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { products, loading: loadingP } = useProducts();

  // v2.25 — Personalizar "Notas y Condiciones" para esta cotización.
  // quote.terms === null: hereda del default global de org_settings.
  // quote.terms === string: override "congelado" para esta cotización (integridad contractual).
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [termsDraft, setTermsDraft] = useState('');
  const [termsSaving, setTermsSaving] = useState(false);

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

      {/* Documento — compartido con PublicLink via <QuoteDocument />. La
          action bar de arriba es exclusiva del preview del vendedor; todo
          lo que el cliente verá en el link público va dentro del card. */}
      <div
        style={{
          maxWidth: 820,
          margin: '32px auto',
          background: 'white',
          borderRadius: 12,
          border: '1px solid var(--ink-200)',
          boxShadow: 'var(--shadow)',
          padding: '48px 54px',
        }}
      >
        <QuoteDocument
          quote={quote}
          products={products}
          orgSettings={orgSettings}
          onEditTerms={() => {
            const raw = (quote.terms && quote.terms.trim())
              || (orgSettings?.default_terms && orgSettings.default_terms.trim())
              || '';
            setTermsDraft(raw);
            setTermsModalOpen(true);
          }}
        />
      </div>

      {toast && <Toast message={toast} />}

      {/* v2.25 — Modal para personalizar notas y condiciones por cotización */}
      <Modal
        open={termsModalOpen}
        onClose={() => !termsSaving && setTermsModalOpen(false)}
        width={640}
      >
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 className="h-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Notas y condiciones · {quote?.code}
            </h3>
            <button
              onClick={() => setTermsModalOpen(false)}
              disabled={termsSaving}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--ink-500)',
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Una línea por nota. Al guardar, esta cotización usará{' '}
            <strong style={{ color: 'var(--ink-700)' }}>solamente</strong> este
            texto (aunque el Super Admin cambie el default global después).
            Para volver al default global, usa <em>"Volver al default"</em>.
          </p>
          <textarea
            className="nx-input"
            rows={12}
            style={{ resize: 'vertical', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}
            value={termsDraft}
            onChange={(e) => setTermsDraft(e.target.value)}
            disabled={termsSaving}
            autoFocus
          />
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              className="btn btn-ghost"
              disabled={termsSaving || !quote?.terms}
              onClick={async () => {
                if (!quote) return;
                setTermsSaving(true);
                try {
                  await updateQuoteTerms(quote.id, null);
                  await reload();
                  setTermsModalOpen(false);
                  showToast('Notas restauradas al default global');
                } catch (e: any) {
                  showToast(e?.message || 'Error al restaurar');
                } finally {
                  setTermsSaving(false);
                }
              }}
              title={
                quote?.terms
                  ? 'Borra el override y vuelve a heredar el default global'
                  : 'No hay override activo'
              }
              style={{ fontSize: 12 }}
            >
              <Icon name="arrowLeft" size={12} /> Volver al default
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                disabled={termsSaving}
                onClick={() => setTermsModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={termsSaving}
                onClick={async () => {
                  if (!quote) return;
                  setTermsSaving(true);
                  try {
                    await updateQuoteTerms(quote.id, termsDraft);
                    await reload();
                    setTermsModalOpen(false);
                    showToast('Notas personalizadas guardadas');
                  } catch (e: any) {
                    showToast(e?.message || 'Error al guardar');
                  } finally {
                    setTermsSaving(false);
                  }
                }}
              >
                {termsSaving ? <div className="spinner" /> : <Icon name="check" size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </Modal>
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

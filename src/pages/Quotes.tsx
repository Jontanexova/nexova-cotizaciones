import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Modal, StatusChip, Toast, Topbar } from '../components/UI';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtDate, fmtMoney, STATUS_MAP } from '../lib/utils';
import { deleteQuote } from '../lib/db';
import type { Quote, QuoteStatus } from '../lib/types';

interface QuotesProps {
  onOpenQuote: (id: string) => void;
  onNewQuote: () => void;
}

const STATUS_FILTERS: (QuoteStatus | 'all')[] = [
  'all',
  'borrador',
  'enviada',
  'vista',
  'negociacion',
  'aceptada',
  'rechazada',
];

export function Quotes({ onOpenQuote, onNewQuote }: QuotesProps) {
  const { isSuperAdmin } = useAuth();
  const { quotes, loading: loadingQ, error: errorQ, reload } = useQuotes();
  const { products, loading: loadingP } = useProducts();
  const [filter, setFilter] = useState<QuoteStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteQuote(confirmDelete.id);
      showToast(`✓ Cotización ${confirmDelete.code} eliminada`);
      setConfirmDelete(null);
      await reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo eliminar'));
    } finally {
      setDeleting(false);
    }
  };

  const visibleQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (filter !== 'all' && q.status !== filter) return false;
      if (query) {
        const s = query.toLowerCase();
        if (
          !q.code.toLowerCase().includes(s) &&
          !(q.client?.company || '').toLowerCase().includes(s) &&
          !(q.client?.contact || '').toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [quotes, filter, query]);

  const loading = loadingQ || loadingP;

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Cotizaciones" subtitle="Gestiona todas tus propuestas comerciales" />
        <Loading label="Cargando cotizaciones…" />
      </div>
    );
  }

  if (errorQ) {
    return (
      <div className="fade-in">
        <Topbar title="Cotizaciones" />
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--ink-500)',
            fontSize: 13,
          }}
        >
          No se pudieron cargar las cotizaciones. {errorQ.message}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Topbar
        title="Cotizaciones"
        subtitle={`${quotes.length} ${
          quotes.length === 1 ? 'cotización registrada' : 'cotizaciones registradas'
        }`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={onNewQuote}>
            <Icon name="plus" size={14} /> Nueva cotización
          </button>
        }
      />

      <div style={{ padding: '24px 32px' }}>
        {/* Filtros */}
        <div
          className="nx-card"
          style={{
            padding: 14,
            marginBottom: 14,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <Icon
              name="search"
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-400)',
              }}
            />
            <input
              className="nx-input"
              placeholder="Buscar por código, cliente o contacto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((s) => {
              const count = s === 'all' ? quotes.length : quotes.filter((q) => q.status === s).length;
              const active = filter === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className="btn btn-sm"
                  style={{
                    background: active ? 'var(--teal-700)' : 'var(--ink-50)',
                    color: active ? 'white' : 'var(--ink-700)',
                    fontWeight: 600,
                    padding: '6px 12px',
                    border: 'none',
                  }}
                >
                  {s === 'all' ? 'Todos' : STATUS_MAP[s].label}
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      background: active ? 'rgba(255,255,255,.2)' : 'var(--ink-200)',
                      borderRadius: 4,
                      fontSize: 10.5,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabla */}
        <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="nx-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>CÓDIGO</th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>CLIENTE</th>
                {isSuperAdmin && (
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>VENDEDOR</th>
                )}
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>ESTADO</th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>TOTAL</th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-500)', background: 'var(--ink-50)' }}>CREADA</th>
                <th style={{ padding: '12px', background: 'var(--ink-50)' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleQuotes.map((q) => {
                const totals = computeQuoteTotals(q.items || [], products, q.discount);
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
                    <td style={{ padding: '14px 20px' }}>
                      <span
                        className="mono"
                        style={{ fontSize: 12.5, color: 'var(--teal-700)', fontWeight: 600 }}
                      >
                        {q.code}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                        {q.client?.company}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                        {q.client?.contact}
                      </div>
                    </td>
                    {isSuperAdmin && (
                      <td style={{ padding: '14px 12px' }}>
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
                    <td style={{ padding: '14px 12px' }}>
                      <StatusChip status={q.status} />
                    </td>
                    <td
                      style={{
                        padding: '14px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                      }}
                    >
                      {fmtMoney(totals.total)}
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--ink-500)', fontSize: 12.5 }}>
                      {fmtDate(q.created_at)}
                    </td>
                    <td
                      style={{ padding: '14px 12px', color: 'var(--ink-400)', textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isSuperAdmin && q.status === 'borrador' ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setConfirmDelete(q)}
                          title="Eliminar borrador"
                          style={{ color: '#dc2626', padding: '4px 8px' }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      ) : (
                        <span>→</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleQuotes.length === 0 && (
                <tr>
                  <td
                    colSpan={isSuperAdmin ? 7 : 6}
                    style={{
                      padding: 48,
                      textAlign: 'center',
                      color: 'var(--ink-500)',
                      fontSize: 13.5,
                    }}
                  >
                    {quotes.length === 0 ? (
                      <>
                        Aún no hay cotizaciones.
                        <br />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={onNewQuote}
                          style={{ marginTop: 14 }}
                        >
                          <Icon name="plus" size={14} /> Crear la primera
                        </button>
                      </>
                    ) : (
                      'No se encontraron cotizaciones con estos filtros.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal: confirmar eliminación */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} width={420}>
        <div style={{ padding: 24 }}>
          <h3 className="h-display" style={{ margin: '0 0 6px', fontSize: 18 }}>
            ¿Eliminar esta cotización?
          </h3>
          {confirmDelete && (
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
              Vas a eliminar <strong>{confirmDelete.code}</strong> de{' '}
              <strong>{confirmDelete.client?.company}</strong>. Esta acción no se puede deshacer.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: '#dc2626' }}
            >
              {deleting ? <div className="spinner" /> : <Icon name="trash" size={14} />}
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast} />}
    </div>
  );
}

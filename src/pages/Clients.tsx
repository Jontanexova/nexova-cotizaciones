/**
 * v2.26 — Sección Clientes (directorio compartido).
 *
 * Todos los vendedores autenticados ven todos los clientes (RLS relajada en
 * v2.26). Super Admin puede eliminar; todos pueden crear y editar.
 *
 * Features:
 *  - Tabla con búsqueda por razón social/RUC/contacto
 *  - Modal Nuevo / Editar con campo RUC arriba + botón "Validar"
 *  - El botón Validar llama a la Edge Function validate-ruc (Decolecta) y
 *    autocompleta Razón social y Dirección
 *  - Si el RUC ya existe en BD, muestra warning "ya registrado como {empresa}"
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, Modal, Topbar, Toast } from '../components/UI';
import { useAuth } from '../contexts/AuthContext';
import {
  createClient,
  deleteClient,
  fetchClientByRuc,
  fetchClientsWithStats,
  updateClient,
  validateRucViaEdgeFunction,
  type ClientWithStats,
} from '../lib/db';
import { fmtDate } from '../lib/utils';
import type { ClientSize } from '../lib/types';

export function Clients() {
  const { vendor, isSuperAdmin } = useAuth();
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ClientWithStats | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchClientsWithStats();
        if (!cancelled) setClients(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) showToast('Error cargando clientes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      return (
        (c.company || '').toLowerCase().includes(q) ||
        (c.ruc || '').toLowerCase().includes(q) ||
        (c.contact || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    });
  }, [clients, query]);

  const doDelete = async (c: ClientWithStats) => {
    if (c.quote_count > 0) {
      if (
        !confirm(
          `"${c.company}" tiene ${c.quote_count} cotización(es) asociada(s). ` +
            `Si lo eliminas, la DB rechazará la operación (FK). ` +
            `Te recomiendo archivar las cotizaciones primero. ¿Intentar eliminar igual?`,
        )
      ) {
        return;
      }
    } else {
      if (!confirm(`¿Eliminar "${c.company}"? Esta acción no se puede deshacer.`)) {
        return;
      }
    }
    try {
      await deleteClient(c.id);
      showToast('✓ Cliente eliminado');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('foreign key') || msg.includes('23503')) {
        showToast('No se pudo eliminar: tiene cotizaciones asociadas.');
      } else {
        showToast('Error: ' + msg);
      }
    }
  };

  return (
    <div>
      <Topbar
        title="Clientes"
        subtitle="Directorio compartido. Todos los vendedores ven el mismo listado."
      />

      <div style={{ padding: '24px 32px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
            <Icon
              name="search"
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-400)',
                pointerEvents: 'none',
              }}
            />
            <input
              className="nx-input"
              style={{ paddingLeft: 34 }}
              placeholder="Buscar por empresa, RUC, contacto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Nuevo cliente
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : (
          <div className="nx-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--ink-200)' }}>
                  <th style={th}>Razón social</th>
                  <th style={th}>Contacto</th>
                  <th style={th}>RUC</th>
                  <th style={th}>Teléfono</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cotizaciones</th>
                  <th style={{ ...th, textAlign: 'right' }}>Última</th>
                  <th style={{ ...th, width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '48px 24px',
                        textAlign: 'center',
                        color: 'var(--ink-500)',
                      }}
                    >
                      {query
                        ? 'No se encontraron clientes con ese criterio.'
                        : 'Aún no hay clientes registrados.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setEditing(c)}
                      style={{
                        borderBottom: '1px solid var(--ink-100)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                          {c.company}
                        </div>
                        {c.industry && (
                          <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
                            {c.industry}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {c.contact || <span style={{ color: 'var(--ink-400)' }}>—</span>}
                        {c.contact_role && (
                          <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                            {c.contact_role}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {c.ruc ? (
                          <span className="mono" style={{ fontSize: 12.5 }}>
                            {c.ruc}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-400)' }}>—</span>
                        )}
                      </td>
                      <td style={td}>
                        {c.phone || <span style={{ color: 'var(--ink-400)' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {c.quote_count > 0 ? (
                          <span
                            className="nx-chip chip-slate"
                            style={{ fontSize: 11 }}
                          >
                            {c.quote_count}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-400)' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--ink-600)' }}>
                        {c.last_quote_at ? fmtDate(c.last_quote_at) : <span style={{ color: 'var(--ink-400)' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {isSuperAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              doDelete(c);
                            }}
                            title="Eliminar cliente"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 4,
                              color: 'var(--ink-400)',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-400)')}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(editing || creating) && (
        <ClientForm
          initial={editing}
          ownerVendorId={vendor?.id || null}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={(msg) => {
            setEditing(null);
            setCreating(false);
            setReloadKey((k) => k + 1);
            showToast(msg);
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal: Nuevo / Editar cliente
// ═══════════════════════════════════════════════════════════════════════

interface ClientFormProps {
  initial: ClientWithStats | null;
  ownerVendorId: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function ClientForm({ initial, ownerVendorId, onClose, onSaved }: ClientFormProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    ruc: initial?.ruc || '',
    company: initial?.company || '',
    address: initial?.address || '',
    contact: initial?.contact || '',
    contact_role: initial?.contact_role || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    industry: initial?.industry || '',
    size: (initial?.size as ClientSize) || ('mediana' as ClientSize),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Validación de formato RUC peruano
  const rucClean = form.ruc.replace(/\s/g, '');
  const rucHasRightFormat = /^\d{11}$/.test(rucClean) && /^(10|15|17|20)/.test(rucClean);

  const doValidate = async () => {
    if (!rucHasRightFormat) {
      setValidateMsg({
        kind: 'err',
        text: 'Formato inválido. RUC: 11 dígitos que empiezan con 10, 15, 17 o 20.',
      });
      return;
    }
    setValidating(true);
    setValidateMsg(null);
    try {
      // 1) Ver si ya existe en nuestra BD
      const existing = await fetchClientByRuc(rucClean);
      if (existing && (!initial || existing.id !== initial.id)) {
        setValidateMsg({
          kind: 'warn',
          text: `Este RUC ya está registrado como "${existing.company}". ` +
            `Si quieres editarlo, búscalo en la tabla.`,
        });
        setValidating(false);
        return;
      }

      // 2) Consultar Decolecta (vía Edge Function)
      const data = await validateRucViaEdgeFunction(rucClean);
      setForm((f) => ({
        ...f,
        ruc: data.ruc,
        company: data.razon_social || f.company,
        address: data.direccion || f.address,
      }));
      setValidateMsg({
        kind: 'ok',
        text: `✓ ${data.razon_social}${data.estado ? ` · ${data.estado}` : ''}`,
      });
    } catch (e: any) {
      setValidateMsg({
        kind: 'err',
        text: e?.message || 'Error validando RUC',
      });
    } finally {
      setValidating(false);
    }
  };

  const save = async () => {
    if (!form.company.trim()) {
      setError('La razón social es obligatoria.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && initial) {
        await updateClient(initial.id, {
          company: form.company.trim(),
          ruc: form.ruc.trim() || null,
          address: form.address.trim() || null,
          contact: form.contact.trim() || null,
          contact_role: form.contact_role.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          industry: form.industry.trim() || null,
          size: form.size,
        });
        onSaved('✓ Cliente actualizado');
      } else {
        await createClient({
          company: form.company.trim(),
          ruc: form.ruc.trim() || undefined,
          address: form.address.trim() || undefined,
          contact: form.contact.trim() || undefined,
          contact_role: form.contact_role.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          industry: form.industry.trim() || undefined,
          size: form.size,
          owner_vendor_id: ownerVendorId || undefined,
        });
        onSaved('✓ Cliente creado');
      }
    } catch (e: any) {
      setError(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={() => !saving && onClose()} width={640}>
      <div style={{ padding: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <h3 className="h-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
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

        {/* RUC arriba con botón Validar */}
        <div className="nx-field" style={{ marginBottom: 14 }}>
          <label className="nx-label">RUC (opcional)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="nx-input"
              style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
              placeholder="20605541231"
              value={form.ruc}
              onChange={(e) => {
                setForm({ ...form, ruc: e.target.value });
                setValidateMsg(null);
              }}
              maxLength={11}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={doValidate}
              disabled={!rucHasRightFormat || validating}
              style={{ whiteSpace: 'nowrap' }}
              title={
                rucHasRightFormat
                  ? 'Consulta SUNAT vía Decolecta y autocompleta razón social + dirección'
                  : 'RUC debe tener 11 dígitos y empezar con 10/15/17/20'
              }
            >
              {validating ? <div className="spinner" /> : <Icon name="check" size={13} />}
              Validar
            </button>
          </div>
          {validateMsg && (
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 12.5,
                background:
                  validateMsg.kind === 'ok'
                    ? 'var(--success-soft, #f0fdf4)'
                    : validateMsg.kind === 'warn'
                    ? '#fffbeb'
                    : '#fef2f2',
                color:
                  validateMsg.kind === 'ok'
                    ? '#166534'
                    : validateMsg.kind === 'warn'
                    ? '#92400e'
                    : '#b91c1c',
              }}
            >
              {validateMsg.text}
            </div>
          )}
        </div>

        {/* Razón social */}
        <div className="nx-field" style={{ marginBottom: 14 }}>
          <label className="nx-label">Razón social *</label>
          <input
            className="nx-input"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="Ej. RICASA S.A.C."
          />
        </div>

        {/* Dirección */}
        <div className="nx-field" style={{ marginBottom: 14 }}>
          <label className="nx-label">Dirección</label>
          <input
            className="nx-input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Av. Principal 123, Distrito, Ciudad"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="nx-field">
            <label className="nx-label">Contacto principal</label>
            <input
              className="nx-input"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="Nombre del decisor"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Cargo del contacto</label>
            <input
              className="nx-input"
              value={form.contact_role}
              onChange={(e) => setForm({ ...form, contact_role: e.target.value })}
              placeholder="Ej. Gerente General"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Email</label>
            <input
              className="nx-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contacto@empresa.com"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Teléfono</label>
            <input
              className="nx-input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+51 999 999 999"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Industria / Rubro</label>
            <input
              className="nx-input"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="Salud, retail, legal..."
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Tamaño</label>
            <select
              className="nx-select"
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value as ClientSize })}
            >
              <option value="pequeña">Pequeña</option>
              <option value="mediana">Mediana</option>
              <option value="grande">Grande</option>
            </select>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              borderRadius: 6,
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            {isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ink-500)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
};

const td: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
};

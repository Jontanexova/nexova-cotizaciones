import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, Toast, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtMoney, roleLabel } from '../lib/utils';
import { fetchOrgSettings, updateOrgSettings } from '../lib/db';
import type { OrganizationSettings } from '../lib/types';

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
// Reports page
// ═══════════════════════════════════════════════════════════════════════

export function Reports() {
  const { quotes, loading } = useQuotes();
  const { products } = useProducts();

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Reportes" />
        <Loading />
      </div>
    );
  }

  const total = quotes.reduce(
    (s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total,
    0
  );
  const accepted = quotes.filter((q) => q.status === 'aceptada');
  const revenue = accepted.reduce(
    (s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total,
    0
  );
  const pipeline = quotes
    .filter((q) => ['enviada', 'vista', 'negociacion'].includes(q.status))
    .reduce((s, q) => s + computeQuoteTotals(q.items || [], products, q.discount).total, 0);
  const avgTicket = quotes.length ? total / quotes.length : 0;

  return (
    <div className="fade-in">
      <Topbar title="Reportes" subtitle="Métricas consolidadas del pipeline comercial" />
      <div style={{ padding: '24px 32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <Stat label="Ingreso realizado" value={fmtMoney(revenue).replace('S/ ', 'S/')} icon="dollar" />
          <Stat label="Pipeline activo" value={fmtMoney(pipeline).replace('S/ ', 'S/')} icon="chart" />
          <Stat label="Cotizaciones" value={quotes.length} icon="file" />
          <Stat label="Ticket promedio" value={fmtMoney(avgTicket).replace('S/ ', 'S/')} icon="tag" />
        </div>

        <div className="nx-card nx-card-padded">
          <h3 className="h-display" style={{ margin: '0 0 14px', fontSize: 16 }}>
            Distribución por estado
          </h3>
          {['aceptada', 'negociacion', 'vista', 'enviada', 'borrador', 'rechazada'].map((s) => {
            const count = quotes.filter((q) => q.status === s).length;
            const pct = quotes.length ? Math.round((count / quotes.length) * 100) : 0;
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
                    {count} ({pct}%)
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
// Settings page (solo super_admin)
// ═══════════════════════════════════════════════════════════════════════

export function Settings() {
  const { vendor, isSuperAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    (async () => {
      try {
        const o = await fetchOrgSettings();
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
        setLoading(false);
      }
    })();
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const save = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const updated = await updateOrgSettings(org.id, form);
      setOrg(updated);
      setForm({
        name: updated.name || '',
        legal_name: updated.legal_name || '',
        ruc: updated.ruc || '',
        email: updated.email || '',
        phone: updated.phone || '',
        address: updated.address || '',
        website: updated.website || '',
      });
      showToast('✓ Cambios guardados');
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  if (!vendor) return null;
  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Ajustes" />
        <Loading />
      </div>
    );
  }

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
    <div className="fade-in">
      <Topbar
        title="Ajustes"
        subtitle="Perfil y configuración de la organización"
        actions={
          isSuperAdmin && dirty ? (
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar cambios
            </button>
          ) : undefined
        }
      />
      <div style={{ padding: '24px 32px', maxWidth: 780 }}>
        {/* Profile card */}
        <div className="nx-card nx-card-padded" style={{ marginBottom: 14 }}>
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
            Para resetear tu contraseña o cambiar tu rol, contacta a otro Super Admin.
          </div>
        </div>

        {/* Organization card */}
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
              Organización
            </h3>
            {!isSuperAdmin && (
              <span className="nx-chip chip-slate">
                <Icon name="eye" size={11} /> Solo lectura
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Nombre comercial</label>
              <input
                className="nx-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Razón social</label>
              <input
                className="nx-input"
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">RUC</label>
              <input
                className="nx-input"
                value={form.ruc}
                onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Teléfono</label>
              <input
                className="nx-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Email de contacto</label>
              <input
                className="nx-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Sitio web</label>
              <input
                className="nx-input"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://nexova.pe"
                readOnly={!isSuperAdmin}
              />
            </div>
            <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
              <label className="nx-label">Dirección</label>
              <input
                className="nx-input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                readOnly={!isSuperAdmin}
              />
            </div>
          </div>

          {isSuperAdmin && dirty && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
                Guardar cambios
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

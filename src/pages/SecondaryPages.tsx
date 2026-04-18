import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, Toast, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtMoney, roleLabel } from '../lib/utils';
import { fetchOrgSettings, updateOrgSettings, fetchSmtpSettings, updateSmtpSettings } from '../lib/db';
import type { OrganizationSettings, SmtpSettings } from '../lib/types';

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
// Card: cambiar contraseña propia (cualquier usuario autenticado)
// ═══════════════════════════════════════════════════════════════════════

function ChangePasswordCard({ onSuccess }: { onSuccess: () => void }) {
  const { changePassword } = useAuth();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const submit = async () => {
    setError(null);
    if (newPass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(newPass);
      setNewPass('');
      setConfirmPass('');
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nx-card nx-card-padded" style={{ marginBottom: 14 }}>
      <h3 className="h-display" style={{ margin: '0 0 4px', fontSize: 16 }}>
        Cambiar contraseña
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-500)' }}>
        Escoge una contraseña de al menos 8 caracteres. Asegúrate de guardarla en un gestor de
        contraseñas.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-field">
          <label className="nx-label">Nueva contraseña</label>
          <div style={{ position: 'relative' }}>
            <input
              className="nx-input"
              type={show ? 'text' : 'password'}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink-500)',
                padding: 4,
              }}
              title={show ? 'Ocultar' : 'Mostrar'}
            >
              <Icon name="eye" size={14} />
            </button>
          </div>
        </div>
        <div className="nx-field">
          <label className="nx-label">Confirmar contraseña</label>
          <input
            className="nx-input"
            type={show ? 'text' : 'password'}
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={saving || !newPass || !confirmPass}
        >
          {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
          Actualizar contraseña
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Settings page — con tabs: Perfil / Contraseña / Organización / SMTP
// ═══════════════════════════════════════════════════════════════════════

type SettingsTab = 'profile' | 'password' | 'organization' | 'smtp';

export function Settings() {
  const { vendor, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  if (!vendor) return null;

  const tabs: { key: SettingsTab; label: string; icon: any; show: boolean }[] = [
    { key: 'profile', label: 'Perfil', icon: 'eye', show: true },
    { key: 'password', label: 'Contraseña', icon: 'settings', show: true },
    { key: 'organization', label: 'Organización', icon: 'building', show: true },
    { key: 'smtp', label: 'SMTP Server', icon: 'mail', show: isSuperAdmin },
  ];

  return (
    <div className="fade-in">
      <Topbar title="Ajustes" subtitle="Tu perfil y la configuración del sistema" />

      {/* Tabs */}
      <div
        style={{
          padding: '0 32px',
          borderBottom: '1px solid var(--ink-200)',
          background: 'white',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 16px',
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--teal-700)' : 'var(--ink-600)',
                  borderBottom: active ? '2px solid var(--teal-700)' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: -1,
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            );
          })}
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 820 }}>
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'password' && (
          <ChangePasswordCard onSuccess={() => showToast('✓ Contraseña actualizada')} />
        )}
        {activeTab === 'organization' && <OrganizationTab onSaved={() => showToast('✓ Cambios guardados')} />}
        {activeTab === 'smtp' && isSuperAdmin && (
          <SmtpTab onSaved={() => showToast('✓ Configuración SMTP guardada')} />
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Tab: Perfil ───
function ProfileTab() {
  const { vendor } = useAuth();
  if (!vendor) return null;
  return (
    <div className="nx-card nx-card-padded">
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
        Para cambiar tu rol, contacta a un Super Admin. Puedes cambiar tu contraseña en la pestaña
        "Contraseña".
      </div>
    </div>
  );
}

// ─── Tab: Organización ───
function OrganizationTab({ onSaved }: { onSaved: () => void }) {
  const { isSuperAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    let cancelled = false;
    (async () => {
      try {
        const o = await fetchOrgSettings();
        if (cancelled) return;
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
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgSettings(org.id, form);
      setOrg(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

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
    <div className="nx-card nx-card-padded">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 className="h-display" style={{ margin: 0, fontSize: 16 }}>
          Datos de la organización
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
          <input className="nx-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Razón social</label>
          <input className="nx-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">RUC</label>
          <input className="nx-input" value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Teléfono</label>
          <input className="nx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Email de contacto</label>
          <input className="nx-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field">
          <label className="nx-label">Sitio web</label>
          <input className="nx-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://nexova.pe" readOnly={!isSuperAdmin} />
        </div>
        <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
          <label className="nx-label">Dirección</label>
          <input className="nx-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} readOnly={!isSuperAdmin} />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {isSuperAdmin && dirty && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: SMTP ───
function SmtpTab({ onSaved }: { onSaved: () => void }) {
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'Nexova',
    use_tls: true,
    enabled: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSmtpSettings();
        if (cancelled) return;
        if (s) {
          setSmtp(s);
          setForm({
            host: s.host || '',
            port: s.port || 587,
            username: s.username || '',
            password: s.password || '',
            from_email: s.from_email || '',
            from_name: s.from_name || 'Nexova',
            use_tls: s.use_tls ?? true,
            enabled: s.enabled ?? false,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!smtp) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSmtpSettings(smtp.id, form);
      setSmtp(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: 14,
          background: '#fef3c7',
          color: '#92400e',
          borderRadius: 10,
          fontSize: 12.5,
          display: 'flex',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Configuración preparada</div>
          Estos datos se guardan de forma segura para ser usados por una Edge Function que envíe
          emails de cotizaciones y notificaciones. Los emails de "olvidé contraseña" usan el SMTP
          configurado en Supabase Dashboard → Authentication → SMTP Settings (recomendado configurar
          ambos con los mismos datos).
        </div>
      </div>

      <div className="nx-card nx-card-padded">
        <h3 className="h-display" style={{ margin: '0 0 14px', fontSize: 16 }}>
          Servidor SMTP
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Host *</label>
            <input
              className="nx-input"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="smtp.gmail.com, smtp.sendgrid.net, ..."
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Puerto</label>
            <input
              className="nx-input"
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 587 })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Usuario *</label>
            <input
              className="nx-input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="tu@dominio.com"
              autoComplete="off"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Contraseña *</label>
            <input
              className="nx-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Nombre del remitente</label>
            <input
              className="nx-input"
              value={form.from_name}
              onChange={(e) => setForm({ ...form, from_name: e.target.value })}
              placeholder="Nexova"
            />
          </div>
          <div className="nx-field">
            <label className="nx-label">Email del remitente</label>
            <input
              className="nx-input"
              type="email"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              placeholder="no-reply@nexova.pe"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.use_tls} onChange={(e) => setForm({ ...form, use_tls: e.target.checked })} />
            Usar TLS/STARTTLS (recomendado)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Habilitar envío de emails desde la aplicación
          </label>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            Guardar configuración
          </button>
        </div>
      </div>
    </div>
  );
}

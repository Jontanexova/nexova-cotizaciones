import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, Toast, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtMoney, fmtUSD, roleLabel } from '../lib/utils';
import { fetchOrgSettings, updateOrgSettings, updateExchangeRate, updatePeruApiConfig, refreshExchangeRateFromApi, fetchSmtpSettings, updateSmtpSettings, sendEmail } from '../lib/db';
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
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await fetchOrgSettings();
        if (!cancelled) setOrgSettings(o);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
  const showUsd = tc && tc > 0;

  return (
    <div className="fade-in">
      <Topbar title="Reportes" subtitle="Métricas consolidadas del pipeline comercial" />
      <div style={{ padding: '24px 32px' }}>
        {/* Fila 1 — Soles */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: showUsd ? 14 : 20,
          }}
        >
          <Stat label="Ingreso realizado" value={fmtMoney(revenue).replace('S/ ', 'S/')} icon="dollar" />
          <Stat label="Pipeline activo" value={fmtMoney(pipeline).replace('S/ ', 'S/')} icon="chart" />
          <Stat label="Cotizaciones" value={quotes.length} icon="file" />
          <Stat label="Ticket promedio" value={fmtMoney(avgTicket).replace('S/ ', 'S/')} icon="tag" />
        </div>

        {/* Fila 2 — USD (solo si hay TC configurado) */}
        {showUsd && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                fontSize: 11.5,
                color: 'var(--ink-500)',
                fontWeight: 600,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}
            >
              <Icon name="sparkle" size={12} />
              Equivalente en USD · TC referencial S/ {tc!.toFixed(4)} = 1 USD
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 14,
                marginBottom: 20,
              }}
            >
              <Stat
                label="Ingreso realizado (USD)"
                value={fmtUSD(revenue, tc).replace('$ ', '$')}
                icon="dollar"
              />
              <Stat
                label="Pipeline activo (USD)"
                value={fmtUSD(pipeline, tc).replace('$ ', '$')}
                icon="chart"
              />
              <Stat label="Cotizaciones" value={quotes.length} icon="file" />
              <Stat
                label="Ticket promedio (USD)"
                value={fmtUSD(avgTicket, tc).replace('$ ', '$')}
                icon="tag"
              />
            </div>
          </>
        )}

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

type SettingsTab = 'profile' | 'password' | 'organization' | 'exchange' | 'smtp';

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
    { key: 'exchange', label: 'TC', icon: 'dollar', show: true },
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
        {activeTab === 'exchange' && <ExchangeRateTab onSaved={() => showToast('✓ Tipo de cambio actualizado')} />}
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
  const { vendor } = useAuth();
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testTo, setTestTo] = useState('');
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
          // Por defecto el test va al from_email (sabemos que existe como buzón real)
          setTestTo(s.from_email || vendor?.email || '');
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

  const testSmtp = async () => {
    if (!testTo.trim()) {
      setTestResult({ ok: false, msg: 'Ingresa un email destinatario para el test.' });
      return;
    }
    if (!smtp) return;

    // Si el form tiene cambios sin guardar, pedimos guardar primero
    const dirty =
      form.host !== (smtp.host || '') ||
      form.port !== smtp.port ||
      form.username !== (smtp.username || '') ||
      form.password !== (smtp.password || '') ||
      form.from_email !== (smtp.from_email || '') ||
      form.from_name !== (smtp.from_name || '') ||
      form.use_tls !== smtp.use_tls ||
      form.enabled !== smtp.enabled;

    if (dirty) {
      setTestResult({
        ok: false,
        msg: 'Tienes cambios sin guardar. Guarda primero y luego prueba el envío.',
      });
      return;
    }
    if (!form.enabled) {
      setTestResult({
        ok: false,
        msg: 'El envío está deshabilitado. Activa el checkbox y guarda antes de probar.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      await sendEmail({
        to: testTo.trim(),
        subject: 'Nexova · Prueba de envío SMTP',
        html:
          '<div style="font-family:sans-serif;color:#0f172a;"><h2 style="color:#0F766E;">✓ SMTP configurado correctamente</h2>' +
          '<p>Este es un email de prueba enviado desde el panel de Nexova.</p>' +
          '<p style="color:#64748b;font-size:12px;">Si estás recibiendo esto, tu configuración SMTP funciona y la app podrá enviar emails de bienvenida, resets de contraseña y cotizaciones.</p></div>',
        text:
          'SMTP configurado correctamente.\n\n' +
          'Este es un email de prueba desde el panel de Nexova. Si lo recibiste, la config funciona.',
      });
      setTestResult({
        ok: true,
        msg: `Email de prueba enviado a ${testTo.trim()}. Revisa la bandeja (y la carpeta de spam).`,
      });
    } catch (e: any) {
      setTestResult({
        ok: false,
        msg: e?.message || 'No se pudo enviar. Revisa host, puerto, usuario y contraseña.',
      });
    } finally {
      setTesting(false);
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

        {testResult && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: testResult.ok ? '#ecfdf5' : '#fef2f2',
              color: testResult.ok ? '#065f46' : '#b91c1c',
              borderRadius: 8,
              fontSize: 12.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              lineHeight: 1.5,
            }}
          >
            <Icon name={testResult.ok ? 'check' : 'close'} size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{testResult.msg}</span>
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              padding: 12,
              background: 'var(--ink-50)',
              borderRadius: 10,
              border: '1px solid var(--ink-200)',
            }}
          >
            <label className="nx-label" style={{ marginBottom: 6, display: 'block' }}>
              Probar envío — destinatario
            </label>
            <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginBottom: 8, lineHeight: 1.5 }}>
              💡 Envía a un email que <strong>realmente exista</strong>. Si usas una cuenta externa
              (Gmail, Outlook) casi siempre funciona. Si usas tu dominio (@nexova.pe), asegúrate
              que el buzón esté creado en tu panel de hosting.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="nx-input"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="destinatario@ejemplo.com"
                style={{ flex: 1 }}
                disabled={testing}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={testSmtp}
                disabled={testing || saving || !testTo.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {testing ? <div className="spinner" /> : <Icon name="send" size={14} />}
                Enviar prueba
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Tipo de cambio (TC) ───
function ExchangeRateTab({ onSaved }: { onSaved: () => void }) {
  const { vendor, isSuperAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [autoSyncDirty, setAutoSyncDirty] = useState(false);

  const reload = async () => {
    try {
      const o = await fetchOrgSettings();
      if (o) {
        setOrg(o);
        setRate(o.exchange_rate ? String(o.exchange_rate) : '');
        setApiKey(o.peruapi_key || '');
        setAutoSync(!!o.exchange_rate_auto_sync);
        setApiKeyDirty(false);
        setAutoSyncDirty(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveRate = async () => {
    if (!org || !vendor) return;
    const n = Number(rate);
    if (isNaN(n) || n <= 0) {
      setError('Ingresa un tipo de cambio válido (ej. 3.75).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExchangeRate(org.id, n, vendor.id);
      setOrg(updated);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveApiConfig = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const patch: any = {};
      if (apiKeyDirty) patch.peruapi_key = apiKey.trim() || null;
      if (autoSyncDirty) patch.exchange_rate_auto_sync = autoSync;
      const updated = await updatePeruApiConfig(org.id, patch);
      setOrg(updated);
      setApiKeyDirty(false);
      setAutoSyncDirty(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (apiKeyDirty || autoSyncDirty) {
      setSyncResult({
        ok: false,
        msg: 'Guarda primero los cambios en la API key antes de sincronizar.',
      });
      return;
    }
    if (!org?.peruapi_key) {
      setSyncResult({ ok: false, msg: 'Configura primero el API key de peruapi.com.' });
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await refreshExchangeRateFromApi();
      setSyncResult({
        ok: true,
        msg: `TC actualizado a S/ ${r.rate.toFixed(4)} para la fecha ${r.fecha} (compra S/ ${r.compra.toFixed(4)} / venta S/ ${r.venta.toFixed(4)}).`,
      });
      await reload();
    } catch (e: any) {
      setSyncResult({ ok: false, msg: e?.message || 'No se pudo sincronizar.' });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <Loading />;

  const lastUpdatedText = org?.exchange_rate_updated_at
    ? `Última actualización: ${new Date(org.exchange_rate_updated_at).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'No configurado aún.';

  const lastSyncText = org?.exchange_rate_last_sync_at
    ? `Última sincronización: ${new Date(org.exchange_rate_last_sync_at).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })} · ${org.exchange_rate_last_sync_status || ''}`
    : 'Sin sincronizaciones aún.';

  const sourceLabel =
    org?.exchange_rate_source === 'peruapi'
      ? '🔄 Sincronizado desde SUNAT (peruapi.com)'
      : org?.exchange_rate_source === 'manual'
      ? '✏️ Ingresado manualmente'
      : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Info banner */}
      <div
        style={{
          padding: 14,
          background: '#ecfdf5',
          color: '#065f46',
          borderRadius: 10,
          fontSize: 12.5,
          display: 'flex',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Tipo de cambio PEN → USD</div>
          Se aplica como referencia en las cotizaciones: en cada ítem se muestra el equivalente en
          USD. El cálculo es <strong>monto PEN ÷ TC</strong>. Por ejemplo, si el TC es 3.75 y el
          subtotal es S/ 1,270, el equivalente en USD es $ 338.67.
        </div>
      </div>

      {/* Card 1: Tipo de cambio actual */}
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
            Tipo de cambio actual
          </h3>
          {!isSuperAdmin && (
            <span className="nx-chip chip-slate">
              <Icon name="eye" size={11} /> Solo lectura
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, alignItems: 'end' }}>
          <div className="nx-field">
            <label className="nx-label">PEN por 1 USD</label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-500)',
                  fontSize: 13,
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                S/
              </span>
              <input
                className="nx-input"
                type="number"
                step="0.0001"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="3.7500"
                readOnly={!isSuperAdmin}
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>
          <div
            style={{
              padding: 12,
              background: 'var(--ink-50)',
              borderRadius: 8,
              fontSize: 12.5,
              color: 'var(--ink-600)',
              lineHeight: 1.5,
            }}
          >
            {lastUpdatedText}
            {org?.exchange_rate && (
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Equivalencia: <strong>S/ {Number(org.exchange_rate).toFixed(4)}</strong> = 1 USD
              </div>
            )}
            {sourceLabel && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-500)' }}>
                {sourceLabel}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
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

        {isSuperAdmin && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveRate} disabled={saving}>
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar tipo de cambio manual
            </button>
          </div>
        )}
      </div>

      {/* Card 2: Automatización con peruapi.com */}
      {isSuperAdmin && (
        <div className="nx-card nx-card-padded">
          <h3 className="h-display" style={{ margin: '0 0 4px', fontSize: 16 }}>
            Sincronización automática con SUNAT
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5 }}>
            Conecta tu cuenta de{' '}
            <a
              href="https://peruapi.com/panel"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--teal-700)', fontWeight: 600 }}
            >
              peruapi.com
            </a>{' '}
            para traer el tipo de cambio oficial de SUNAT automáticamente. El cron actualiza el TC
            todos los días a las 8 AM hora Lima.
          </p>

          <div className="nx-field">
            <label className="nx-label">API key de peruapi.com</label>
            <input
              className="nx-input"
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyDirty(true);
              }}
              placeholder="aa0fa079ea66d38010a6337aaf72b93f"
              autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 4 }}>
              La obtienes en <strong>peruapi.com/panel</strong> → "Tu API Key".
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 14,
            }}
          >
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => {
                setAutoSync(e.target.checked);
                setAutoSyncDirty(true);
              }}
              disabled={!apiKey.trim()}
            />
            Sincronizar automáticamente cada día a las 8 AM (Lima)
          </label>

          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: 'var(--ink-50)',
              borderRadius: 8,
              fontSize: 11.5,
              color: 'var(--ink-600)',
              lineHeight: 1.5,
            }}
          >
            {lastSyncText}
          </div>

          {syncResult && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: syncResult.ok ? '#ecfdf5' : '#fef2f2',
                color: syncResult.ok ? '#065f46' : '#b91c1c',
                borderRadius: 8,
                fontSize: 12.5,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                lineHeight: 1.5,
              }}
            >
              <Icon
                name={syncResult.ok ? 'check' : 'close'}
                size={14}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <span>{syncResult.msg}</span>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={syncNow}
              disabled={syncing || saving || !apiKey.trim() || apiKeyDirty || autoSyncDirty}
              title={
                apiKeyDirty || autoSyncDirty
                  ? 'Guarda primero los cambios'
                  : 'Consulta peruapi.com y actualiza el TC ahora'
              }
            >
              {syncing ? <div className="spinner" /> : <Icon name="sparkle" size={14} />}
              Sincronizar ahora
            </button>
            <button
              className="btn btn-primary"
              onClick={saveApiConfig}
              disabled={saving || (!apiKeyDirty && !autoSyncDirty)}
            >
              {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Guardar configuración
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

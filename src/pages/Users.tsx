import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Loading, Modal, Toast, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useAuth } from '../contexts/AuthContext';
import {
  adminCreateUser,
  adminDeleteUser,
  adminResetPassword,
  adminUpdateUserRole,
  sendAdminPasswordResetEmail,
  sendNewUserWelcomeEmail,
  fetchAllowedDomains,
  isEmailDomainAllowed,
  extractEmailDomain,
  type CreateUserResult,
} from '../lib/db';
import { fmtDate, roleLabel } from '../lib/utils';
import type { AllowedDomain, Vendor, VendorRole } from '../lib/types';

export function Users() {
  const { vendor: currentUser, isSuperAdmin } = useAuth();
  const { vendors, loading, reload } = useVendors();

  const [showCreate, setShowCreate] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreateUserResult | null>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<{
    vendor: Vendor;
    password: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vendor | null>(null);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // v2.21: cargar dominios permitidos para validar emails antes de crear usuarios
  const [allowedDomains, setAllowedDomains] = useState<AllowedDomain[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const d = await fetchAllowedDomains();
        setAllowedDomains(d);
      } catch {
        // silencioso: si no hay permiso (ej. admin sin acceso), asumir sin restricción client-side.
        // El trigger SQL sigue protegiendo el backend.
        setAllowedDomains([]);
      }
    })();
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRoleChange = async (v: Vendor, newRole: VendorRole) => {
    if (v.id === currentUser?.id && newRole !== 'super_admin') {
      showToast('No puedes quitarte tu propio rol de Super Admin');
      return;
    }
    setWorking(true);
    try {
      await adminUpdateUserRole(v.id, newRole);
      showToast(`Rol actualizado para ${v.name}`);
      await reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo cambiar el rol'));
    } finally {
      setWorking(false);
    }
  };

  const handleResetPassword = async (v: Vendor) => {
    setWorking(true);
    try {
      const { password } = await adminResetPassword(v.id);
      // Intenta enviar el email automáticamente
      const loginUrl = window.location.origin;
      try {
        await sendAdminPasswordResetEmail(v.email, v.name, password, loginUrl);
        showToast(`✓ Contraseña reseteada. Email enviado a ${v.email}`);
        await reload();
      } catch (emailErr: any) {
        // Si falla el email, muestra el modal con la clave (fallback)
        console.warn('Email no enviado, mostrando clave manualmente:', emailErr);
        setResetPasswordFor({ vendor: v, password });
      }
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo resetear la contraseña'));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (v: Vendor) => {
    setWorking(true);
    try {
      await adminDeleteUser(v.id);
      showToast(`Usuario ${v.name} eliminado`);
      setConfirmDelete(null);
      await reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'no se pudo eliminar'));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Usuarios" />
        <Loading />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Topbar
        title="Usuarios del sistema"
        subtitle="Gestiona los accesos del equipo a la plataforma"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} /> Nuevo usuario
          </button>
        }
      />
      <div style={{ padding: '24px 32px' }}>
        <div className="nx-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--ink-50)',
                  color: 'var(--ink-500)',
                  fontSize: 11,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                <th style={{ textAlign: 'left', padding: '12px 20px' }}>Usuario</th>
                <th style={{ textAlign: 'left', padding: '12px 12px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '12px 12px', width: 180 }}>Rol</th>
                <th style={{ textAlign: 'left', padding: '12px 12px' }}>Alta</th>
                <th style={{ width: 200, padding: '12px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const isSelf = v.id === currentUser?.id;
                return (
                  <tr key={v.id} style={{ borderTop: '1px solid var(--ink-100)' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={v.name} color={v.color} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                            {v.name}
                            {isSelf && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: 'var(--teal-50)',
                                  color: 'var(--teal-700)',
                                  fontWeight: 600,
                                }}
                              >
                                Tú
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 12px', color: 'var(--ink-600)' }}>{v.email}</td>
                    <td style={{ padding: '12px 12px' }}>
                      <select
                        className="nx-select"
                        value={v.role}
                        onChange={(e) => handleRoleChange(v, e.target.value as VendorRole)}
                        disabled={working || isSelf || (v.role === 'super_admin' && !isSuperAdmin)}
                        title={v.role === 'super_admin' && !isSuperAdmin ? 'Solo un super admin puede modificar otro super admin' : undefined}
                        style={{ padding: '5px 28px 5px 10px', fontSize: 12, height: 30 }}
                      >
                        {/* Super Admin solo aparece si el usuario actual es super_admin, o si el vendor ya es super_admin (para no mutarlo) */}
                        {(isSuperAdmin || v.role === 'super_admin') && <option value="super_admin">Super Admin</option>}
                        <option value="admin">Administrador</option>
                        <option value="seller">Vendedor</option>
                        <option value="external">Vendedor externo</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 12px', color: 'var(--ink-500)', fontSize: 12.5 }}>
                      {fmtDate(v.created_at)}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleResetPassword(v)}
                          disabled={working}
                          title="Resetear contraseña"
                        >
                          <Icon name="zap" size={12} />
                          Reset pwd
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmDelete(v)}
                          disabled={working || isSelf}
                          title={isSelf ? 'No puedes eliminarte' : 'Eliminar usuario'}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Aún no hay usuarios. Crea el primero con el botón arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: crear usuario */}
      {showCreate && (
        <CreateUserModal
          isSuperAdmin={isSuperAdmin}
          allowedDomains={allowedDomains}
          onClose={() => setShowCreate(false)}
          onCreated={async (result) => {
            setShowCreate(false);
            if ((result as any).emailSent) {
              showToast(`✓ Usuario creado. Email enviado a ${result.email}`);
            } else {
              // Fallback: mostrar credenciales porque el email no salió
              setCreatedUser(result);
            }
            await reload();
          }}
        />
      )}

      {/* Modal: mostrar credenciales (fallback cuando el email no sale) */}
      {createdUser && (
        <CredentialsModal
          title="Usuario creado — email no enviado"
          subtitle={`⚠️ No se pudo enviar el email de bienvenida. Copia estas credenciales y compártelas manualmente con ${createdUser.name}. La contraseña no se podrá recuperar después.`}
          email={createdUser.email}
          password={createdUser.password}
          onClose={() => setCreatedUser(null)}
        />
      )}

      {/* Modal: password reseteada (fallback cuando el email no sale) */}
      {resetPasswordFor && (
        <CredentialsModal
          title="Contraseña reseteada — email no enviado"
          subtitle={`⚠️ No se pudo enviar el email con la nueva clave. Compártela manualmente con ${resetPasswordFor.vendor.name}. La anterior ya no funciona.`}
          email={resetPasswordFor.vendor.email}
          password={resetPasswordFor.password}
          onClose={() => setResetPasswordFor(null)}
        />
      )}

      {/* Modal: confirmar eliminación */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} width={420}>
        {confirmDelete && (
          <div style={{ padding: 24 }}>
            <h3
              className="h-display"
              style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}
            >
              Eliminar usuario
            </h3>
            <p style={{ color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.5, margin: '0 0 20px' }}>
              ¿Confirmas eliminar a <strong>{confirmDelete.name}</strong> ({confirmDelete.email})?
              Esta acción borra su usuario de auth pero <strong>no elimina las cotizaciones que
              creó</strong>. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={working}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={working}
              >
                {working ? <div className="spinner" /> : <Icon name="trash" size={14} />}
                Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Modal: crear usuario ───

function CreateUserModal({
  onClose,
  onCreated,
  isSuperAdmin,
  allowedDomains,
}: {
  onClose: () => void;
  onCreated: (r: CreateUserResult) => void;
  isSuperAdmin: boolean;
  allowedDomains: AllowedDomain[];
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<VendorRole>('seller');
  const [color, setColor] = useState('#0F766E');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = [
    '#0F766E',
    '#2563EB',
    '#7C3AED',
    '#DB2777',
    '#EA580C',
    '#65A30D',
    '#0891B2',
    '#DC2626',
  ];

  // v2.21: validación client-side de dominio
  const emailDomain = extractEmailDomain(email);
  const domainOk = isEmailDomainAllowed(email, allowedDomains);
  const domainWarning = email.trim() && !domainOk
    ? `El dominio "${emailDomain || '(sin dominio)'}" no está en la lista de dominios permitidos. Pide a un super admin que lo agregue en Ajustes → Dominios permitidos.`
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainOk) {
      setError(domainWarning);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await adminCreateUser({ email: email.trim(), name: name.trim(), role, color });
      // Intenta enviar email de bienvenida (best-effort, no bloquea si falla)
      try {
        const loginUrl = window.location.origin;
        await sendNewUserWelcomeEmail(r.email, r.name, r.password, loginUrl);
        // Marcamos en el resultado que el email salió OK
        (r as any).emailSent = true;
      } catch (emailErr) {
        console.warn('Email de bienvenida no enviado:', emailErr);
        (r as any).emailSent = false;
      }
      onCreated(r);
    } catch (e: any) {
      setError(e?.message || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} width={500}>
      <form onSubmit={submit} style={{ padding: 24 }}>
        <h3 className="h-display" style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>
          Nuevo usuario
        </h3>
        <p style={{ color: 'var(--ink-500)', fontSize: 13, margin: '0 0 20px' }}>
          Se generará una contraseña aleatoria. La verás una sola vez.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Nombre completo *</label>
            <input
              className="nx-input"
              placeholder="Ej. Andrea Vargas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="nx-field">
            <label className="nx-label">Email *</label>
            <input
              type="email"
              className="nx-input"
              placeholder="andrea@nexova.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="nx-field">
            <label className="nx-label">Rol</label>
            <select
              className="nx-select"
              value={role}
              onChange={(e) => setRole(e.target.value as VendorRole)}
            >
              <option value="seller">Vendedor</option>
              <option value="external">Vendedor externo</option>
              <option value="admin">Administrador</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
            <span className="nx-hint">
              {role === 'super_admin'
                ? 'Acceso total sin restricciones, incluyendo Dominios permitidos y gestión de otros super admins.'
                : role === 'admin'
                ? 'Acceso total excepto: Dominios permitidos y gestión de super admins.'
                : role === 'seller'
                ? 'Puede ver todo menos Usuarios y Ajustes. Ve solo sus propias cotizaciones.'
                : 'Vendedor externo. Mismas restricciones que Vendedor.'}
            </span>
          </div>

          {/* v2.21: aviso si el dominio del email no está permitido */}
          {domainWarning && (
            <div
              style={{
                padding: '10px 12px',
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: 6,
                fontSize: 12,
                color: '#92400E',
                lineHeight: 1.5,
              }}
            >
              ⚠ {domainWarning}
            </div>
          )}

          <div className="nx-field">
            <label className="nx-label">Color del avatar</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: c,
                    border: color === c ? '3px solid var(--ink-900)' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" /> Creando…
                </>
              ) : (
                <>
                  <Icon name="plus" size={14} /> Crear usuario
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal: mostrar credenciales ───

function CredentialsModal({
  title,
  subtitle,
  email,
  password,
  onClose,
}: {
  title: string;
  subtitle: string;
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  const copy = async (text: string, kind: 'email' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  return (
    <Modal open={true} onClose={onClose} width={500}>
      <div style={{ padding: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--success-soft)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="check" size={28} />
        </div>
        <h3 className="h-display" style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
          {title}
        </h3>
        <p style={{ color: 'var(--ink-600)', fontSize: 13, lineHeight: 1.55, margin: '0 0 20px' }}>
          {subtitle}
        </p>

        <div
          style={{
            padding: 16,
            background: 'var(--ink-50)',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <CredRow label="Email" value={email} onCopy={() => copy(email, 'email')} copied={copied === 'email'} />
          <div style={{ height: 1, background: 'var(--ink-200)', margin: '12px 0' }} />
          <CredRow
            label="Contraseña"
            value={password}
            onCopy={() => copy(password, 'password')}
            copied={copied === 'password'}
            mono
          />
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: 'var(--accent-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400E',
            display: 'flex',
            gap: 8,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Esta contraseña no podrá recuperarse. Cópiala ahora y compártela por un canal seguro.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-soft"
            onClick={() => copy(`${email}\n${password}`, 'both')}
          >
            <Icon name="copy" size={14} />
            {copied === 'both' ? 'Copiado ✓' : 'Copiar ambos'}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CredRow({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '.08em',
            color: 'var(--ink-500)',
            textTransform: 'uppercase',
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            fontWeight: 600,
            fontSize: mono ? 14 : 13.5,
            color: 'var(--ink-900)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onCopy}
        style={{ flexShrink: 0 }}
      >
        <Icon name="copy" size={12} />
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
}

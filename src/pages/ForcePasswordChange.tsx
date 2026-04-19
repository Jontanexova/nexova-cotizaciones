import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { NexovaLogo } from '../components/UI';

/**
 * Pantalla que se muestra cuando vendor.must_change_password === true.
 * El usuario NO puede navegar a otra parte de la app hasta que cambie su
 * contraseña temporal por una propia.
 */
export function ForcePasswordChange() {
  const { vendor, changePassword, signOut } = useAuth();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSubmitting(true);
    try {
      await changePassword(newPass);
      // AuthContext limpiará must_change_password y refrescará vendor.
      // AppShell dejará pasar al usuario automáticamente.
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar la contraseña.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ink-50)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'white',
          borderRadius: 16,
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <NexovaLogo size={32} />
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: 'var(--amber-50, #fef3c7)',
            color: '#92400e',
            borderRadius: 8,
            fontSize: 12.5,
            marginBottom: 18,
            display: 'flex',
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Estás usando una contraseña temporal. Por seguridad, debes crear una nueva antes de
            continuar.
          </span>
        </div>

        <h2 className="h-display" style={{ margin: '0 0 4px', fontSize: 22 }}>
          Bienvenido{vendor?.name ? `, ${vendor.name.split(' ')[0]}` : ''}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
          Crea una contraseña personal de al menos 8 caracteres. Guárdala en un lugar seguro.
        </p>

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
              autoFocus
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
            >
              <Icon name="eye" size={14} />
            </button>
          </div>
        </div>

        <div className="nx-field" style={{ marginTop: 12 }}>
          <label className="nx-label">Confirmar contraseña</label>
          <input
            className="nx-input"
            type={show ? 'text' : 'password'}
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
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

        <button
          type="button"
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: 18 }}
          onClick={submit}
          disabled={submitting || !newPass || !confirmPass}
        >
          {submitting ? <div className="spinner" /> : <Icon name="check" size={14} />}
          Crear contraseña y continuar
        </button>

        <button
          type="button"
          onClick={signOut}
          style={{
            marginTop: 10,
            background: 'none',
            border: 'none',
            color: 'var(--ink-500)',
            fontSize: 12.5,
            cursor: 'pointer',
            width: '100%',
            padding: 8,
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

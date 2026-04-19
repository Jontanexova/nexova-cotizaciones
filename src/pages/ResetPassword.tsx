import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { NexovaLogo } from '../components/UI';

/**
 * Esta página recibe al usuario después de hacer click en el link del email
 * de "olvidé contraseña". Supabase automáticamente intercambia los tokens de
 * la URL por una sesión válida (via detectSessionInUrl) y dispara el evento
 * PASSWORD_RECOVERY en onAuthStateChange.
 *
 * Nuestro cliente tiene detectSessionInUrl: false, así que manejamos los
 * tokens manualmente desde la URL hash.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Al montar, establecer sesión desde los tokens del hash de la URL
  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');

        if (!accessToken || !refreshToken) {
          setTokenError(
            'El link de recuperación es inválido o ya expiró. Solicita uno nuevo desde la pantalla de login.',
          );
          return;
        }
        if (type && type !== 'recovery') {
          setTokenError('Este link no es de recuperación de contraseña.');
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;

        // Limpia el hash para no dejar tokens visibles
        window.history.replaceState(null, '', window.location.pathname);
        setSessionReady(true);
      } catch (e: any) {
        setTokenError(e?.message || 'No se pudo validar el link. Solicita uno nuevo.');
      }
    })();
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = async () => {
    await supabase.auth.signOut();
    navigate('/');
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
          maxWidth: 440,
          background: 'white',
          borderRadius: 16,
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <NexovaLogo size={32} />
        </div>

        {tokenError ? (
          <>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                background: '#fef2f2',
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Icon name="close" size={24} />
            </div>
            <h2 className="h-display" style={{ margin: '0 0 8px', fontSize: 20 }}>
              Link inválido
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
              {tokenError}
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={goToLogin}>
              Volver al login
            </button>
          </>
        ) : success ? (
          <>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                background: 'var(--teal-50)',
                color: 'var(--teal-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Icon name="check" size={24} />
            </div>
            <h2 className="h-display" style={{ margin: '0 0 8px', fontSize: 20 }}>
              Contraseña actualizada
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
              Tu contraseña se cambió correctamente. Ahora puedes iniciar sesión con la nueva.
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={goToLogin}>
              Ir al login
            </button>
          </>
        ) : !sessionReady ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-500)', fontSize: 13.5 }}>
            Validando link…
          </div>
        ) : (
          <>
            <h2 className="h-display" style={{ margin: '0 0 4px', fontSize: 20 }}>
              Crea una contraseña nueva
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.5 }}>
              Elige una contraseña de al menos 8 caracteres. Guárdala en un lugar seguro.
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
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 18 }}
              onClick={submit}
              disabled={submitting || !newPass || !confirmPass}
            >
              {submitting ? <div className="spinner" /> : <Icon name="check" size={14} />}
              Actualizar contraseña
            </button>
          </>
        )}
      </div>
    </div>
  );
}

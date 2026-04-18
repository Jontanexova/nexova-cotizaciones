import { useState } from 'react';
import { Icon } from '../components/Icon';
import { NexovaLogo } from '../components/UI';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      const msg = e?.message || 'Error al iniciar sesión';
      if (msg.toLowerCase().includes('invalid')) {
        setError('Email o contraseña incorrectos');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        background: 'var(--ink-50)',
      }}
    >
      {/* Brand side */}
      <div
        style={{
          position: 'relative',
          background:
            'linear-gradient(150deg, var(--teal-900) 0%, var(--teal-700) 60%, var(--teal-600) 100%)',
          color: 'white',
          padding: '48px 64px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <svg
          style={{ position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none' }}
          width="100%"
          height="100%"
        >
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <svg
          style={{ position: 'absolute', right: -80, top: -40, opacity: 0.14 }}
          width="520"
          height="520"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path d="M100 10L170 50V130L100 170L30 130V50L100 10Z" stroke="white" strokeWidth="1" />
          <path d="M100 40L140 65V115L100 140L60 115V65L100 40Z" stroke="white" strokeWidth="1" />
          <path d="M100 70L115 80V100L100 110L85 100V80L100 70Z" stroke="white" strokeWidth="1" />
        </svg>

        <NexovaLogo size={44} light />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 520 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 12,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.18)',
              fontWeight: 600,
              letterSpacing: '.04em',
              marginBottom: 28,
            }}
          >
            <Icon name="sparkle" size={14} /> SISTEMA INTELIGENTE DE COTIZACIONES
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 48,
              lineHeight: 1.05,
              margin: '0 0 18px',
              letterSpacing: '-.02em',
            }}
          >
            Cotiza más rápido, <br />
            con la inteligencia <br />
            de Nexova.
          </h1>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.6,
              color: 'rgba(255,255,255,.78)',
              margin: 0,
              maxWidth: 440,
            }}
          >
            Genera propuestas comerciales con branding impecable, precios sugeridos por IA y
            entrega como PDF o link compartible — todo desde un solo panel.
          </p>
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: 'rgba(255,255,255,.55)',
            letterSpacing: '.04em',
          }}
        >
          © 2026 Nexova · Software Empresarial
        </div>
      </div>

      {/* Login side */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 56px',
          position: 'relative',
        }}
      >
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--ink-500)',
                fontWeight: 600,
                letterSpacing: '.08em',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              Panel comercial · v1.4
            </div>
            <h2
              className="h-display"
              style={{ margin: 0, fontSize: 30, fontWeight: 700, color: 'var(--ink-900)' }}
            >
              Bienvenido de vuelta
            </h2>
            <p style={{ color: 'var(--ink-500)', fontSize: 14.5, margin: '6px 0 0' }}>
              Inicia sesión con tus credenciales para continuar
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Email corporativo</label>
              <input
                type="email"
                className="nx-input"
                placeholder="tu@nexova.pe"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="nx-field">
              <label className="nx-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="nx-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink-400)',
                    padding: 6,
                  }}
                >
                  <Icon name="eye" size={16} />
                </button>
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

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: 4 }}
            >
              {loading ? (
                <>
                  <div className="spinner" /> Iniciando…
                </>
              ) : (
                <>
                  Entrar
                  <Icon name="arrowRight" size={16} />
                </>
              )}
            </button>

            <div
              style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--ink-50)',
                border: '1px solid var(--ink-200)',
                fontSize: 12,
                color: 'var(--ink-600)',
                display: 'flex',
                gap: 8,
                lineHeight: 1.5,
              }}
            >
              <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Las cuentas son creadas por un <strong>Super Admin</strong>. Si necesitas acceso,
                contacta al administrador del sistema.
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

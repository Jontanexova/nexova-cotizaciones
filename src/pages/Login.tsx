import { useState } from 'react';
import { Icon } from '../components/Icon';
import { NexovaLogo } from '../components/UI';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'signin' | 'signup';

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        if (!name.trim()) throw new Error('El nombre es requerido');
        await signUp(email.trim(), password, {
          name: name.trim(),
          role: 'seller',
          color: '#0F766E',
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Error al iniciar sesión');
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
              Panel comercial · v1.0
            </div>
            <h2
              className="h-display"
              style={{ margin: 0, fontSize: 30, fontWeight: 700, color: 'var(--ink-900)' }}
            >
              {mode === 'signin' ? 'Bienvenido de vuelta' : 'Crear cuenta'}
            </h2>
            <p style={{ color: 'var(--ink-500)', fontSize: 14.5, margin: '6px 0 0' }}>
              {mode === 'signin'
                ? 'Inicia sesión para continuar'
                : 'Regístrate para empezar a generar cotizaciones'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div className="nx-field">
                <label className="nx-label">Nombre completo</label>
                <input
                  className="nx-input"
                  placeholder="Ej. Jonathan Mendoza"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="nx-field">
              <label className="nx-label">Email corporativo</label>
              <input
                type="email"
                className="nx-input"
                placeholder="tu@nexova.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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
                  minLength={6}
                  style={{ paddingRight: 40 }}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
                  <div className="spinner" /> Procesando…
                </>
              ) : (
                <>
                  {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
                  <Icon name="arrowRight" size={16} />
                </>
              )}
            </button>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                fontSize: 12.5,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--teal-700)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                }}
              >
                {mode === 'signin'
                  ? '¿Primera vez? Crear cuenta nueva'
                  : '¿Ya tienes cuenta? Iniciar sesión'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

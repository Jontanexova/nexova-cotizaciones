import type { CSSProperties, ReactNode } from 'react';
import { STATUS_MAP } from '../lib/utils';
import type { QuoteStatus } from '../lib/types';
import { Icon } from './Icon';

// ─── Logo ───
export function NexovaLogo({
  size = 32,
  light = false,
  showSub = true,
}: {
  size?: number;
  light?: boolean;
  showSub?: boolean;
}) {
  return (
    <div className={'nx-logo' + (light ? ' nx-logo--light' : '')}>
      <span className="nx-mark" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none">
          <path
            d="M16 3.5L27 10v12L16 28.5 5 22V10L16 3.5z"
            stroke="white"
            strokeWidth="1.6"
            fill="none"
            opacity="0.9"
          />
          <path
            d="M11 10v12M11 10l10 12M21 10v12"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </span>
      <span>
        <span className="nx-wordmark">NEXOVA</span>
        {showSub && <span className="nx-subtle">Software Empresarial</span>}
      </span>
    </div>
  );
}

// ─── Avatar ───
export function Avatar({
  name,
  color,
  size = 32,
  initials,
}: {
  name?: string;
  color?: string;
  size?: number;
  initials?: string;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: color || '#0F766E',
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: size * 0.38,
        letterSpacing: '.02em',
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15), 0 1px 2px rgba(15,23,42,.15)',
      }}
      title={name}
    >
      {initials ||
        name
          ?.split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
    </span>
  );
}

// ─── Stat card ───
export function Stat({
  label,
  value,
  delta,
  icon,
  accent = 'var(--teal-700)',
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon?: any;
  accent?: string;
}) {
  return (
    <div
      className="nx-card"
      style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 12,
            color: 'var(--ink-500)',
            fontWeight: 600,
            letterSpacing: '.02em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--teal-50)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accent,
            }}
          >
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: '-.02em',
          color: 'var(--ink-900)',
        }}
      >
        {value}
      </div>
      {delta && (
        <div
          style={{
            fontSize: 12,
            color: delta.startsWith('+') ? 'var(--success)' : 'var(--danger)',
            fontWeight: 600,
          }}
        >
          {delta} <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>vs. mes anterior</span>
        </div>
      )}
    </div>
  );
}

// ─── Status chip ───
export function StatusChip({ status }: { status: QuoteStatus }) {
  const s = STATUS_MAP[status];
  if (!s) return null;
  return (
    <span className={'nx-chip ' + s.chip}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Modal ───
export function Modal({
  open,
  onClose,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(11,18,32,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-in"
        style={
          {
            background: 'white',
            borderRadius: 16,
            width: '100%',
            maxWidth: width,
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            WebkitOverflowScrolling: 'touch',
          } satisfies CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

// ─── Topbar ───
export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '20px 32px',
        background: 'white',
        borderBottom: '1px solid var(--ink-200)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <h1
          className="h-display"
          style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

// ─── Loading state ───
export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        gap: 12,
        color: 'var(--ink-500)',
      }}
    >
      <div className="spinner" />
      <span style={{ fontSize: 13.5 }}>{label}</span>
    </div>
  );
}

// ─── Toast ───
export function Toast({ message }: { message: string }) {
  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        bottom: 26,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 22px',
        borderRadius: 12,
        background: 'var(--ink-900)',
        color: 'white',
        fontSize: 13.5,
        fontWeight: 500,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
      }}
    >
      {message}
    </div>
  );
}

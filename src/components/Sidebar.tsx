import { useState } from 'react';
import { Icon } from './Icon';
import { NexovaLogo, Avatar } from './UI';
import type { Vendor } from '../lib/types';
import { roleLabel } from '../lib/utils';

interface SidebarProps {
  current: string;
  onNavigate: (key: string) => void;
  user: Vendor;
  onLogout: () => void;
}

export function Sidebar({ current, onNavigate, user, onLogout }: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isSuperAdmin = user.role === 'super_admin';

  // Menu: todos ven Panel/Cotizaciones/Productos/Vendedores/Reportes
  // Solo super_admin ve Usuarios y Ajustes
  const items = [
    { key: 'dashboard', label: 'Panel', icon: 'dashboard' as const },
    { key: 'new', label: 'Nueva cotización', icon: 'plus' as const, action: true },
    { key: 'quotes', label: 'Cotizaciones', icon: 'file' as const },
    { key: 'products', label: 'Productos', icon: 'box' as const },
    { key: 'vendors', label: 'Vendedores', icon: 'users' as const },
    { key: 'reports', label: 'Reportes', icon: 'chart' as const },
    ...(isSuperAdmin
      ? [
          { key: 'users', label: 'Usuarios', icon: 'users' as const, highlight: true },
          { key: 'settings', label: 'Ajustes', icon: 'settings' as const },
        ]
      : []),
  ];

  return (
    <aside
      style={{
        width: 248,
        background: 'white',
        borderRight: '1px solid var(--ink-200)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px',
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '4px 10px 14px' }}>
        <NexovaLogo size={34} />
      </div>

      <div style={{ padding: '4px 0 10px' }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '.14em',
            color: 'var(--ink-400)',
            textTransform: 'uppercase',
            padding: '0 10px 8px',
          }}
        >
          Menú principal
        </div>

        {items.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                border: 'none',
                background: active ? 'var(--teal-50)' : 'transparent',
                color: active ? 'var(--teal-700)' : 'var(--ink-700)',
                fontWeight: active ? 600 : 500,
                fontSize: 13.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'background .14s',
                marginBottom: 2,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'var(--ink-50)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
              {item.action && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 9.5,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--teal-700)',
                    color: 'white',
                    fontWeight: 700,
                    letterSpacing: '.04em',
                  }}
                >
                  NUEVO
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            background: 'white',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <Avatar name={user.name} color={user.color} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-900)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{roleLabel[user.role]}</div>
          </div>
          <Icon name="chevDown" size={14} />
        </button>

        {menuOpen && (
          <div
            className="fade-in"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'white',
              border: '1px solid var(--ink-200)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-lg)',
              padding: 6,
              zIndex: 10,
            }}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name="logout" size={14} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

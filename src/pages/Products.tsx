import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, Topbar } from '../components/UI';
import { useProducts } from '../hooks/useProducts';
import { fmtMoney } from '../lib/utils';

export function Products() {
  const { products, loading } = useProducts();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="fade-in">
        <Topbar title="Catálogo de productos" />
        <Loading />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Topbar
        title="Catálogo de productos"
        subtitle="Productos y módulos disponibles para cotizar"
      />
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map((p) => {
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="nx-card" style={{ overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className="h-display"
                        style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}
                      >
                        {p.name}
                      </span>
                      <span className="nx-chip chip-slate">{p.category}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 4 }}>
                      {p.description}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {fmtMoney(p.base_price)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>/ {p.unit}</div>
                  </div>
                  <Icon
                    name={isOpen ? 'chevDown' : 'chevRight'}
                    size={16}
                    style={{ color: 'var(--ink-400)' }}
                  />
                </button>
                {isOpen && p.modules && p.modules.length > 0 && (
                  <div
                    className="fade-in"
                    style={{
                      padding: '8px 20px 20px',
                      borderTop: '1px solid var(--ink-100)',
                      background: 'var(--ink-50)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '.08em',
                        color: 'var(--ink-500)',
                        textTransform: 'uppercase',
                        margin: '10px 0 8px',
                      }}
                    >
                      Módulos opcionales
                    </div>
                    {p.modules.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          fontSize: 13,
                          borderTop: '1px solid var(--ink-200)',
                        }}
                      >
                        <span style={{ color: 'var(--ink-700)' }}>{m.name}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            fontFamily: 'var(--font-display)',
                            color: 'var(--teal-700)',
                          }}
                        >
                          +{fmtMoney(m.price)}
                        </span>
                      </div>
                    ))}
                    {p.recurring_name && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 10,
                          background: 'var(--accent-soft)',
                          borderRadius: 8,
                          fontSize: 12.5,
                        }}
                      >
                        <strong>{p.recurring_name}:</strong> {fmtMoney(p.recurring_price || 0)} /{' '}
                        {p.recurring_unit}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

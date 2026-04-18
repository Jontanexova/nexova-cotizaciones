import { Icon } from '../components/Icon';
import { Avatar, Loading, Stat, Topbar } from '../components/UI';
import { useVendors } from '../hooks/useVendors';
import { useQuotes } from '../hooks/useQuotes';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { computeQuoteTotals, fmtMoney, roleLabel } from '../lib/utils';

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
                        (v.role === 'admin'
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
// Settings page
// ═══════════════════════════════════════════════════════════════════════

export function Settings() {
  const { vendor } = useAuth();
  if (!vendor) return null;

  return (
    <div className="fade-in">
      <Topbar title="Ajustes" subtitle="Perfil y preferencias" />
      <div style={{ padding: '24px 32px', maxWidth: 780 }}>
        <div className="nx-card nx-card-padded" style={{ marginBottom: 14 }}>
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
                    (vendor.role === 'admin'
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
            Para editar tu rol o permisos, contacta a un administrador.
          </div>
        </div>

        <div className="nx-card nx-card-padded">
          <h3 className="h-display" style={{ margin: '0 0 12px', fontSize: 16 }}>
            Organización
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Nombre comercial</label>
              <input className="nx-input" defaultValue="Nexova" readOnly />
            </div>
            <div className="nx-field">
              <label className="nx-label">RUC</label>
              <input className="nx-input" defaultValue="20605541231" readOnly />
            </div>
            <div className="nx-field">
              <label className="nx-label">Email contacto</label>
              <input className="nx-input" defaultValue="contacto@nexova.io" readOnly />
            </div>
            <div className="nx-field">
              <label className="nx-label">Teléfono</label>
              <input className="nx-input" defaultValue="+51 1 640 8822" readOnly />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

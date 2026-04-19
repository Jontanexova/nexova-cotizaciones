import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, Modal, Toast, Topbar } from '../components/UI';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { fmtMoney } from '../lib/utils';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createProductModule,
  updateProductModule,
  deleteProductModule,
  type ProductInput,
  type ProductModuleInput,
} from '../lib/db';
import type { Product, ProductCategory, ProductModule } from '../lib/types';

const CATEGORIES: ProductCategory[] = [
  'Producto propio',
  'Servicio',
  'Recurrente',
  'Consultoría',
  'Capacitación',
];

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // tildes
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item'
  );
}

export function Products() {
  const { isSuperAdmin } = useAuth();
  const { products, loading, reload } = useProducts();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [productModal, setProductModal] = useState<{
    mode: 'create' | 'edit';
    product?: Product;
  } | null>(null);
  const [moduleModal, setModuleModal] = useState<{
    productId: string;
    mode: 'create' | 'edit';
    module?: ProductModule;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`¿Eliminar producto "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteProduct(p.id);
      showToast('✓ Producto eliminado');
      reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'No se pudo eliminar'));
    }
  };

  const handleDeleteModule = async (m: ProductModule) => {
    if (!confirm(`¿Eliminar módulo "${m.name}"?`)) return;
    try {
      await deleteProductModule(m.id);
      showToast('✓ Módulo eliminado');
      reload();
    } catch (e: any) {
      showToast('Error: ' + (e?.message || 'No se pudo eliminar'));
    }
  };

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
        subtitle={
          isSuperAdmin
            ? 'Gestiona productos y módulos disponibles para cotizar'
            : 'Productos y módulos disponibles para cotizar'
        }
        actions={
          isSuperAdmin ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setProductModal({ mode: 'create' })}
            >
              <Icon name="plus" size={14} /> Nuevo producto
            </button>
          ) : undefined
        }
      />
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map((p) => {
            const isOpen = expanded === p.id;
            const modules = p.modules || [];
            return (
              <div key={p.id} className="nx-card" style={{ padding: 0 }}>
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{p.name}</h3>
                      <span className="nx-chip chip-slate" style={{ fontSize: 11 }}>
                        {p.category}
                      </span>
                      {!p.active && (
                        <span className="nx-chip chip-amber" style={{ fontSize: 11 }}>
                          Inactivo
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{p.description}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal-700)' }}>
                      {fmtMoney(p.base_price)}
                    </div>
                    {p.requires_recurring && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 7px',
                          background: 'var(--teal-50)',
                          color: 'var(--teal-700)',
                          borderRadius: 999,
                          fontWeight: 600,
                          letterSpacing: '.04em',
                          marginTop: 3,
                          display: 'inline-block',
                        }}
                      >
                        RECURRENTE
                      </span>
                    )}
                    {!p.requires_recurring && p.recurring_price != null && p.recurring_price > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                        + {fmtMoney(p.recurring_price)} {p.recurring_unit || '/mes'}
                      </div>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setProductModal({ mode: 'edit', product: p })}
                        title="Editar"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDeleteProduct(p)}
                        title="Eliminar"
                        style={{ color: '#dc2626' }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  )}
                  <Icon
                    name="filter"
                    size={14}
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform .2s',
                      color: 'var(--ink-400)',
                    }}
                  />
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--ink-100)', padding: '12px 20px 16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-600)' }}>
                        Módulos ({modules.length})
                      </span>
                      {isSuperAdmin && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setModuleModal({ productId: p.id, mode: 'create' })
                          }
                        >
                          <Icon name="plus" size={12} /> Añadir módulo
                        </button>
                      )}
                    </div>
                    {modules.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink-500)',
                          padding: 12,
                          background: 'var(--ink-50)',
                          borderRadius: 8,
                          textAlign: 'center',
                        }}
                      >
                        Este producto aún no tiene módulos.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {modules.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 12px',
                              background: 'var(--ink-50)',
                              borderRadius: 8,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ flex: 1 }}>{m.name}</span>
                            <span style={{ fontWeight: 700, color: 'var(--teal-700)' }}>
                              {fmtMoney(m.price)}
                            </span>
                            {!m.active && (
                              <span className="nx-chip chip-amber" style={{ fontSize: 10 }}>
                                Inactivo
                              </span>
                            )}
                            {isSuperAdmin && (
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() =>
                                    setModuleModal({
                                      productId: p.id,
                                      mode: 'edit',
                                      module: m,
                                    })
                                  }
                                  title="Editar"
                                >
                                  <Icon name="edit" size={12} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleDeleteModule(m)}
                                  title="Eliminar"
                                  style={{ color: '#dc2626' }}
                                >
                                  <Icon name="close" size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {products.length === 0 && (
            <div
              className="nx-card nx-card-padded"
              style={{ textAlign: 'center', color: 'var(--ink-500)' }}
            >
              Aún no hay productos.
              {isSuperAdmin && ' Crea el primero con el botón de arriba.'}
            </div>
          )}
        </div>
      </div>

      {/* Modales CRUD */}
      {productModal && (
        <ProductFormModal
          mode={productModal.mode}
          product={productModal.product}
          existingIds={products.map((p) => p.id)}
          onClose={() => setProductModal(null)}
          onSaved={(msg) => {
            setProductModal(null);
            showToast(msg);
            reload();
          }}
        />
      )}
      {moduleModal && (
        <ModuleFormModal
          productId={moduleModal.productId}
          productRequiresRecurring={
            products.find((p) => p.id === moduleModal.productId)?.requires_recurring ?? false
          }
          mode={moduleModal.mode}
          module={moduleModal.module}
          existingIds={products.flatMap((p) => (p.modules || []).map((m) => m.id))}
          onClose={() => setModuleModal(null)}
          onSaved={(msg) => {
            setModuleModal(null);
            showToast(msg);
            reload();
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal: crear/editar producto
// ═══════════════════════════════════════════════════════════════════════

function ProductFormModal({
  mode,
  product,
  existingIds,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  product?: Product;
  existingIds: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState<ProductInput>({
    id: product?.id || '',
    name: product?.name || '',
    category: product?.category || 'Producto propio',
    base_price: product?.base_price || 0,
    unit: product?.unit || '',
    description: product?.description || '',
    default_weeks: product?.default_weeks || 4,
    recurring_name: product?.recurring_name || '',
    recurring_price: product?.recurring_price || 0,
    recurring_unit: product?.recurring_unit || '/mes',
    // v2.18
    requires_recurring: product?.requires_recurring ?? false,
    recurring_monthly_price: product?.recurring_monthly_price || 0,
    active: product?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-generar id desde name solo en modo create
  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      id: mode === 'create' ? slugify(name) : f.id,
    }));
  };

  const submit = async () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('El nombre es requerido');
      return;
    }
    if (!form.id.trim()) {
      setFormError('El identificador es requerido');
      return;
    }
    if (mode === 'create' && existingIds.includes(form.id)) {
      setFormError(`El identificador "${form.id}" ya existe`);
      return;
    }

    setSaving(true);
    try {
      const payload: ProductInput = {
        ...form,
        base_price: Number(form.base_price) || 0,
        default_weeks: form.default_weeks ? Number(form.default_weeks) : null,
        recurring_price:
          form.recurring_price && Number(form.recurring_price) > 0
            ? Number(form.recurring_price)
            : null,
        unit: form.unit?.trim() || null,
        description: form.description?.trim() || null,
        recurring_name: form.recurring_name?.trim() || null,
        recurring_unit: form.recurring_unit?.trim() || null,
        // v2.18
        requires_recurring: !!form.requires_recurring,
        recurring_monthly_price: Number(form.recurring_monthly_price) || 0,
      };
      if (mode === 'create') {
        await createProduct(payload);
        onSaved('✓ Producto creado');
      } else if (product) {
        await updateProduct(product.id, payload);
        onSaved('✓ Producto actualizado');
      }
    } catch (e: any) {
      setFormError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={560}>
      <div style={{ padding: 24 }}>
        <h2 className="h-display" style={{ margin: '0 0 4px' }}>
          {mode === 'create' ? 'Nuevo producto' : 'Editar producto'}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ink-500)' }}>
          Los productos se usan como líneas en las cotizaciones.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Nombre *</label>
            <input
              className="nx-input"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej. CRM Pro"
              autoFocus
            />
          </div>

          <div className="nx-field">
            <label className="nx-label">Identificador (slug)</label>
            <input
              className="nx-input"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: slugify(e.target.value) })}
              placeholder="crm-pro"
              disabled={mode === 'edit'}
              style={mode === 'edit' ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
              {mode === 'edit'
                ? 'El identificador no se puede cambiar una vez creado.'
                : 'Se genera automáticamente del nombre. Usa solo minúsculas, números y guiones.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Categoría *</label>
              <select
                className="nx-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="nx-field">
              <label className="nx-label">Precio base (S/)</label>
              <input
                className="nx-input"
                type="number"
                step="0.01"
                min="0"
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="nx-field">
            <label className="nx-label">Descripción</label>
            <textarea
              className="nx-input"
              rows={3}
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Qué incluye, a quién va dirigido, etc."
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Unidad</label>
              <input
                className="nx-input"
                value={form.unit || ''}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="Ej. setup, proyecto, hora"
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Semanas por defecto</label>
              <input
                className="nx-input"
                type="number"
                min="0"
                value={form.default_weeks || ''}
                onChange={(e) => setForm({ ...form, default_weeks: Number(e.target.value) || null })}
              />
            </div>
          </div>

          {/* v2.18: Pagos recurrentes por módulo */}
          <div
            style={{
              padding: 14,
              background: form.requires_recurring ? 'var(--teal-50)' : 'var(--ink-50)',
              border: form.requires_recurring ? '1px solid var(--teal-100)' : '1px solid transparent',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: form.requires_recurring ? 'var(--teal-700)' : 'var(--ink-700)',
              }}
            >
              <input
                type="checkbox"
                checked={!!form.requires_recurring}
                onChange={(e) => setForm({ ...form, requires_recurring: e.target.checked })}
                style={{ accentColor: 'var(--teal-600)' }}
              />
              Requiere pagos recurrentes
            </label>
            {form.requires_recurring && (
              <>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-500)',
                    lineHeight: 1.5,
                    marginTop: -4,
                  }}
                >
                  Cada módulo podrá definir su propio precio de renovación mensual en la sección
                  "Módulos" más abajo. El vendor elegirá ciclo mes/año al cotizar.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                  <div className="nx-field" style={{ margin: 0 }}>
                    <label className="nx-label" style={{ fontSize: 11 }}>
                      Precio mensual producto (S/) — fallback
                    </label>
                    <input
                      className="nx-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.recurring_monthly_price || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          recurring_monthly_price: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-500)',
                      lineHeight: 1.5,
                      alignSelf: 'center',
                      paddingTop: 16,
                    }}
                  >
                    Se usa solo si el producto no tiene módulos con renovación configurada.
                    Si hay módulos con precio mensual, este campo se ignora.
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Legacy v2.17 — colapsado, solo si hay datos antiguos */}
          {(form.recurring_name || (form.recurring_price && form.recurring_price > 0)) && (
            <details style={{ fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--ink-500)', padding: '4px 0' }}>
                Cargo recurrente legado (v2.17) — mantenido para compatibilidad
              </summary>
              <div
                style={{
                  padding: 14,
                  background: 'var(--ink-50)',
                  borderRadius: 10,
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <div className="nx-field" style={{ margin: 0 }}>
                  <label className="nx-label" style={{ fontSize: 11 }}>
                    Nombre
                  </label>
                  <input
                    className="nx-input"
                    value={form.recurring_name || ''}
                    onChange={(e) => setForm({ ...form, recurring_name: e.target.value })}
                  />
                </div>
                <div className="nx-field" style={{ margin: 0 }}>
                  <label className="nx-label" style={{ fontSize: 11 }}>
                    Precio
                  </label>
                  <input
                    className="nx-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.recurring_price || ''}
                    onChange={(e) =>
                      setForm({ ...form, recurring_price: Number(e.target.value) || null })
                    }
                  />
                </div>
                <div className="nx-field" style={{ margin: 0 }}>
                  <label className="nx-label" style={{ fontSize: 11 }}>
                    Unidad
                  </label>
                  <input
                    className="nx-input"
                    value={form.recurring_unit || ''}
                    onChange={(e) => setForm({ ...form, recurring_unit: e.target.value })}
                  />
                </div>
              </div>
            </details>
          )}

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Activo (visible para cotizar)
          </label>

          {formError && (
            <div
              style={{
                padding: 10,
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              {formError}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--ink-100)',
          }}
        >
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            {mode === 'create' ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal: crear/editar módulo
// ═══════════════════════════════════════════════════════════════════════

function ModuleFormModal({
  productId,
  productRequiresRecurring,
  mode,
  module: mod,
  existingIds,
  onClose,
  onSaved,
}: {
  productId: string;
  productRequiresRecurring: boolean;
  mode: 'create' | 'edit';
  module?: ProductModule;
  existingIds: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState<ProductModuleInput>({
    id: mod?.id || '',
    product_id: productId,
    name: mod?.name || '',
    price: mod?.price || 0,
    sort_order: mod?.sort_order ?? 0,
    recurring_monthly_price: mod?.recurring_monthly_price || 0,
    active: mod?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      id: mode === 'create' ? `${productId}-${slugify(name)}` : f.id,
    }));
  };

  const submit = async () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('El nombre es requerido');
      return;
    }
    if (!form.id.trim()) {
      setFormError('El identificador es requerido');
      return;
    }
    if (mode === 'create' && existingIds.includes(form.id)) {
      setFormError(`El identificador "${form.id}" ya existe`);
      return;
    }

    setSaving(true);
    try {
      const payload: ProductModuleInput = {
        ...form,
        price: Number(form.price) || 0,
        sort_order: Number(form.sort_order) || 0,
        recurring_monthly_price: Number(form.recurring_monthly_price) || 0,
      };
      if (mode === 'create') {
        await createProductModule(payload);
        onSaved('✓ Módulo creado');
      } else if (mod) {
        await updateProductModule(mod.id, payload);
        onSaved('✓ Módulo actualizado');
      }
    } catch (e: any) {
      setFormError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={480}>
      <div style={{ padding: 24 }}>
        <h2 className="h-display" style={{ margin: '0 0 4px' }}>
          {mode === 'create' ? 'Nuevo módulo' : 'Editar módulo'}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ink-500)' }}>
          Los módulos son complementos que suman al precio base del producto.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="nx-field">
            <label className="nx-label">Nombre del módulo *</label>
            <input
              className="nx-input"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej. WhatsApp Business API"
              autoFocus
            />
          </div>

          <div className="nx-field">
            <label className="nx-label">Identificador</label>
            <input
              className="nx-input"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              disabled={mode === 'edit'}
              style={mode === 'edit' ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label">Precio (S/)</label>
              <input
                className="nx-input"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Orden</label>
              <input
                className="nx-input"
                type="number"
                value={form.sort_order || 0}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* v2.18: Renovación mensual por módulo — solo si el producto padre lo requiere */}
          {productRequiresRecurring && (
            <div
              style={{
                padding: 12,
                background: 'var(--teal-50)',
                border: '1px solid var(--teal-100)',
                borderRadius: 8,
              }}
            >
              <div className="nx-field" style={{ margin: 0 }}>
                <label
                  className="nx-label"
                  style={{ fontSize: 11.5, color: 'var(--teal-700)', fontWeight: 600 }}
                >
                  Renovación mensual (S/)
                </label>
                <input
                  className="nx-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.recurring_monthly_price || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      recurring_monthly_price: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="0.00"
                />
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-500)',
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  Precio mensual unitario de renovación. El vendor elegirá ciclo mes/año al
                  cotizar (anual = ×12 el primer año, renovación desde año 2+ con descuento por
                  meses de regalo).
                </div>
              </div>
            </div>
          )}

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Activo
          </label>

          {formError && (
            <div
              style={{
                padding: 10,
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              {formError}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--ink-100)',
          }}
        >
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <div className="spinner" /> : <Icon name="check" size={14} />}
            {mode === 'create' ? 'Crear módulo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

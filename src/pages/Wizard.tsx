import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, NexovaLogo } from '../components/UI';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import { createQuote, updateQuote } from '../lib/db';
import { fmtMoney, lineItemPrice } from '../lib/utils';
import type { Product, Quote } from '../lib/types';

interface WizardProps {
  onCancel: () => void;
  onFinish: (quoteId: string) => void;
  /**
   * Si se pasa, el wizard entra en modo edición y precarga todos los campos
   * desde esta cotización. Se llama a updateQuote en el submit final.
   */
  quote?: Quote | null;
}

interface ClientForm {
  company: string;
  contact: string;
  email: string;
  phone: string;
  industry: string;
  size: 'pequeña' | 'mediana' | 'grande';
  ruc: string;
}

interface Item {
  product_id: string;
  qty: number;
  module_ids: string[];
}

export function Wizard({ onCancel, onFinish, quote }: WizardProps) {
  const { vendor } = useAuth();
  const { products, loading: loadingProducts } = useProducts();

  const isEditing = !!quote;

  // En modo edición arrancamos en step 4 (review) ya que el usuario típicamente
  // quiere ajustar items/descuento/condiciones directamente. Los pasos 1 y 2
  // siguen accesibles si necesita corregir cliente o requerimientos.
  const [step, setStep] = useState(isEditing ? 4 : 1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 — precargar desde quote.client si estamos editando
  const [client, setClient] = useState<ClientForm>(() => {
    if (quote?.client) {
      return {
        company: quote.client.company || '',
        contact: quote.client.contact || '',
        email: quote.client.email || '',
        phone: quote.client.phone || '',
        industry: quote.client.industry || '',
        size: (quote.client.size as any) || 'mediana',
        ruc: quote.client.ruc || '',
      };
    }
    return {
      company: '',
      contact: '',
      email: '',
      phone: '',
      industry: '',
      size: 'mediana',
      ruc: '',
    };
  });

  // Step 2
  const [requirements, setRequirements] = useState(quote?.requirements || '');
  const [urgency, setUrgency] = useState<'baja' | 'normal' | 'alta'>('normal');
  const [budget, setBudget] = useState('');

  // Step 3
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReasons, setAiReasons] = useState<string[]>([]);

  // Step 4 — precargar desde quote si estamos editando
  const [items, setItems] = useState<Item[]>(() => {
    if (quote?.items) {
      return quote.items
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((it) => ({
          product_id: it.product_id,
          qty: it.qty,
          module_ids: it.module_ids || [],
        }));
    }
    return [];
  });
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [validDays, setValidDays] = useState(quote?.valid_days ?? 30);
  const [deliveryWeeks, setDeliveryWeeks] = useState(quote?.delivery_weeks ?? 6);
  const [paymentTerms, setPaymentTerms] = useState(
    quote?.payment_terms ?? '50% adelanto / 50% a la entrega',
  );
  const [proposalText, setProposalText] = useState(quote?.proposal_text ?? '');

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + lineItemPrice(it, products), 0),
    [items, products]
  );
  const discountAmt = subtotal * (discount / 100);
  const afterDisc = subtotal - discountAmt;
  const igv = afterDisc * 0.18;
  const total = afterDisc + igv;

  if (loadingProducts) return <Loading label="Cargando catálogo…" />;
  if (!vendor) return null;

  const runAiAnalysis = () => {
    setAnalyzing(true);
    setTimeout(() => {
      const r = requirements.toLowerCase();
      const suggested: Item[] = [];
      const reasons: string[] = [];

      const matches: { kw: string[]; prod: string; mods: string[]; reason: string }[] = [
        {
          kw: ['crm', 'clientes', 'ventas', 'pipeline', 'seguimiento'],
          prod: 'crm-pro',
          mods: ['crm-m1', 'crm-m3'],
          reason: 'Detectamos necesidad de gestión de clientes y pipeline comercial.',
        },
        {
          kw: ['cita', 'reserva', 'agenda', 'turno', 'consulta'],
          prod: 'agendapro',
          mods: ['ag-m2', 'ag-m3'],
          reason: 'Se mencionan citas o reservas; AgendaPro encaja perfecto.',
        },
        {
          kw: ['web', 'página', 'landing', 'sitio', 'corporativo'],
          prod: 'web-design',
          mods: ['w-m5'],
          reason: 'Requiere presencia web profesional.',
        },
        {
          kw: ['tienda', 'ecommerce', 'venta online', 'catálogo'],
          prod: 'web-design',
          mods: ['w-m1', 'w-m5'],
          reason: 'Se requiere venta online (eCommerce).',
        },
        {
          kw: ['hosting', 'dominio', 'servidor', 'alojamiento'],
          prod: 'hosting',
          mods: ['h-m2'],
          reason: 'Menciona hosting/servidor.',
        },
        {
          kw: ['a medida', 'personalizado', 'custom', 'específico', 'particular'],
          prod: 'software-custom',
          mods: ['sc-m3', 'sc-m4'],
          reason: 'Necesidad específica que no cubren productos estándar.',
        },
        {
          kw: ['inventario', 'almacén', 'stock'],
          prod: 'software-custom',
          mods: ['sc-m1', 'sc-m3'],
          reason: 'Gestión de inventario detectada.',
        },
        {
          kw: ['automatiza', 'flujo', 'proceso', 'rpa', 'integra'],
          prod: 'automation',
          mods: ['a-m1', 'a-m3', 'a-m4'],
          reason: 'Automatización de procesos manuales identificada.',
        },
        {
          kw: ['documento', 'ocr', 'factura', 'lectura'],
          prod: 'automation',
          mods: ['a-m2', 'a-m4'],
          reason: 'Procesamiento documental con OCR+IA.',
        },
        {
          kw: ['auditar', 'diagnóstico', 'análisis', 'consultoría', 'mejora'],
          prod: 'audit',
          mods: ['au-m1', 'au-m2'],
          reason: 'Consultoría de procesos requerida previa a implementación.',
        },
        {
          kw: ['capacit', 'entrena', 'formación', 'curso', 'aprend'],
          prod: 'training',
          mods: ['t-m1', 't-m4'],
          reason: 'Capacitación y transferencia de conocimiento.',
        },
      ];

      matches.forEach((m) => {
        if (m.kw.some((k) => r.includes(k))) {
          if (!suggested.find((s) => s.product_id === m.prod)) {
            const prod = products.find((p) => p.id === m.prod);
            if (prod) {
              const validMods = m.mods.filter((mid) =>
                prod.modules?.some((pm) => pm.id === mid)
              );
              suggested.push({ product_id: m.prod, qty: 1, module_ids: validMods });
              reasons.push(m.reason);
            }
          }
        }
      });

      if (suggested.length === 0) {
        const webProd = products.find((p) => p.id === 'web-design');
        const hostProd = products.find((p) => p.id === 'hosting');
        if (webProd) {
          suggested.push({
            product_id: 'web-design',
            qty: 1,
            module_ids: webProd.modules?.some((m) => m.id === 'w-m5') ? ['w-m5'] : [],
          });
        }
        if (hostProd) {
          suggested.push({
            product_id: 'hosting',
            qty: 1,
            module_ids: hostProd.modules?.some((m) => m.id === 'h-m2') ? ['h-m2'] : [],
          });
        }
        reasons.push('Alcance general detectado — proponemos base digital (web + hosting).');
      }

      let suggestedDiscount = 0;
      if (urgency === 'alta') suggestedDiscount = 0;
      else if (client.size === 'grande') suggestedDiscount = 8;
      else if (client.size === 'pequeña') suggestedDiscount = 5;

      const weeks = suggested.reduce((sum, it) => {
        const p = products.find((x) => x.id === it.product_id);
        return sum + (p?.default_weeks || 0);
      }, 0);

      setItems(suggested);
      setAiReasons(reasons);
      setDiscount(suggestedDiscount);
      setDeliveryWeeks(Math.max(2, Math.round(weeks * 0.7)));
      setProposalText(
        `Estimado/a ${client.contact || 'equipo'} de ${client.company}:\n\n` +
          `Basándonos en los requerimientos compartidos, proponemos la siguiente solución integral:\n\n` +
          reasons.map((r) => `• ${r}`).join('\n') +
          `\n\nEsta propuesta considera la envergadura de ${client.company} y busca maximizar el retorno de la inversión desde el primer mes de implementación.`
      );

      setAnalyzing(false);
      setStep(4);
    }, 1200);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        client: {
          // Si estamos editando y el cliente ya existe, pasamos su id para
          // que updateQuote lo reuse sin crear uno nuevo.
          id: isEditing ? quote?.client?.id : undefined,
          company: client.company,
          contact: client.contact,
          email: client.email,
          phone: client.phone,
          industry: client.industry,
          size: client.size,
          ruc: client.ruc,
        },
        vendor_id: vendor.id,
        items,
        discount,
        valid_days: validDays,
        delivery_weeks: deliveryWeeks,
        payment_terms: paymentTerms,
        proposal_text: proposalText,
        requirements: requirements,
      };

      const result = isEditing
        ? await updateQuote(quote!.id, payload)
        : await createQuote(payload);
      onFinish(result.id);
    } catch (e: any) {
      console.error(e);
      setSubmitError(
        e?.message || (isEditing ? 'Error al guardar los cambios' : 'Error al crear la cotización'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Step validation
  const canNext1 = !!client.company && !!client.contact;
  const canNext2 = requirements.trim().length >= 10;
  const canSubmit = items.length > 0 && !submitting;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink-50)' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid var(--ink-200)',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <NexovaLogo size={32} />
        <div style={{ flex: 1 }}>
          <div
            className="h-display"
            style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink-900)' }}
          >
            {isEditing ? 'Editar cotización' : 'Nueva cotización'}
            {isEditing && quote?.code && (
              <span
                className="mono"
                style={{
                  marginLeft: 10,
                  fontSize: 12.5,
                  color: 'var(--teal-700)',
                  fontWeight: 600,
                }}
              >
                {quote.code}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Paso {step} de 4</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          <Icon name="close" size={14} /> Cancelar
        </button>
      </div>

      {/* Progress */}
      <div
        style={{
          padding: '20px 32px 0',
          display: 'flex',
          gap: 8,
          maxWidth: 900,
          margin: '0 auto',
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 4,
              background: n <= step ? 'var(--teal-600)' : 'var(--ink-200)',
              transition: 'background .3s',
            }}
          />
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 48px' }}>
        {step === 1 && (
          <Step1Client client={client} setClient={setClient} onNext={() => setStep(2)} canNext={canNext1} />
        )}
        {step === 2 && (
          <Step2Requirements
            requirements={requirements}
            setRequirements={setRequirements}
            urgency={urgency}
            setUrgency={setUrgency}
            budget={budget}
            setBudget={setBudget}
            onBack={() => setStep(1)}
            onNext={() => {
              // En modo edición saltamos Step 3 (AI analysis) — sobreescribiría
              // los items del usuario. Vamos directo al review.
              if (isEditing) {
                setStep(4);
              } else {
                setStep(3);
                runAiAnalysis();
              }
            }}
            canNext={canNext2}
          />
        )}
        {step === 3 && (
          <Step3Analysis analyzing={analyzing} reasons={aiReasons} />
        )}
        {step === 4 && (
          <Step4Review
            products={products}
            items={items}
            setItems={setItems}
            discount={discount}
            setDiscount={setDiscount}
            validDays={validDays}
            setValidDays={setValidDays}
            deliveryWeeks={deliveryWeeks}
            setDeliveryWeeks={setDeliveryWeeks}
            paymentTerms={paymentTerms}
            setPaymentTerms={setPaymentTerms}
            proposalText={proposalText}
            setProposalText={setProposalText}
            subtotal={subtotal}
            discountAmt={discountAmt}
            igv={igv}
            total={total}
            submitting={submitting}
            submitError={submitError}
            onBack={() => setStep(2)}
            onSubmit={submit}
            canSubmit={canSubmit}
            aiReasons={aiReasons}
            isEditing={isEditing}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1 ───
function Step1Client({
  client,
  setClient,
  onNext,
  canNext,
}: {
  client: ClientForm;
  setClient: (c: ClientForm) => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <div className="nx-card nx-card-padded fade-in">
      <h2 className="h-display" style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>
        Datos del cliente
      </h2>
      <p style={{ color: 'var(--ink-500)', fontSize: 13.5, margin: '0 0 22px' }}>
        Información de la empresa a la que va dirigida la cotización.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginBottom: 22,
        }}
      >
        <div className="nx-field">
          <label className="nx-label">Empresa / Razón social *</label>
          <input
            className="nx-input"
            placeholder="Ej. Clínica San Gabriel"
            value={client.company}
            onChange={(e) => setClient({ ...client, company: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Contacto principal *</label>
          <input
            className="nx-input"
            placeholder="Nombre del decisor"
            value={client.contact}
            onChange={(e) => setClient({ ...client, contact: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Email</label>
          <input
            className="nx-input"
            type="email"
            placeholder="contacto@empresa.com"
            value={client.email}
            onChange={(e) => setClient({ ...client, email: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Teléfono</label>
          <input
            className="nx-input"
            placeholder="+51 999 999 999"
            value={client.phone}
            onChange={(e) => setClient({ ...client, phone: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Industria / Rubro</label>
          <input
            className="nx-input"
            placeholder="Salud, retail, legal..."
            value={client.industry}
            onChange={(e) => setClient({ ...client, industry: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Tamaño</label>
          <select
            className="nx-select"
            value={client.size}
            onChange={(e) => setClient({ ...client, size: e.target.value as any })}
          >
            <option value="pequeña">Pequeña</option>
            <option value="mediana">Mediana</option>
            <option value="grande">Grande</option>
          </select>
        </div>
        <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
          <label className="nx-label">RUC (opcional)</label>
          <input
            className="nx-input"
            placeholder="20605541231"
            value={client.ruc}
            onChange={(e) => setClient({ ...client, ruc: e.target.value })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onNext} disabled={!canNext}>
          Siguiente <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2 ───
function Step2Requirements({
  requirements,
  setRequirements,
  urgency,
  setUrgency,
  budget,
  setBudget,
  onBack,
  onNext,
  canNext,
}: {
  requirements: string;
  setRequirements: (v: string) => void;
  urgency: 'baja' | 'normal' | 'alta';
  setUrgency: (v: 'baja' | 'normal' | 'alta') => void;
  budget: string;
  setBudget: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <div className="nx-card nx-card-padded fade-in">
      <h2 className="h-display" style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>
        Requerimientos del cliente
      </h2>
      <p style={{ color: 'var(--ink-500)', fontSize: 13.5, margin: '0 0 22px' }}>
        Describe en texto libre lo que necesita el cliente. La IA sugerirá los productos y módulos.
      </p>
      <div className="nx-field" style={{ marginBottom: 16 }}>
        <label className="nx-label">¿Qué necesita el cliente? *</label>
        <textarea
          className="nx-textarea"
          rows={7}
          placeholder="Ej. Necesitamos un sistema para gestionar citas de nuestros pacientes con recordatorios automáticos por WhatsApp. También queremos integrar pagos online."
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
        <span className="nx-hint">Mínimo 10 caracteres.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
        <div className="nx-field">
          <label className="nx-label">Urgencia</label>
          <select
            className="nx-select"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as any)}
          >
            <option value="baja">Baja · flexible</option>
            <option value="normal">Normal · 30-60 días</option>
            <option value="alta">Alta · lo más pronto posible</option>
          </select>
        </div>
        <div className="nx-field">
          <label className="nx-label">Presupuesto referencial (opcional)</label>
          <input
            className="nx-input"
            placeholder="S/ 10,000 - 30,000"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Atrás
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={!canNext}>
          Analizar con IA <Icon name="sparkle" size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3 ───
function Step3Analysis({
  analyzing,
  reasons,
}: {
  analyzing: boolean;
  reasons: string[];
}) {
  return (
    <div className="nx-card nx-card-padded fade-in" style={{ textAlign: 'center', padding: 48 }}>
      {analyzing ? (
        <>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 20px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, var(--teal-700), var(--teal-500))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              animation: 'spin 2s linear infinite',
            }}
          >
            <Icon name="brain" size={32} />
          </div>
          <h2 className="h-display" style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>
            Analizando requerimientos…
          </h2>
          <p style={{ color: 'var(--ink-500)', fontSize: 13.5 }}>
            Identificando productos, módulos y precios sugeridos.
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 20px',
              borderRadius: 16,
              background: 'var(--success-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--success)',
            }}
          >
            <Icon name="check" size={32} />
          </div>
          <h2 className="h-display" style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>
            Análisis completo
          </h2>
          <p style={{ color: 'var(--ink-500)', fontSize: 13.5, marginBottom: 20 }}>
            {reasons.length} recomendaci{reasons.length === 1 ? 'ón' : 'ones'} detectada
            {reasons.length === 1 ? '' : 's'}.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Step 4 ───
function Step4Review(props: {
  products: Product[];
  items: Item[];
  setItems: (v: Item[]) => void;
  discount: number;
  setDiscount: (v: number) => void;
  validDays: number;
  setValidDays: (v: number) => void;
  deliveryWeeks: number;
  setDeliveryWeeks: (v: number) => void;
  paymentTerms: string;
  setPaymentTerms: (v: string) => void;
  proposalText: string;
  setProposalText: (v: string) => void;
  subtotal: number;
  discountAmt: number;
  igv: number;
  total: number;
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  aiReasons: string[];
  isEditing: boolean;
}) {
  const {
    products,
    items,
    setItems,
    discount,
    setDiscount,
    validDays,
    setValidDays,
    deliveryWeeks,
    setDeliveryWeeks,
    paymentTerms,
    setPaymentTerms,
    proposalText,
    setProposalText,
    subtotal,
    discountAmt,
    igv,
    total,
    submitting,
    submitError,
    onBack,
    onSubmit,
    canSubmit,
    aiReasons,
    isEditing,
  } = props;

  const updateQty = (idx: number, qty: number) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], qty: Math.max(1, qty) };
    setItems(copy);
  };

  const toggleModule = (idx: number, moduleId: string) => {
    const copy = [...items];
    const mods = copy[idx].module_ids;
    copy[idx] = {
      ...copy[idx],
      module_ids: mods.includes(moduleId)
        ? mods.filter((m) => m !== moduleId)
        : [...mods, moduleId],
    };
    setItems(copy);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const addProduct = (productId: string) => {
    if (items.find((i) => i.product_id === productId)) return;
    setItems([...items, { product_id: productId, qty: 1, module_ids: [] }]);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {aiReasons.length > 0 && (
        <div
          className="nx-card"
          style={{
            padding: 14,
            background:
              'linear-gradient(135deg, var(--teal-50), rgba(255,255,255,.5))',
            borderColor: 'var(--teal-100)',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '.12em',
              color: 'var(--teal-700)',
              marginBottom: 8,
            }}
          >
            <Icon name="sparkle" size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            ANÁLISIS IA
          </div>
          {aiReasons.map((r, i) => (
            <div
              key={i}
              style={{
                fontSize: 12.5,
                color: 'var(--ink-700)',
                display: 'flex',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Icon
                name="check"
                size={13}
                style={{ color: 'var(--teal-700)', flexShrink: 0, marginTop: 2 }}
              />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      <div className="nx-card nx-card-padded">
        <h3 className="h-display" style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700 }}>
          Productos y módulos
        </h3>
        {items.map((it, idx) => {
          const p = products.find((x) => x.id === it.product_id);
          if (!p) return null;
          const linePrice = lineItemPrice(it, products);
          return (
            <div
              key={idx}
              style={{
                padding: '14px 0',
                borderTop: idx === 0 ? 'none' : '1px solid var(--ink-100)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                    {fmtMoney(p.base_price)} / {p.unit}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={it.qty}
                  onChange={(e) => updateQty(idx, parseInt(e.target.value) || 1)}
                  className="nx-input"
                  style={{ width: 70, textAlign: 'center' }}
                />
                <div
                  style={{
                    minWidth: 100,
                    textAlign: 'right',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 14.5,
                  }}
                >
                  {fmtMoney(linePrice)}
                </div>
                <button
                  onClick={() => removeItem(idx)}
                  className="btn btn-danger btn-sm"
                  title="Quitar"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
              {p.modules && p.modules.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 6,
                    paddingLeft: 12,
                    borderLeft: '2px solid var(--ink-100)',
                  }}
                >
                  {p.modules.map((m) => {
                    const active = it.module_ids.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: active ? 'var(--teal-50)' : 'transparent',
                          border: '1px solid ' + (active ? 'var(--teal-100)' : 'transparent'),
                          fontSize: 12.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleModule(idx, m.id)}
                          style={{ accentColor: 'var(--teal-600)' }}
                        />
                        <span style={{ flex: 1, color: 'var(--ink-700)' }}>{m.name}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: active ? 'var(--teal-700)' : 'var(--ink-500)',
                          }}
                        >
                          +{fmtMoney(m.price)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="empty-state">
            La IA no sugirió productos. Agrega manualmente abajo.
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid var(--ink-100)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 8 }}>
            Agregar otro producto:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {products
              .filter((p) => !items.find((i) => i.product_id === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p.id)}
                  className="btn btn-soft btn-sm"
                >
                  <Icon name="plus" size={12} /> {p.name}
                </button>
              ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card nx-card-padded">
          <h4 className="h-display" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
            Condiciones
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="nx-field">
              <label className="nx-label">Descuento (%)</label>
              <input
                type="number"
                className="nx-input"
                min={0}
                max={50}
                value={discount}
                onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Validez (días)</label>
              <input
                type="number"
                className="nx-input"
                min={7}
                max={90}
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Entrega (semanas)</label>
              <input
                type="number"
                className="nx-input"
                min={1}
                value={deliveryWeeks}
                onChange={(e) => setDeliveryWeeks(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="nx-field">
              <label className="nx-label">Condiciones de pago</label>
              <input
                className="nx-input"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="nx-card nx-card-padded">
          <h4 className="h-display" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
            Resumen
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <Row label="Subtotal" value={fmtMoney(subtotal)} />
            {discount > 0 && (
              <Row
                label={`Descuento (${discount}%)`}
                value={'- ' + fmtMoney(discountAmt)}
                accent="var(--danger)"
              />
            )}
            <Row label="IGV (18%)" value={fmtMoney(igv)} muted />
            <div
              style={{
                borderTop: '1px solid var(--ink-200)',
                paddingTop: 10,
                marginTop: 6,
              }}
            >
              <Row label="Total" value={fmtMoney(total)} bold large />
            </div>
          </div>
        </div>
      </div>

      <div className="nx-card nx-card-padded">
        <h4 className="h-display" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
          Texto de la propuesta
        </h4>
        <textarea
          className="nx-textarea"
          rows={6}
          value={proposalText}
          onChange={(e) => setProposalText(e.target.value)}
        />
      </div>

      {submitError && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Atrás
        </button>
        <button className="btn btn-primary btn-lg" onClick={onSubmit} disabled={!canSubmit}>
          {submitting ? (
            <>
              <div className="spinner" /> {isEditing ? 'Guardando…' : 'Generando…'}
            </>
          ) : (
            <>
              {isEditing ? 'Guardar cambios' : 'Generar cotización'}{' '}
              <Icon name="check" size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  muted,
  bold,
  large,
}: {
  label: string;
  value: string;
  accent?: string;
  muted?: boolean;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span
        style={{
          color: muted ? 'var(--ink-500)' : 'var(--ink-700)',
          fontSize: large ? 14 : 13,
          fontWeight: bold ? 700 : 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent || (bold ? 'var(--ink-900)' : 'var(--ink-900)'),
          fontFamily: 'var(--font-display)',
          fontWeight: bold ? 700 : 600,
          fontSize: large ? 18 : 13,
        }}
      >
        {value}
      </span>
    </div>
  );
}

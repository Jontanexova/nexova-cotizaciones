import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading, NexovaLogo } from '../components/UI';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../contexts/AuthContext';
import {
  analyzeRequirementsViaEdgeFunction,
  createQuote,
  fetchClientByRuc,
  fetchClientsWithStats,
  logAiAnalysis,
  updateQuote,
  validateRucViaEdgeFunction,
  type AiAnalysisInput,
  type ClientWithStats,
} from '../lib/db';
import type { Product, Quote, QuoteItemModule, RecurringCycle } from '../lib/types';
import { fmtMoney, lineItemPrice, MAX_GIFT_MONTHS, WARN_GIFT_MONTHS_THRESHOLD } from '../lib/utils';

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
  /**
   * v2.26: id del cliente existente cuando se selecciona uno desde el
   * autocomplete. Si se mantiene al guardar, createQuote reutiliza ese
   * cliente en lugar de crear uno nuevo. Se limpia a undefined apenas
   * el vendedor modifica cualquier campo después de seleccionar.
   */
  id?: string;
  company: string;
  contact: string;
  /** v2.25: cargo del contacto (ej. "Gerente General") — opcional. */
  contact_role: string;
  email: string;
  phone: string;
  industry: string;
  size: 'pequeña' | 'mediana' | 'grande';
  ruc: string;
  /** v2.25: dirección del cliente — opcional. */
  address: string;
}

interface Item {
  product_id: string;
  qty: number;
  /** v2.18: módulos seleccionados con ciclo y regalo. */
  modules: QuoteItemModule[];
  /** v2.18: fallback a nivel item (cuando el producto tiene requires_recurring pero no hay módulos con recurring). */
  recurring_billing_cycle: RecurringCycle | null;
  recurring_gift_months: number;
}

/**
 * v2.18: construye un Item con defaults correctos.
 * Asigna cycle='annual', gift=0 a los módulos con recurring_monthly_price > 0.
 * Si ningún módulo aporta recurring pero el producto sí lo requiere, setea fallback a nivel item.
 */
function buildItemForProduct(prod: Product, qty: number, moduleIds: string[]): Item {
  const modules: QuoteItemModule[] = moduleIds.map((mid) => {
    const pm = prod.modules?.find((x) => x.id === mid);
    const hasRecurring = prod.requires_recurring && Number(pm?.recurring_monthly_price || 0) > 0;
    return {
      module_id: mid,
      recurring_billing_cycle: hasRecurring ? 'annual' : null,
      recurring_gift_months: 0,
    };
  });
  const anyModWithRec = modules.some((mm) => {
    const pm = prod.modules?.find((x) => x.id === mm.module_id);
    return Number(pm?.recurring_monthly_price || 0) > 0;
  });
  const needsItemFallback =
    (prod.requires_recurring ?? false) &&
    !anyModWithRec &&
    Number(prod.recurring_monthly_price || 0) > 0;
  return {
    product_id: prod.id,
    qty,
    modules,
    recurring_billing_cycle: needsItemFallback ? 'annual' : null,
    recurring_gift_months: 0,
  };
}

/**
 * v2.27: signature estable de los items actuales. Se usa para detectar
 * cuando el vendedor editó items en Step 4 después de un análisis IA, y
 * por tanto los textos narrativos ya no coinciden con la selección.
 *
 * El ordenamiento es determinista (module_ids ordenados dentro de cada
 * item, items ordenados por la triple) para que reordenar no dispare
 * falsos positivos de staleness.
 */
function computeItemsSignature(its: Item[]): string {
  return its
    .map((it) => {
      const mids = it.modules
        .map((m) => m.module_id)
        .slice()
        .sort()
        .join(',');
      return `${it.product_id}:${it.qty}:${mids}`;
    })
    .slice()
    .sort()
    .join('|');
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
        contact_role: quote.client.contact_role || '',
        email: quote.client.email || '',
        phone: quote.client.phone || '',
        industry: quote.client.industry || '',
        size: (quote.client.size as any) || 'mediana',
        ruc: quote.client.ruc || '',
        address: quote.client.address || '',
      };
    }
    return {
      company: '',
      contact: '',
      contact_role: '',
      email: '',
      phone: '',
      industry: '',
      size: 'mediana',
      ruc: '',
      address: '',
    };
  });

  // Step 2
  const [requirements, setRequirements] = useState(quote?.requirements || '');
  const [urgency, setUrgency] = useState<'baja' | 'normal' | 'alta'>('normal');
  const [budget, setBudget] = useState('');

  // v2.26 — lista de clientes existentes para el autocomplete del Step 1.
  // Se carga una vez al montar. En modo edición igual se carga por si el vendedor
  // decide cambiar de cliente.
  const [existingClients, setExistingClients] = useState<ClientWithStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchClientsWithStats()
      .then((list) => {
        if (!cancelled) setExistingClients(list);
      })
      .catch((e) => console.warn('[Wizard] No se pudo cargar lista de clientes:', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 3
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReasons, setAiReasons] = useState<string[]>([]);
  // v2.27: modo del último análisis (ninguno / LLM / fallback rule-based),
  // mensaje de error si el LLM falló, signature de los items analizados
  // (para detectar drift cuando el vendedor edita en Step 4) y flag de
  // regeneración puntual de textos (botón en panel IA).
  const [aiMode, setAiMode] = useState<'none' | 'llm' | 'rules'>('none');
  const [aiError, setAiError] = useState<string | null>(null);
  const [analyzedSignature, setAnalyzedSignature] = useState<string>('');
  const [regenerating, setRegenerating] = useState(false);

  // Step 4 — precargar desde quote si estamos editando
  const [items, setItems] = useState<Item[]>(() => {
    if (quote?.items) {
      return quote.items
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((it) => ({
          product_id: it.product_id,
          qty: it.qty,
          modules: (it.modules || []).map((m) => ({
            module_id: m.module_id,
            recurring_billing_cycle: m.recurring_billing_cycle ?? null,
            recurring_gift_months: m.recurring_gift_months ?? 0,
          })),
          recurring_billing_cycle: it.recurring_billing_cycle ?? null,
          recurring_gift_months: it.recurring_gift_months ?? 0,
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
  // v2.25 — Campos IA nuevos para el formato proforma del PDF.
  // Si estamos editando, precargamos desde la cotización; si estamos creando
  // se llenan en Step 3 (runAiAnalysis) a partir de `requirements`.
  const [justificationText, setJustificationText] = useState(quote?.justification_text ?? '');
  const [solutionSummary, setSolutionSummary] = useState(quote?.solution_summary ?? '');
  const [scopeSummary, setScopeSummary] = useState(quote?.scope_summary ?? '');
  const [modalitySummary, setModalitySummary] = useState(quote?.modality_summary ?? '');

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + lineItemPrice(it, products), 0),
    [items, products]
  );
  const discountAmt = subtotal * (discount / 100);
  const afterDisc = subtotal - discountAmt;
  const igv = afterDisc * 0.18;
  const total = afterDisc + igv;

  // v2.27: signature actual de items y flag de narrativas desactualizadas
  // (para mostrar banner "Regenerar texto" en Step 4 cuando el vendedor
  // modificó la selección después del análisis IA).
  const currentItemsSignature = useMemo(() => computeItemsSignature(items), [items]);
  const hasStaleNarratives = useMemo(() => {
    if (aiMode === 'none') return false;
    if (analyzedSignature === '') return false;
    if (currentItemsSignature === analyzedSignature) return false;
    const anyNarrative =
      solutionSummary.trim() !== '' ||
      scopeSummary.trim() !== '' ||
      modalitySummary.trim() !== '' ||
      justificationText.trim() !== '' ||
      proposalText.trim() !== '';
    return anyNarrative;
  }, [
    aiMode,
    analyzedSignature,
    currentItemsSignature,
    solutionSummary,
    scopeSummary,
    modalitySummary,
    justificationText,
    proposalText,
  ]);

  if (loadingProducts) return <Loading label="Cargando catálogo…" />;
  if (!vendor) return null;

  // v2.27: escape para regex. Necesario para construir matching con word
  // boundaries sobre keywords que pueden contener caracteres especiales.
  const escapeRegex = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * v2.27 — fix Bug A (substring matching): una keyword matchea sólo si
   * aparece como palabra completa, usando como "word chars" el set
   * [a-záéíóúñ]. Esto evita que 'cita' dispare con 'solicita'.
   */
  const kwMatches = (text: string, kw: string): boolean => {
    const esc = escapeRegex(kw.toLowerCase());
    return new RegExp(
      `(^|[^a-záéíóúñ])${esc}([^a-záéíóúñ]|$)`,
      'i',
    ).test(text);
  };

  /**
   * v2.27 — análisis rule-based extraído a función PURA. Devuelve un
   * objeto con todos los derivados (items sugeridos, reasons, textos
   * narrativos, descuento, semanas) SIN modificar state. Es usada:
   *  - Como fallback cuando la Edge Function analyze-requirements falla.
   *  - Como modo forzado si se invoca runAiAnalysis({forceLocal:true}).
   *
   * Keywords ajustadas respecto al rule-based de v2.26:
   *  - CRM: se elimina 'clientes' (demasiado genérico); se deja
   *    'gestión de clientes', 'pipeline', 'seguimiento'.
   *  - Agenda: 'cita' ahora es seguro gracias al matching con word
   *    boundaries; se agregan variantes 'citas', 'reservas', 'turnos'.
   */
  const runRuleBasedAnalysis = (): {
    suggested: Item[];
    reasons: string[];
    solutionSummary: string;
    scopeSummary: string;
    modalitySummary: string;
    justificationText: string;
    proposalText: string;
    discount: number;
    weeks: number;
  } => {
    const r = requirements.toLowerCase();
    const suggested: Item[] = [];
    const reasons: string[] = [];

    const matches: { kw: string[]; prod: string; mods: string[]; reason: string }[] = [
      {
        kw: ['crm', 'gestión de clientes', 'ventas', 'pipeline', 'seguimiento'],
        prod: 'crm-pro',
        mods: ['crm-m1', 'crm-m3'],
        reason: 'Detectamos necesidad de gestión de clientes y pipeline comercial.',
      },
      {
        // v2.27: 'cita' es seguro con word boundaries — ya no matchea 'solicita'
        kw: ['cita', 'citas', 'reserva', 'reservas', 'agenda', 'turno', 'turnos', 'consulta'],
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
      if (m.kw.some((k) => kwMatches(r, k))) {
        if (!suggested.find((s) => s.product_id === m.prod)) {
          const prod = products.find((p) => p.id === m.prod);
          if (prod) {
            const validMods = m.mods.filter((mid) =>
              prod.modules?.some((pm) => pm.id === mid)
            );
            suggested.push(buildItemForProduct(prod, 1, validMods));
            reasons.push(m.reason);
          }
        }
      }
    });

    if (suggested.length === 0) {
      const webProd = products.find((p) => p.id === 'web-design');
      const hostProd = products.find((p) => p.id === 'hosting');
      if (webProd) {
        const ids = webProd.modules?.some((m) => m.id === 'w-m5') ? ['w-m5'] : [];
        suggested.push(buildItemForProduct(webProd, 1, ids));
      }
      if (hostProd) {
        const ids = hostProd.modules?.some((m) => m.id === 'h-m2') ? ['h-m2'] : [];
        suggested.push(buildItemForProduct(hostProd, 1, ids));
      }
      reasons.push('Alcance general detectado — proponemos base digital (web + hosting).');
    }

    let suggestedDiscount = 0;
    if (urgency === 'alta') suggestedDiscount = 0;
    else if (client.size === 'grande') suggestedDiscount = 8;
    else if (client.size === 'pequeña') suggestedDiscount = 5;

    const weeksRaw = suggested.reduce((sum, it) => {
      const p = products.find((x) => x.id === it.product_id);
      return sum + (p?.default_weeks || 0);
    }, 0);
    const weeks = Math.max(2, Math.round(weeksRaw * 0.7));

    const proposalText =
      `Estimado/a ${client.contact || 'equipo'} de ${client.company}:\n\n` +
      `Basándonos en los requerimientos compartidos, proponemos la siguiente solución integral:\n\n` +
      reasons.map((x) => `• ${x}`).join('\n') +
      `\n\nEsta propuesta considera la envergadura de ${client.company} y busca maximizar el retorno de la inversión desde el primer mes de implementación.`;

    const productNames = suggested
      .map((it) => products.find((p) => p.id === it.product_id)?.name)
      .filter((n): n is string => !!n);
    const moduleNames: string[] = [];
    for (const it of suggested) {
      const p = products.find((x) => x.id === it.product_id);
      if (!p) continue;
      for (const sm of it.modules) {
        const m = p.modules?.find((x) => x.id === sm.module_id);
        if (m) moduleNames.push(m.name);
      }
    }

    const solutionLine = productNames.slice(0, 2).join(' + ') || 'Solución a medida';
    const scopeTokens = moduleNames.slice(0, 3);
    const scopeLine =
      scopeTokens.length > 0
        ? scopeTokens.join(' · ')
        : reasons[0] || 'Alcance personalizado según requerimientos';

    const hasRecurring = suggested.some((it) => {
      const p = products.find((x) => x.id === it.product_id);
      return p?.requires_recurring;
    });
    const modalityLine = hasRecurring
      ? `Implementación + servicio recurrente · ${weeks} semanas`
      : `Implementación llave en mano · ${weeks} semanas`;

    const industry = client.industry || 'su rubro';
    const contextP = `${client.company} requiere una solución ${
      suggested.length > 1 ? 'integral' : 'especializada'
    } que responda a las necesidades específicas identificadas en ${industry}. La propuesta contempla ${
      productNames.length > 0
        ? productNames.join(productNames.length === 2 ? ' y ' : ', ')
        : 'los componentes detallados a continuación'
    }${
      moduleNames.length > 0
        ? `, incluyendo funcionalidades clave como ${moduleNames.slice(0, 3).join(', ')}`
        : ''
    }.`;

    const complementP = hasRecurring
      ? `El paquete se complementa con servicios recurrentes (hosting, renovaciones o soporte) que garantizan continuidad operativa sin interrupciones. La implementación está planificada para ${weeks} semanas, con entregables validados en cada hito.`
      : `La implementación está planificada para ${weeks} semanas, entregada bajo modalidad llave en mano con código fuente, documentación técnica y transferencia de conocimiento al equipo del cliente.`;

    return {
      suggested,
      reasons,
      solutionSummary: solutionLine,
      scopeSummary: scopeLine,
      modalitySummary: modalityLine,
      justificationText: `${contextP}\n\n${complementP}`,
      proposalText,
      discount: suggestedDiscount,
      weeks,
    };
  };

  /**
   * v2.27 — expande la salida del LLM (product_ids + qty + module_ids) a
   * Items completos usando el catálogo. Filtra product_ids inexistentes
   * y module_ids no válidos para el producto. Reutiliza buildItemForProduct
   * para mantener la misma lógica de recurring/fallback.
   */
  const buildItemsFromLlm = (
    suggested: Array<{ product_id: string; qty: number; module_ids: string[] }>,
  ): Item[] => {
    const out: Item[] = [];
    for (const s of suggested) {
      const prod = products.find((p) => p.id === s.product_id);
      if (!prod) continue;
      const validMods = (s.module_ids || []).filter((mid) =>
        prod.modules?.some((pm) => pm.id === mid),
      );
      const qty = Math.max(1, Number(s.qty) || 1);
      out.push(buildItemForProduct(prod, qty, validMods));
    }
    return out;
  };

  /**
   * v2.27 — construye el array `products` del payload hacia la Edge Function.
   *  - selectedOnly=null: catálogo completo (modo análisis inicial, Claude
   *    elige qué productos proponer).
   *  - selectedOnly=Item[]: sólo los productos actualmente seleccionados, con
   *    sólo los módulos que el vendedor ya marcó. Se usa en modo
   *    regenerateOnly para que Claude genere textos narrativos coherentes
   *    con la selección actual del vendedor, no con el catálogo completo.
   */
  const buildCatalogPayload = (
    selectedOnly: Item[] | null,
  ): AiAnalysisInput['products'] => {
    if (selectedOnly) {
      return selectedOnly
        .map((it) => {
          const p = products.find((x) => x.id === it.product_id);
          if (!p) return null;
          const selectedIds = new Set(it.modules.map((m) => m.module_id));
          const mods = (p.modules || [])
            .filter((m) => selectedIds.has(m.id))
            .map((m) => ({ id: m.id, name: m.name }));
          return {
            id: p.id,
            name: p.name,
            modules: mods,
            requires_recurring: p.requires_recurring,
            default_weeks: p.default_weeks,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    }
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      modules: (p.modules || []).map((m) => ({ id: m.id, name: m.name })),
      requires_recurring: p.requires_recurring,
      default_weeks: p.default_weeks,
    }));
  };

  /**
   * v2.27 — análisis IA con Claude Haiku 4.5 vía Edge Function, y fallback
   * automático a rule-based si el LLM falla o devuelve 0 productos válidos.
   *
   * Opciones:
   *  - regenerateOnly=true: NO toca items/discount/weeks/reasons. Sólo
   *    regenera los 5 campos narrativos a partir de la selección actual.
   *    Usado por el botón "Regenerar texto" cuando el vendedor modificó
   *    productos y los textos quedaron desactualizados.
   *  - forceLocal=true: skip LLM, usa rule-based directamente. Útil para
   *    desarrollo o para depurar sin gastar tokens.
   *
   * Al finalizar (ambos paths, éxito o fallback):
   *   - setAnalyzedSignature(signature de los items finales).
   *   - Limpia el flag de loading correspondiente.
   *   - Si NO regenerateOnly, navega a step 4.
   */
  const runAiAnalysis = async (
    opts?: { forceLocal?: boolean; regenerateOnly?: boolean },
  ): Promise<void> => {
    const forceLocal = !!opts?.forceLocal;
    const regenerateOnly = !!opts?.regenerateOnly;
    // v2.27.2 — wall-clock para latencia total (path LLM-fallback-to-rules
    // ya incluye el roundtrip que falló). Para path LLM puro usamos el
    // _latencyMs que viene en el resultado (sólo cuenta el request real).
    const analysisStart = Date.now();

    if (regenerateOnly) setRegenerating(true);
    else setAnalyzing(true);

    // Helpers de aplicación, cerrados sobre el scope del Wizard.
    const applyFullRuleBased = () => {
      const rb = runRuleBasedAnalysis();
      setItems(rb.suggested);
      setAiReasons(rb.reasons);
      setDiscount(rb.discount);
      setDeliveryWeeks(rb.weeks);
      setSolutionSummary(rb.solutionSummary);
      setScopeSummary(rb.scopeSummary);
      setModalitySummary(rb.modalitySummary);
      setJustificationText(rb.justificationText);
      setProposalText(rb.proposalText);
      setAnalyzedSignature(computeItemsSignature(rb.suggested));
    };

    const applyTextsOnlyFromRuleBased = () => {
      const rb = runRuleBasedAnalysis();
      // En regenerateOnly los items NO cambian — sólo los textos narrativos.
      setSolutionSummary(rb.solutionSummary);
      setScopeSummary(rb.scopeSummary);
      setModalitySummary(rb.modalitySummary);
      setJustificationText(rb.justificationText);
      setProposalText(rb.proposalText);
      setAnalyzedSignature(computeItemsSignature(items));
    };

    // Camino forceLocal: ni siquiera intenta LLM.
    if (forceLocal) {
      try {
        if (regenerateOnly) applyTextsOnlyFromRuleBased();
        else applyFullRuleBased();
        setAiMode('rules');
        setAiError(null);
        // v2.27.2 — log de métrica (fire-and-forget).
        void logAiAnalysis({
          vendor_id: vendor?.id ?? null,
          mode: 'rules',
          cached: false,
          regenerate_only: regenerateOnly,
          latency_ms: null,
          error_message: null,
          fallback_reason: 'force-local',
          model: null,
          input_tokens: null,
          output_tokens: null,
          suggested_count: null,
        });
      } finally {
        if (regenerateOnly) {
          setRegenerating(false);
        } else {
          setAnalyzing(false);
          setStep(4);
        }
      }
      return;
    }

    // Camino normal: LLM primero, fallback a rule-based en catch.
    const input: AiAnalysisInput = {
      requirements,
      client: {
        company: client.company,
        contact: client.contact,
        industry: client.industry,
        size: client.size,
      },
      urgency,
      products: buildCatalogPayload(regenerateOnly ? items : null),
    };

    try {
      const result = await analyzeRequirementsViaEdgeFunction(input);

      if (regenerateOnly) {
        // Aplica SOLO textos narrativos — no toca items/discount/weeks/reasons.
        setSolutionSummary(result.solution_summary || '');
        setScopeSummary(result.scope_summary || '');
        setModalitySummary(result.modality_summary || '');
        setJustificationText(result.justification_text || '');
        setProposalText(result.proposal_text || '');
        setAnalyzedSignature(computeItemsSignature(items));
      } else {
        const expanded = buildItemsFromLlm(result.suggested || []);
        // 0 productos válidos → tratamos como fallo y caemos a rule-based.
        if (expanded.length === 0) {
          throw new Error(
            'La IA no pudo identificar productos válidos del catálogo.',
          );
        }
        setItems(expanded);
        setAiReasons(result.reasons || []);
        setDiscount(
          Number.isFinite(result.suggested_discount) ? result.suggested_discount : 0,
        );
        setDeliveryWeeks(
          Math.max(2, Number(result.suggested_delivery_weeks) || 4),
        );
        setSolutionSummary(result.solution_summary || '');
        setScopeSummary(result.scope_summary || '');
        setModalitySummary(result.modality_summary || '');
        setJustificationText(result.justification_text || '');
        setProposalText(result.proposal_text || '');
        setAnalyzedSignature(computeItemsSignature(expanded));
      }
      setAiMode('llm');
      setAiError(null);
      // v2.27.2 — log de métrica (fire-and-forget). Diferencia cache hit
      // vs LLM real via el _cached que viene marcado por db.ts.
      void logAiAnalysis({
        vendor_id: vendor?.id ?? null,
        mode: 'llm',
        cached: !!result._cached,
        regenerate_only: regenerateOnly,
        latency_ms: result._latencyMs ?? (Date.now() - analysisStart),
        error_message: null,
        fallback_reason: null,
        model: result.model ?? null,
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        suggested_count: result.suggested?.length ?? null,
      });
    } catch (err: any) {
      const msg = err?.message || 'Error en análisis con IA';
      console.warn('[Wizard] LLM falló, fallback a rule-based:', msg);
      if (regenerateOnly) applyTextsOnlyFromRuleBased();
      else applyFullRuleBased();
      setAiMode('rules');
      setAiError(msg);
      // v2.27.2 — log del fallback. fallback_reason estructurado para
      // facilitar agrupar en queries ("cuántos fallos por 0-products?").
      const fallbackReason = msg.includes('productos válidos')
        ? '0-products'
        : 'api-error';
      void logAiAnalysis({
        vendor_id: vendor?.id ?? null,
        mode: 'rules',
        cached: false,
        regenerate_only: regenerateOnly,
        latency_ms: Date.now() - analysisStart,
        error_message: msg,
        fallback_reason: fallbackReason,
        model: null,
        input_tokens: null,
        output_tokens: null,
        suggested_count: null,
      });
    } finally {
      if (regenerateOnly) {
        setRegenerating(false);
      } else {
        setAnalyzing(false);
        setStep(4);
      }
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        client: {
          // v2.26: si el vendedor seleccionó un cliente del autocomplete,
          // client.id contiene el id del cliente existente → createQuote
          // reutiliza ese registro. Si está editando y el cliente ya existía,
          // también pasamos su id. Si es creación de cliente nuevo, id = undefined.
          id: client.id || (isEditing ? quote?.client?.id : undefined),
          company: client.company,
          contact: client.contact,
          contact_role: client.contact_role,
          email: client.email,
          phone: client.phone,
          industry: client.industry,
          size: client.size,
          ruc: client.ruc,
          address: client.address,
        },
        vendor_id: vendor.id,
        items,
        discount,
        valid_days: validDays,
        delivery_weeks: deliveryWeeks,
        payment_terms: paymentTerms,
        proposal_text: proposalText,
        requirements: requirements,
        // v2.25 — campos para el formato proforma
        justification_text: justificationText,
        solution_summary: solutionSummary,
        scope_summary: scopeSummary,
        modality_summary: modalitySummary,
        // `terms` se edita solo desde QuotePreview, no desde el Wizard:
        // al crear/editar mantenemos el valor actual (o null en cotización nueva).
        terms: isEditing ? (quote?.terms ?? null) : null,
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
  // v2.18: todos los módulos con recurring deben tener ciclo definido
  const recurringValid = items.every((it) => {
    const p = products.find((x) => x.id === it.product_id);
    if (!p || !p.requires_recurring) return true;
    const modsWithRec = it.modules.filter((sm) => {
      const pm = p.modules?.find((x) => x.id === sm.module_id);
      return pm && Number(pm.recurring_monthly_price || 0) > 0;
    });
    if (modsWithRec.length > 0) return modsWithRec.every((sm) => sm.recurring_billing_cycle != null);
    if (Number(p.recurring_monthly_price || 0) > 0) return it.recurring_billing_cycle != null;
    return true;
  });

  const canSubmit = items.length > 0 && !submitting && recurringValid;

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
          <Step1Client
            client={client}
            setClient={setClient}
            existingClients={existingClients}
            onNext={() => setStep(2)}
            canNext={canNext1}
          />
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
                // v2.27: runAiAnalysis es async (LLM); disparamos fire-and-forget,
                // la función maneja setAnalyzing/setStep(4) internamente.
                void runAiAnalysis();
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
            aiMode={aiMode}
            aiError={aiError}
            hasStaleNarratives={hasStaleNarratives}
            regenerating={regenerating}
            onRegenerate={() => {
              void runAiAnalysis({ regenerateOnly: true });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1 ───
/**
 * v2.26 — Step1Client rediseñado:
 *  - RUC arriba con botón "Validar" (consulta Decolecta + detecta duplicados BD)
 *  - Razón social convertida en combobox: autocompleta con clientes existentes
 *    (filtra por substring en empresa/RUC). Al seleccionar uno, autollena los
 *    9 campos y guarda client.id para reutilizar ese registro al guardar la
 *    cotización.
 *  - Al modificar cualquier campo después de seleccionar, se desconecta del
 *    cliente existente (id = undefined) y se crea uno nuevo al guardar.
 */
function Step1Client({
  client,
  setClient,
  existingClients,
  onNext,
  canNext,
}: {
  client: ClientForm;
  setClient: (c: ClientForm) => void;
  existingClients: ClientWithStats[];
  onNext: () => void;
  canNext: boolean;
}) {
  const [rucValidating, setRucValidating] = useState(false);
  const [rucMsg, setRucMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [companyFocused, setCompanyFocused] = useState(false);

  // Helper: wraps setClient para limpiar el vínculo con cliente existente
  // cuando el vendedor edita manualmente un campo.
  const patchClient = (patch: Partial<ClientForm>) => {
    setClient({ ...client, ...patch, id: undefined });
  };

  // Autocomplete: filtrar clientes por substring en company/ruc/contact.
  // Solo se muestra cuando el input está enfocado Y hay texto en company,
  // y el usuario NO acaba de seleccionar (client.id truthy).
  const suggestions = useMemo(() => {
    const q = client.company.trim().toLowerCase();
    if (!q || client.id) return [];
    const rucQuery = client.ruc.trim().toLowerCase();
    return existingClients
      .filter((c) => {
        const matchName = (c.company || '').toLowerCase().includes(q);
        const matchRuc = rucQuery && (c.ruc || '').toLowerCase().includes(rucQuery);
        return matchName || matchRuc;
      })
      .slice(0, 8);
  }, [client.company, client.ruc, client.id, existingClients]);

  const selectExistingClient = (c: ClientWithStats) => {
    setClient({
      id: c.id,
      company: c.company || '',
      contact: c.contact || '',
      contact_role: c.contact_role || '',
      email: c.email || '',
      phone: c.phone || '',
      industry: c.industry || '',
      size: (c.size as any) || 'mediana',
      ruc: c.ruc || '',
      address: c.address || '',
    });
    setCompanyFocused(false);
    setRucMsg(null);
  };

  const rucClean = client.ruc.replace(/\s/g, '');
  const rucHasRightFormat = /^\d{11}$/.test(rucClean) && /^(10|15|17|20)/.test(rucClean);

  const doValidateRuc = async () => {
    if (!rucHasRightFormat) {
      setRucMsg({
        kind: 'err',
        text: 'Formato inválido. RUC: 11 dígitos que empiezan con 10, 15, 17 o 20.',
      });
      return;
    }
    setRucValidating(true);
    setRucMsg(null);
    try {
      // 1) Detectar duplicado en BD
      const existing = await fetchClientByRuc(rucClean);
      if (existing) {
        setRucMsg({
          kind: 'warn',
          text: `Este RUC ya está registrado como "${existing.company}". Al hacer clic en "Usar este cliente" abajo, se autollenarán todos los campos.`,
        });
        // Seleccionamos pero el usuario puede revertir editando manualmente.
        // Incluimos "last_quote_at" y "quote_count" vacíos para cumplir ClientWithStats.
        selectExistingClient({
          ...existing,
          last_quote_at: null,
          quote_count: 0,
        } as ClientWithStats);
        return;
      }

      // 2) Consultar Decolecta vía Edge Function
      const data = await validateRucViaEdgeFunction(rucClean);
      // Autollenar sin perder lo ya escrito. OJO: patchClient limpia client.id,
      // lo cual es correcto — acá estamos creando un cliente nuevo.
      patchClient({
        ruc: data.ruc,
        company: data.razon_social || client.company,
        address: data.direccion || client.address,
      });
      setRucMsg({
        kind: 'ok',
        text: `✓ ${data.razon_social}${data.estado ? ` · ${data.estado}` : ''}`,
      });
    } catch (e: any) {
      setRucMsg({ kind: 'err', text: e?.message || 'Error validando RUC' });
    } finally {
      setRucValidating(false);
    }
  };

  const isLinked = !!client.id;

  return (
    <div className="nx-card nx-card-padded fade-in">
      <h2 className="h-display" style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>
        Datos del cliente
      </h2>
      <p style={{ color: 'var(--ink-500)', fontSize: 13.5, margin: '0 0 22px' }}>
        Información de la empresa a la que va dirigida la cotización. Puedes validar el RUC en SUNAT para autollenar los datos.
      </p>

      {isLinked && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--teal-50)',
            border: '1px solid var(--teal-100)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12.5,
            color: 'var(--teal-700)',
          }}
        >
          <div>
            <Icon name="check" size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Cliente existente seleccionado. Los datos se reutilizarán sin crear uno nuevo.
          </div>
          <button
            type="button"
            onClick={() => setClient({ ...client, id: undefined })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--teal-700)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Desvincular
          </button>
        </div>
      )}

      {/* ▸ RUC arriba con botón Validar */}
      <div className="nx-field" style={{ marginBottom: 16 }}>
        <label className="nx-label">RUC (opcional)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="nx-input"
            style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            placeholder="20605541231"
            value={client.ruc}
            onChange={(e) => {
              patchClient({ ruc: e.target.value });
              setRucMsg(null);
            }}
            maxLength={11}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={doValidateRuc}
            disabled={!rucHasRightFormat || rucValidating}
            style={{ whiteSpace: 'nowrap' }}
            title={
              rucHasRightFormat
                ? 'Consulta SUNAT vía Decolecta y autocompleta razón social + dirección'
                : 'RUC debe tener 11 dígitos y empezar con 10/15/17/20'
            }
          >
            {rucValidating ? <div className="spinner" /> : <Icon name="check" size={13} />}
            Validar
          </button>
        </div>
        {rucMsg && (
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 12.5,
              background:
                rucMsg.kind === 'ok'
                  ? '#f0fdf4'
                  : rucMsg.kind === 'warn'
                  ? '#fffbeb'
                  : '#fef2f2',
              color:
                rucMsg.kind === 'ok'
                  ? '#166534'
                  : rucMsg.kind === 'warn'
                  ? '#92400e'
                  : '#b91c1c',
            }}
          >
            {rucMsg.text}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {/* ▸ Empresa con autocomplete */}
        <div className="nx-field" style={{ gridColumn: '1 / -1', position: 'relative' }}>
          <label className="nx-label">Empresa / Razón social *</label>
          <input
            className="nx-input"
            placeholder="Escribe para buscar o crear un cliente nuevo..."
            value={client.company}
            onChange={(e) => patchClient({ company: e.target.value })}
            onFocus={() => setCompanyFocused(true)}
            // Delay para que el click en una sugerencia alcance a registrarse
            onBlur={() => setTimeout(() => setCompanyFocused(false), 180)}
            autoComplete="off"
          />
          {companyFocused && suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid var(--ink-200)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 30,
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink-500)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  background: 'var(--ink-50)',
                  borderBottom: '1px solid var(--ink-200)',
                }}
              >
                {suggestions.length} coincidencia{suggestions.length === 1 ? '' : 's'}
              </div>
              {suggestions.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectExistingClient(c)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--ink-100)',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--teal-50)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{c.company}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
                    {c.ruc && (
                      <span className="mono" style={{ marginRight: 10 }}>
                        {c.ruc}
                      </span>
                    )}
                    {c.contact && <span>{c.contact}</span>}
                    {c.quote_count > 0 && (
                      <span style={{ marginLeft: 8, color: 'var(--teal-700)' }}>
                        · {c.quote_count} cotización{c.quote_count === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11.5,
                  color: 'var(--ink-500)',
                  fontStyle: 'italic',
                }}
              >
                Si ninguno coincide, solo sigue escribiendo y se creará uno nuevo.
              </div>
            </div>
          )}
        </div>

        {/* ▸ Dirección (full width) */}
        <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
          <label className="nx-label">Dirección</label>
          <input
            className="nx-input"
            placeholder="Av. Principal 123, Distrito, Lima"
            value={client.address}
            onChange={(e) => patchClient({ address: e.target.value })}
          />
        </div>

        <div className="nx-field">
          <label className="nx-label">Contacto principal *</label>
          <input
            className="nx-input"
            placeholder="Nombre del decisor"
            value={client.contact}
            onChange={(e) => patchClient({ contact: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Cargo del contacto</label>
          <input
            className="nx-input"
            placeholder="Ej. Gerente General"
            value={client.contact_role}
            onChange={(e) => patchClient({ contact_role: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Email</label>
          <input
            className="nx-input"
            type="email"
            placeholder="contacto@empresa.com"
            value={client.email}
            onChange={(e) => patchClient({ email: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Teléfono</label>
          <input
            className="nx-input"
            placeholder="+51 999 999 999"
            value={client.phone}
            onChange={(e) => patchClient({ phone: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Industria / Rubro</label>
          <input
            className="nx-input"
            placeholder="Salud, retail, legal..."
            value={client.industry}
            onChange={(e) => patchClient({ industry: e.target.value })}
          />
        </div>
        <div className="nx-field">
          <label className="nx-label">Tamaño</label>
          <select
            className="nx-select"
            value={client.size}
            onChange={(e) => patchClient({ size: e.target.value as any })}
          >
            <option value="pequeña">Pequeña</option>
            <option value="mediana">Mediana</option>
            <option value="grande">Grande</option>
          </select>
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
  // v2.27 — visibilidad del modo IA y control de regeneración de textos
  aiMode: 'none' | 'llm' | 'rules';
  aiError: string | null;
  hasStaleNarratives: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
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
    aiMode,
    aiError,
    hasStaleNarratives,
    regenerating,
    onRegenerate,
  } = props;

  const updateQty = (idx: number, qty: number) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], qty: Math.max(1, qty) };
    setItems(copy);
  };

  const toggleModule = (idx: number, moduleId: string) => {
    const copy = [...items];
    const item = copy[idx];
    const prod = products.find((p) => p.id === item.product_id);
    const exists = item.modules.some((m) => m.module_id === moduleId);
    if (exists) {
      copy[idx] = {
        ...item,
        modules: item.modules.filter((m) => m.module_id !== moduleId),
      };
    } else {
      const pm = prod?.modules?.find((x) => x.id === moduleId);
      const hasRecurring =
        (prod?.requires_recurring ?? false) && Number(pm?.recurring_monthly_price || 0) > 0;
      copy[idx] = {
        ...item,
        modules: [
          ...item.modules,
          {
            module_id: moduleId,
            recurring_billing_cycle: hasRecurring ? 'annual' : null,
            recurring_gift_months: 0,
          },
        ],
      };
    }
    setItems(copy);
  };

  // v2.18: actualizar ciclo/regalo de un módulo específico
  const updateModuleRecurring = (
    itemIdx: number,
    moduleId: string,
    patch: Partial<QuoteItemModule>,
  ) => {
    const copy = [...items];
    copy[itemIdx] = {
      ...copy[itemIdx],
      modules: copy[itemIdx].modules.map((m) =>
        m.module_id === moduleId ? { ...m, ...patch } : m,
      ),
    };
    setItems(copy);
  };

  // v2.18: actualizar ciclo/regalo a nivel item (fallback)
  const updateItemRecurring = (itemIdx: number, patch: Partial<Item>) => {
    const copy = [...items];
    copy[itemIdx] = { ...copy[itemIdx], ...patch };
    setItems(copy);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const addProduct = (productId: string) => {
    if (items.find((i) => i.product_id === productId)) return;
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setItems([...items, buildItemForProduct(prod, 1, [])]);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* v2.27 — LLM falló, estamos en modo rule-based */}
      {aiMode === 'rules' && aiError && (
        <div
          className="nx-card"
          style={{
            padding: 12,
            background: 'linear-gradient(135deg, #FFF7ED, rgba(255,255,255,.5))',
            borderColor: '#FED7AA',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 12.5,
              color: '#9A3412',
            }}
          >
            <Icon
              name="info"
              size={14}
              style={{ color: '#C2410C', flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                Análisis en modo básico
              </div>
              <div style={{ color: '#9A3412', opacity: 0.85 }}>
                No se pudo usar la IA avanzada. Revisa los productos y textos.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v2.27 — el vendedor editó items después del análisis; los textos
          narrativos probablemente mencionen productos que ya no están. */}
      {hasStaleNarratives && (
        <div
          className="nx-card"
          style={{
            padding: 12,
            background: 'linear-gradient(135deg, #FEFCE8, rgba(255,255,255,.5))',
            borderColor: '#FDE68A',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 12.5,
              color: '#854D0E',
            }}
          >
            <Icon
              name="info"
              size={14}
              style={{ color: '#CA8A04', flexShrink: 0, marginTop: 2 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                Los productos cambiaron
              </div>
              <div style={{ color: '#854D0E', opacity: 0.85 }}>
                Los textos pueden mencionar productos que ya no están.
              </div>
            </div>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="btn btn-sm"
              style={{
                background: '#CA8A04',
                color: 'white',
                flexShrink: 0,
                alignSelf: 'center',
              }}
            >
              {regenerating ? 'Regenerando…' : 'Regenerar texto'}
            </button>
          </div>
        </div>
      )}

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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '.12em',
                color: 'var(--teal-700)',
                flex: 1,
              }}
            >
              <Icon name="sparkle" size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              ANÁLISIS IA
            </div>
            {/* v2.27 — badge según modo */}
            {aiMode === 'llm' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'var(--teal-100)',
                  color: 'var(--teal-700)',
                  letterSpacing: '.02em',
                }}
              >
                Claude Haiku 4.5
              </span>
            )}
            {aiMode === 'rules' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: '#FFEDD5',
                  color: '#9A3412',
                  letterSpacing: '.02em',
                }}
              >
                Modo básico
              </span>
            )}
            {/* v2.27 — botón "Regenerar" estilo link sólo cuando hay análisis
                y los textos NO están stale (cuando están stale, el botón vive
                en el banner amarillo superior). */}
            {aiMode !== 'none' && !hasStaleNarratives && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: 11.5,
                  color: 'var(--teal-700)',
                  textDecoration: 'underline',
                  cursor: regenerating ? 'wait' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {regenerating ? 'Regenerando…' : 'Regenerar'}
              </button>
            )}
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
                    const active = it.modules.some((sm) => sm.module_id === m.id);
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

              {/* v2.18: UI de ciclo Mensual/Anual + meses de regalo */}
              {p.requires_recurring && (() => {
                const recurringModules = it.modules
                  .map((sm) => {
                    const pm = p.modules?.find((x) => x.id === sm.module_id);
                    if (!pm || Number(pm.recurring_monthly_price || 0) <= 0) return null;
                    return { sel: sm, pm };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null);
                const itemFallback =
                  recurringModules.length === 0 &&
                  Number(p.recurring_monthly_price || 0) > 0;
                if (recurringModules.length === 0 && !itemFallback) return null;

                const renderBlock = (
                  label: string,
                  monthlyUnit: number,
                  cycle: RecurringCycle | null,
                  gift: number,
                  onCycle: (c: RecurringCycle) => void,
                  onGift: (g: number) => void,
                ) => {
                  const annualFirst = monthlyUnit * 12;
                  const annualRenewal = monthlyUnit * (12 - gift);
                  return (
                    <div
                      key={label}
                      style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        background: 'var(--ink-50)',
                        border: '1px solid var(--ink-200)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>
                        Renovación · {label}{' '}
                        <span style={{ fontWeight: 500, color: 'var(--ink-500)' }}>
                          ({fmtMoney(monthlyUnit)}/mes)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: cycle === 'annual' ? 8 : 0 }}>
                        <button
                          type="button"
                          onClick={() => onCycle('monthly')}
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            fontSize: 12,
                            border: '1px solid ' + (cycle === 'monthly' ? 'var(--teal-600)' : 'var(--ink-200)'),
                            background: cycle === 'monthly' ? 'var(--teal-50)' : 'white',
                            color: cycle === 'monthly' ? 'var(--teal-700)' : 'var(--ink-700)',
                            fontWeight: cycle === 'monthly' ? 600 : 500,
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Mensual · {fmtMoney(monthlyUnit)}/mes
                        </button>
                        <button
                          type="button"
                          onClick={() => onCycle('annual')}
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            fontSize: 12,
                            border: '1px solid ' + (cycle === 'annual' ? 'var(--teal-600)' : 'var(--ink-200)'),
                            background: cycle === 'annual' ? 'var(--teal-50)' : 'white',
                            color: cycle === 'annual' ? 'var(--teal-700)' : 'var(--ink-700)',
                            fontWeight: cycle === 'annual' ? 600 : 500,
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Anual · {fmtMoney(annualFirst)}/año
                        </button>
                      </div>
                      {cycle === 'annual' && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                            <span style={{ color: 'var(--ink-600)' }}>Meses de regalo:</span>
                            <input
                              type="number"
                              min={0}
                              max={MAX_GIFT_MONTHS}
                              value={gift}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(MAX_GIFT_MONTHS, parseInt(e.target.value) || 0));
                                onGift(v);
                              }}
                              style={{
                                width: 56,
                                padding: '3px 8px',
                                fontSize: 12,
                                border: '1px solid var(--ink-200)',
                                borderRadius: 5,
                                textAlign: 'center',
                              }}
                            />
                            <span style={{ color: 'var(--ink-500)' }}>
                              · Renovación año 2+: {fmtMoney(annualRenewal)}/año
                            </span>
                          </div>
                          {gift > WARN_GIFT_MONTHS_THRESHOLD && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '6px 10px',
                                background: '#FEF3C7',
                                border: '1px solid #F59E0B',
                                borderRadius: 5,
                                fontSize: 11,
                                color: '#92400E',
                              }}
                            >
                              ⚠ Son {gift} meses gratis desde el año 2. ¿Es correcto?
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <div style={{ marginTop: 4 }}>
                    {recurringModules.map(({ sel, pm }) =>
                      renderBlock(
                        pm.name,
                        Number(pm.recurring_monthly_price),
                        sel.recurring_billing_cycle,
                        sel.recurring_gift_months,
                        (c) => updateModuleRecurring(idx, pm.id, { recurring_billing_cycle: c, recurring_gift_months: c === 'annual' ? sel.recurring_gift_months : 0 }),
                        (g) => updateModuleRecurring(idx, pm.id, { recurring_gift_months: g }),
                      )
                    )}
                    {itemFallback && renderBlock(
                      p.name,
                      Number(p.recurring_monthly_price),
                      it.recurring_billing_cycle,
                      it.recurring_gift_months,
                      (c) => updateItemRecurring(idx, { recurring_billing_cycle: c, recurring_gift_months: c === 'annual' ? it.recurring_gift_months : 0 }),
                      (g) => updateItemRecurring(idx, { recurring_gift_months: g }),
                    )}
                  </div>
                );
              })()}
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

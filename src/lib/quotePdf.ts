/**
 * v2.25 — Formato proforma tributario.
 *
 * Cambios vs. v2.24:
 *  - Layout completo rediseñado estilo "COTIZACIÓN / PROFORMA" con header band,
 *    bloques Emisor/Cliente en 2 columnas, chips de Descripción del Proyecto,
 *    Justificación narrativa, tabla numerada de servicios, totales sin cuadro
 *    oscuro, monto en palabras ("Son: …"), 5 chips de condiciones, notas
 *    numeradas y doble bloque de firmas.
 *  - Campos IA nuevos: `justification_text` (fallback a proposal_text),
 *    `solution_summary` / `scope_summary` / `modality_summary`.
 *  - "Notas y Condiciones" híbridas: `quote.terms ?? orgSettings.default_terms`.
 *
 * Sigue usando jsPDF con API de dibujo programática (sin html2canvas) para
 * controlar tamaño del archivo, evitar problemas con emojis y mantener
 * consistencia pixel-perfect entre navegadores.
 */
import { jsPDF } from 'jspdf';
import type { OrganizationSettings, Product, Quote } from './types';
import {
  computeQuoteTotals,
  fmtDateNumeric,
  fmtMoney,
  formalRoleLabel,
  getRecurringCharges,
  getRecurringHeaderText,
  getRecurringRowSubtext,
  moneyToSonText,
} from './utils';

// ═══════════════════════════════════════════════════════════════════════
// Paleta (RGB) — misma base que el panel, más accent rojo para N° COTIZACIÓN.
// ═══════════════════════════════════════════════════════════════════════
const COLOR = {
  teal900: [19, 78, 74] as const,
  teal700: [15, 118, 110] as const,
  teal50:  [236, 253, 245] as const,
  ink900:  [15, 23, 42] as const,
  ink700:  [51, 65, 85] as const,
  ink500:  [100, 116, 139] as const,
  ink400:  [148, 163, 184] as const,
  ink300:  [203, 213, 225] as const,
  ink200:  [226, 232, 240] as const,
  ink100:  [241, 245, 249] as const,
  ink50:   [248, 250, 252] as const,
  amber600:[217, 119, 6] as const,
  red700:  [185, 28, 28] as const,
  white:   [255, 255, 255] as const,
} as const;

function setFill(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setText(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/**
 * Dibuja texto con "letter-spacing" manual (intercalando espacios) para lograr
 * el look tipo "E M I S O R" del formato proforma. jsPDF no soporta
 * letter-spacing nativo, este truco es menos preciso que CSS pero bastante
 * cercano visualmente.
 */
function drawSpacedLabel(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  color: readonly [number, number, number],
  fontSize: number = 8.5,
  align: 'left' | 'right' = 'left',
) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(fontSize);
  setText(pdf, color);
  const spaced = text.toUpperCase().split('').join(' ');
  pdf.text(spaced, x, y, { align });
}

// ═══════════════════════════════════════════════════════════════════════
// Render principal
// ═══════════════════════════════════════════════════════════════════════

export function generateQuotePdf(
  quote: Quote,
  products: Product[],
  orgSettings: OrganizationSettings | null,
): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();   // 595
  const pageHeight = pdf.internal.pageSize.getHeight(); // 842
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;          // 511
  // v2.28: moneda del quote y TC. Usamos el snapshot guardado en el quote;
  // si no existe (cotizaciones legadas) caemos a orgSettings.exchange_rate.
  const quoteCurrency = quote.currency || 'PEN';
  const tc =
    (quote.exchange_rate ? Number(quote.exchange_rate) : null) ??
    (orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null);
  const hasTc = !!(tc && tc > 0);
  const otherCurrency = quoteCurrency === 'PEN' ? 'USD' : 'PEN';
  const quoteSymbol = quoteCurrency === 'USD' ? '$' : 'S/';

  const totals = computeQuoteTotals(
    quote.items || [],
    products,
    quote.discount,
    quoteCurrency,
    tc,
  );
  const recurring = getRecurringCharges(quote.items || [], products, quoteCurrency, tc);

  /** Convierte un monto en moneda del quote a la otra moneda (para columna USD/PEN secundaria). */
  const toOther = (n: number): number =>
    hasTc ? (quoteCurrency === 'PEN' ? n / tc! : n * tc!) : 0;
  const fmtOther = (n: number) => fmtMoney(toOther(n), otherCurrency);

  // Reserva 36pt al final para el footer.
  const footerReserve = 36;

  let y = 0;

  const ensureSpace = (need: number) => {
    if (y + need > pageHeight - footerReserve) {
      pdf.addPage();
      y = margin;
    }
  };

  // ─── 1) HEADER BAND ──────────────────────────────────────────────────
  y = margin;

  const brandName = (orgSettings?.name || 'NEXOVA').toUpperCase();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  setText(pdf, COLOR.teal900);
  pdf.text(brandName, margin, y + 14);

  const tagline = (orgSettings?.legal_name && orgSettings.legal_name !== orgSettings.name)
    ? orgSettings.legal_name
    : 'SOFTWARE EMPRESARIAL';
  drawSpacedLabel(pdf, tagline, margin, y + 26, COLOR.ink500, 7);

  // Lado derecho: contacto
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  setText(pdf, COLOR.ink700);
  const rX = pageWidth - margin;
  let rY = y + 6;
  if (orgSettings?.phone) { pdf.text(orgSettings.phone, rX, rY, { align: 'right' }); rY += 12; }
  if (orgSettings?.email) { pdf.text(orgSettings.email, rX, rY, { align: 'right' }); rY += 12; }
  if (orgSettings?.website) {
    setText(pdf, COLOR.teal700);
    pdf.setFont('helvetica', 'bold');
    pdf.text(orgSettings.website, rX, rY, { align: 'right' });
  }

  y += 40;

  // Doble línea teal decorativa
  setDraw(pdf, COLOR.teal700);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y, pageWidth - margin, y);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y + 3, pageWidth - margin, y + 3);

  y += 18;

  // ─── 2) TITLE BAR ────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  setText(pdf, COLOR.ink900);
  pdf.text('COTIZACIÓN / PROFORMA', margin, y);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  setText(pdf, COLOR.ink500);
  pdf.text('Propuesta comercial formal', margin, y + 13);

  // Bloque N° COTIZACIÓN (derecha)
  drawSpacedLabel(pdf, 'N° COTIZACIÓN', pageWidth - margin, y - 8, COLOR.red700, 7.5, 'right');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  setText(pdf, COLOR.ink900);
  pdf.text(quote.code, pageWidth - margin, y + 6, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  setText(pdf, COLOR.ink700);
  pdf.text(`Fecha: ${fmtDateNumeric(quote.created_at)}`, pageWidth - margin, y + 18, { align: 'right' });
  pdf.text(`Válido hasta: ${fmtDateNumeric(quote.valid_until)}`, pageWidth - margin, y + 29, { align: 'right' });

  y += 40;

  // Separador
  setDraw(pdf, COLOR.ink200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 14;

  // ─── 3) EMISOR / CLIENTE (2 columnas) ────────────────────────────────
  const colW = contentWidth / 2 - 14;
  const colRX = margin + contentWidth / 2 + 14;

  drawSpacedLabel(pdf, 'EMISOR', margin, y, COLOR.teal900, 8.5);
  drawSpacedLabel(pdf, 'CLIENTE', colRX, y, COLOR.teal900, 8.5);
  y += 14;

  const drawParty = (
    x: number,
    name: string,
    ruc: string | null,
    lines: (string | null | undefined)[],
    attn: string | null,
  ) => {
    let py = y;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    setText(pdf, COLOR.ink900);
    const nameLines = pdf.splitTextToSize(name, colW);
    pdf.text(nameLines, x, py);
    py += nameLines.length * 12;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    setText(pdf, COLOR.ink700);
    if (ruc) {
      pdf.text(`RUC: ${ruc}`, x, py);
      py += 11;
    }
    for (const l of lines) {
      if (!l) continue;
      const lls = pdf.splitTextToSize(l, colW);
      pdf.text(lls, x, py);
      py += lls.length * 11;
    }
    if (attn) {
      py += 3;
      setText(pdf, COLOR.ink900);
      const attnLines = pdf.splitTextToSize(attn, colW);
      pdf.text(attnLines, x, py);
      py += attnLines.length * 11;
    }
    return py;
  };

  const emisorLines = [
    orgSettings?.address,
    orgSettings?.email && orgSettings?.website
      ? `${orgSettings.email} · ${orgSettings.website}`
      : (orgSettings?.email || orgSettings?.website),
  ];
  const clienteAttn = quote.client?.contact
    ? `Attn: ${quote.client.contact}${quote.client.contact_role ? ` · ${quote.client.contact_role}` : ''}`
    : null;

  const emisorBottom = drawParty(
    margin,
    orgSettings?.legal_name || orgSettings?.name || 'NEXOVA',
    orgSettings?.ruc || null,
    emisorLines,
    null,
  );
  const clienteBottom = drawParty(
    colRX,
    quote.client?.company || 'Cliente',
    quote.client?.ruc || null,
    [quote.client?.address, quote.client?.email, quote.client?.phone],
    clienteAttn,
  );
  y = Math.max(emisorBottom, clienteBottom) + 10;

  setDraw(pdf, COLOR.ink200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

  // ─── 4) DESCRIPCIÓN DEL PROYECTO (3 chips, solo si hay datos) ───────
  const hasAnyChip = !!(quote.solution_summary || quote.scope_summary || quote.modality_summary);
  if (hasAnyChip) {
    ensureSpace(60);
    drawSpacedLabel(pdf, 'DESCRIPCIÓN DEL PROYECTO', margin, y, COLOR.teal900, 8.5);
    y += 12;

    const chipW = (contentWidth - 16) / 3;
    const chipH = 40;
    const chips: { label: string; value: string | null }[] = [
      { label: 'Solución', value: quote.solution_summary },
      { label: 'Alcance', value: quote.scope_summary },
      { label: 'Modalidad', value: quote.modality_summary },
    ];
    chips.forEach((c, i) => {
      const cx = margin + (chipW + 8) * i;
      setFill(pdf, COLOR.ink50);
      pdf.roundedRect(cx, y, chipW, chipH, 5, 5, 'F');
      drawSpacedLabel(pdf, c.label, cx + 8, y + 11, COLOR.ink500, 7);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      setText(pdf, COLOR.ink900);
      const vLines = pdf.splitTextToSize(c.value || '—', chipW - 16);
      pdf.text(vLines.slice(0, 2), cx + 8, y + 24);
    });
    y += chipH + 12;
  }

  // ─── 5) JUSTIFICACIÓN Y CARACTERÍSTICAS DEL PROYECTO ─────────────────
  // Fallback: si no hay justification_text (cotización antigua), usar proposal_text.
  const justText = (quote.justification_text && quote.justification_text.trim())
    || (quote.proposal_text && quote.proposal_text.trim())
    || '';
  if (justText) {
    ensureSpace(30);
    drawSpacedLabel(pdf, 'JUSTIFICACIÓN Y CARACTERÍSTICAS DEL PROYECTO', margin, y, COLOR.teal900, 8.5);
    y += 12;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setText(pdf, COLOR.ink700);
    const paragraphs = justText.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const lines = pdf.splitTextToSize(para.trim(), contentWidth);
      ensureSpace(lines.length * 13);
      pdf.text(lines, margin, y);
      y += lines.length * 13 + 6;
    }
    y += 2;
  }

  // ─── 6) DETALLE DE SERVICIOS Y COSTOS (tabla numerada) ───────────────
  ensureSpace(40);
  drawSpacedLabel(pdf, 'DETALLE DE SERVICIOS Y COSTOS', margin, y, COLOR.teal900, 8.5);
  y += 14;

  // Columnas
  const colNumX   = margin;
  const colCantR  = pageWidth - margin - 80 - 70;    // right edge of Cant col
  const colUnitR  = pageWidth - margin - 80;         // right edge of P.Unit col
  const colTotalR = pageWidth - margin;              // right edge of Total col
  const colDescX  = margin + 18;
  const colDescW  = colCantR - 30 - colDescX;        // deja aire antes de Cant

  // Headers (letter-spaced, uppercase)
  drawSpacedLabel(pdf, '#', colNumX, y, COLOR.ink500, 7);
  drawSpacedLabel(pdf, 'DESCRIPCIÓN DEL SERVICIO', colDescX, y, COLOR.ink500, 7);
  drawSpacedLabel(pdf, 'CANT.', colCantR, y, COLOR.ink500, 7, 'right');
  drawSpacedLabel(pdf, 'P. UNIT.', colUnitR, y, COLOR.ink500, 7, 'right');
  drawSpacedLabel(pdf, 'TOTAL', colTotalR, y, COLOR.ink500, 7, 'right');

  y += 5;
  setDraw(pdf, COLOR.ink900);
  pdf.setLineWidth(0.7);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Filas
  let itemIndex = 0;
  for (const it of quote.items || []) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;
    itemIndex += 1;

    // Precio unitario = base + módulos + primer período recurrente
    const basePerUnit = Number(p.base_price || 0)
      + (it.modules || []).reduce((s, sm) => {
        const m = p.modules?.find((x) => x.id === sm.module_id);
        return s + Number(m?.price || 0);
      }, 0);

    const recurringLines: { label: string; amount: number }[] = [];
    let recurringAdd = 0;
    if (p.requires_recurring) {
      const modsWithRec = (it.modules || [])
        .map((sm) => ({ sm, pm: p.modules?.find((x) => x.id === sm.module_id) }))
        .filter((x) => x.pm && Number(x.pm.recurring_monthly_price || 0) > 0 && x.sm.recurring_billing_cycle);

      for (const { sm, pm } of modsWithRec) {
        const monthly = Number(pm!.recurring_monthly_price);
        const amt = (sm.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly);
        if (amt > 0) {
          recurringAdd += amt;
          recurringLines.push({
            label: `${pm!.name} · ${sm.recurring_billing_cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes'}`,
            amount: amt,
          });
        }
      }
      if (modsWithRec.length === 0
          && Number(p.recurring_monthly_price || 0) > 0
          && it.recurring_billing_cycle) {
        const monthly = Number(p.recurring_monthly_price);
        const amt = (it.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly);
        if (amt > 0) {
          recurringAdd += amt;
          recurringLines.push({
            label: `Renovación · ${it.recurring_billing_cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes'}`,
            amount: amt,
          });
        }
      }
    }

    // v2.28: los montos hasta aquí están en la moneda nativa del producto.
    // Convertimos a la moneda del quote para mostrar el unit/total consistente
    // con los totales finales.
    const productCurrency = p.currency || 'PEN';
    const toQuote = (n: number): number => {
      if (productCurrency === quoteCurrency) return n;
      if (!hasTc) return 0;
      return productCurrency === 'PEN' ? n / tc! : n * tc!;
    };
    const unitPrice = toQuote(basePerUnit + recurringAdd);
    const lineTotal = unitPrice * it.qty;

    const descLines = p.description
      ? pdf.splitTextToSize(p.description, colDescW)
      : [];
    const modules = (it.modules || [])
      .map((sm) => p.modules?.find((x) => x.id === sm.module_id))
      .filter((m): m is NonNullable<typeof m> => !!m);

    const rowH = 14
      + descLines.length * 10.5
      + (modules.length > 0 ? 4 + modules.length * 11 : 0)
      + (recurringLines.length > 0 ? recurringLines.length * 11 + 4 : 0)
      + 14;

    ensureSpace(rowH);

    // # / nombre / cant / p.unit / total en la línea principal
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setText(pdf, COLOR.ink500);
    pdf.text(String(itemIndex), colNumX + 4, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    setText(pdf, COLOR.ink900);
    pdf.text(p.name, colDescX, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(String(it.qty), colCantR, y, { align: 'right' });
    pdf.text(fmtMoney(unitPrice, quoteCurrency), colUnitR, y, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.text(fmtMoney(lineTotal, quoteCurrency), colTotalR, y, { align: 'right' });
    if (hasTc) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      setText(pdf, COLOR.ink400);
      pdf.text(fmtOther(lineTotal), colTotalR, y + 11, { align: 'right' });
    }
    y += 14;

    // Descripción (gris)
    if (descLines.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      setText(pdf, COLOR.ink500);
      pdf.text(descLines, colDescX, y);
      y += descLines.length * 10.5 + 2;
    }

    // Módulos
    if (modules.length > 0) {
      y += 2;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      for (const m of modules) {
        setText(pdf, COLOR.ink700);
        pdf.text('•', colDescX + 2, y);
        pdf.text(m.name, colDescX + 12, y);
        const nameWidth = pdf.getTextWidth(m.name);
        setText(pdf, COLOR.ink400);
        pdf.text(`+${fmtMoney(m.price, productCurrency)}`, colDescX + 12 + nameWidth + 6, y);
        y += 11;
      }
    }

    // Primer período recurrente (solo líneas > 0 — evitamos "+S/ 0.00")
    const nonZeroRec = recurringLines.filter((r) => r.amount > 0);
    if (nonZeroRec.length > 0) {
      y += 2;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      for (const rl of nonZeroRec) {
        setText(pdf, COLOR.ink500);
        pdf.text('•', colDescX + 2, y);
        pdf.text(rl.label, colDescX + 12, y);
        const lblWidth = pdf.getTextWidth(rl.label);
        setText(pdf, COLOR.ink400);
        pdf.text(`+${fmtMoney(rl.amount, productCurrency)}`, colDescX + 12 + lblWidth + 6, y);
        y += 11;
      }
    }

    y += 10;
    setDraw(pdf, COLOR.ink200);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 12;
  }

  // ─── 7) TOTALES (right-aligned, sin cuadro oscuro) ───────────────────
  ensureSpace(110);
  y += 4;

  const usdColX = pageWidth - margin;
  const solesColX = hasTc ? usdColX - 96 : usdColX;
  const labelColX = solesColX - 140;

  if (hasTc) {
    drawSpacedLabel(pdf, quoteSymbol, solesColX, y, COLOR.ink400, 7, 'right');
    drawSpacedLabel(pdf, otherCurrency, usdColX, y, COLOR.ink400, 7, 'right');
    y += 12;
  }

  // v2.28: helpers para quitar el símbolo de la moneda del quote y de la otra.
  const stripQuoteSymbol = (s: string) =>
    s.replace(quoteCurrency === 'USD' ? /^\$\s*/ : /^S\/\s*/, '');
  const stripOtherSymbol = (s: string) =>
    s.replace(otherCurrency === 'USD' ? /^\$\s*/ : /^S\/\s*/, '');

  const totalsRow = (
    label: string,
    sValue: number,
    labelColor: readonly [number, number, number],
    valueColor: readonly [number, number, number],
    prefix = '',
  ) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setText(pdf, labelColor);
    pdf.text(label, labelColX, y);
    setText(pdf, valueColor);
    const mainNum = stripQuoteSymbol(fmtMoney(sValue, quoteCurrency));
    pdf.text(`${prefix}${mainNum}`, solesColX, y, { align: 'right' });
    if (hasTc) {
      const altNum = stripOtherSymbol(fmtOther(sValue));
      pdf.text(`${prefix}${altNum}`, usdColX, y, { align: 'right' });
    }
    y += 15;
  };

  totalsRow('Subtotal', totals.subtotal, COLOR.ink700, COLOR.ink900);
  if (quote.discount > 0) {
    totalsRow(
      `Descuento (${quote.discount}%)`,
      totals.discountAmt,
      COLOR.teal700,
      COLOR.teal700,
      '− ',
    );
  }
  totalsRow('IGV (18%)', totals.igv, COLOR.ink700, COLOR.ink900);

  // Rule grueso antes del TOTAL
  y += 2;
  setDraw(pdf, COLOR.ink900);
  pdf.setLineWidth(0.8);
  pdf.line(labelColX, y, usdColX, y);
  y += 16;

  // TOTAL (grande y bold)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  setText(pdf, COLOR.ink900);
  pdf.text('TOTAL', labelColX, y);
  pdf.setFontSize(13.5);
  pdf.text(fmtMoney(totals.total, quoteCurrency), solesColX, y, { align: 'right' });
  if (hasTc) {
    pdf.text(fmtOther(totals.total), usdColX, y, { align: 'right' });
  }
  y += 20;

  // ─── 8) "Son: ..." (monto en palabras) ───────────────────────────────
  ensureSpace(24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  setText(pdf, COLOR.ink500);
  pdf.text('Son:', margin, y);
  pdf.setFont('helvetica', 'bold');
  setText(pdf, COLOR.ink900);
  const sonText = moneyToSonText(totals.total, quoteCurrency);
  const sonLines = pdf.splitTextToSize(sonText, contentWidth - 32);
  pdf.text(sonLines, margin + 32, y);
  y += sonLines.length * 12 + 12;

  // ─── 9) PAGOS RECURRENTES (si aplica) ────────────────────────────────
  if (recurring.length > 0) {
    const recPad = 14;
    const headerH = 14 + 14 + 8;
    const rowH = 30;
    const recBoxH = recPad * 2 + headerH + recurring.length * rowH;

    ensureSpace(recBoxH + 14);

    setFill(pdf, COLOR.ink50);
    pdf.roundedRect(margin, y, contentWidth, recBoxH, 8, 8, 'F');
    setFill(pdf, COLOR.amber600);
    pdf.rect(margin, y, 3, recBoxH, 'F');

    let ry = y + recPad + 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    setText(pdf, COLOR.ink900);
    pdf.text('Pagos recurrentes', margin + recPad, ry);
    ry += 14;

    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    setText(pdf, COLOR.ink500);
    const headerText = getRecurringHeaderText(recurring);
    const headerLines = pdf.splitTextToSize(headerText, contentWidth - recPad * 2);
    for (const hl of headerLines) { pdf.text(hl, margin + recPad, ry); ry += 10.5; }
    ry += 6;

    for (let i = 0; i < recurring.length; i++) {
      const r = recurring[i];
      const period = r.cycle === 'annual' ? 'año' : 'mes';

      if (i > 0) {
        setDraw(pdf, COLOR.ink200);
        pdf.setLineWidth(0.4);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.line(margin + recPad, ry - 13, pageWidth - margin - recPad, ry - 13);
        pdf.setLineDashPattern([], 0);
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      setText(pdf, COLOR.ink900);
      const nameLabel = r.qty > 1 ? `${r.label}  × ${r.qty}` : r.label;
      pdf.text(nameLabel, margin + recPad, ry);
      pdf.text(
        `${fmtMoney(r.renewal_amount, quoteCurrency)} / ${period}`,
        pageWidth - margin - recPad,
        ry,
        { align: 'right' },
      );
      ry += 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      setText(pdf, COLOR.ink500);
      pdf.text(`${r.product_name} · ${getRecurringRowSubtext(r)}`, margin + recPad, ry);
      if (hasTc) {
        pdf.text(
          `${fmtOther(r.renewal_amount)} / ${period}`,
          pageWidth - margin - recPad,
          ry,
          { align: 'right' },
        );
      }
      ry += 18;
    }
    y += recBoxH + 16;
  }

  // ─── 10) 5 CHIPS DE CONDICIONES ──────────────────────────────────────
  ensureSpace(62);
  const chipsList: { label: string; v1: string; v2?: string }[] = [
    {
      label: 'Moneda',
      v1: quoteCurrency,
      v2: quoteCurrency === 'USD' ? 'Dólares Americanos' : 'Soles Peruanos',
    },
    { label: 'Forma de pago',    v1: quote.payment_terms || '—' },
    { label: 'Validez',          v1: `${quote.valid_days} días`, v2: 'Desde emisión' },
    { label: 'Entrega',          v1: `${quote.delivery_weeks} semanas`, v2: 'Hasta entrega final' },
  ];
  if (hasTc) {
    chipsList.push({ label: 'T.C. Referencial', v1: `S/ ${tc!.toFixed(4)}`, v2: '= 1 USD' });
  }
  const chipsCount = chipsList.length;
  const chipW2 = contentWidth / chipsCount;

  chipsList.forEach((c, i) => {
    const cx = margin + chipW2 * i;
    drawSpacedLabel(pdf, c.label, cx, y, COLOR.ink500, 7);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    setText(pdf, COLOR.ink900);
    const v1Lines = pdf.splitTextToSize(c.v1, chipW2 - 8);
    pdf.text(v1Lines.slice(0, 2), cx, y + 14);
    if (c.v2) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      setText(pdf, COLOR.ink500);
      pdf.text(c.v2, cx, y + 14 + v1Lines.length * 11);
    }
  });
  y += 48;

  setDraw(pdf, COLOR.ink200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

  // ─── 11) NOTAS Y CONDICIONES ─────────────────────────────────────────
  const termsRaw = (quote.terms && quote.terms.trim())
    || (orgSettings?.default_terms && orgSettings.default_terms.trim())
    || '';
  if (termsRaw) {
    const terms = termsRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      ensureSpace(30);
      drawSpacedLabel(pdf, 'NOTAS Y CONDICIONES', margin, y, COLOR.teal900, 8.5);
      y += 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      setText(pdf, COLOR.ink700);
      for (let i = 0; i < terms.length; i++) {
        const note = terms[i];
        const prefix = `${i + 1}.`;
        const lines = pdf.splitTextToSize(note, contentWidth - 20);
        ensureSpace(lines.length * 12 + 2);
        pdf.text(prefix, margin, y);
        pdf.text(lines, margin + 18, y);
        y += lines.length * 12 + 2;
      }
      y += 10;
    }
  }

  // ─── 12) APROBACIÓN DE COTIZACIÓN (doble firma) ──────────────────────
  ensureSpace(110);
  drawSpacedLabel(pdf, 'APROBACIÓN DE COTIZACIÓN', margin, y, COLOR.teal900, 8.5);
  y += 14;

  const sigColW = contentWidth / 2 - 10;
  const sigBoxH = 82;

  setFill(pdf, COLOR.ink50);
  pdf.roundedRect(margin, y, sigColW, sigBoxH, 6, 6, 'F');
  pdf.roundedRect(margin + sigColW + 20, y, sigColW, sigBoxH, 6, 6, 'F');

  const sigLineY = y + sigBoxH - 48;
  setDraw(pdf, COLOR.ink700);
  pdf.setLineWidth(0.6);
  pdf.line(margin + 14, sigLineY, margin + sigColW - 14, sigLineY);
  pdf.line(margin + sigColW + 20 + 14, sigLineY, margin + sigColW + 20 + sigColW - 14, sigLineY);

  // Emisor (vendedor)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  setText(pdf, COLOR.ink900);
  pdf.text(quote.vendor?.name || '—', margin + 14, sigLineY + 14);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  setText(pdf, COLOR.ink500);
  const vendorRole = quote.vendor?.role
    ? (formalRoleLabel[quote.vendor.role as keyof typeof formalRoleLabel] || 'Ejecutivo Comercial')
    : 'Ejecutivo Comercial';
  const emisorOrg = orgSettings?.name || 'NEXOVA';
  pdf.text(`${vendorRole} · ${emisorOrg}`, margin + 14, sigLineY + 26);
  if (quote.vendor?.email) {
    setText(pdf, COLOR.teal700);
    pdf.text(quote.vendor.email, margin + 14, sigLineY + 38);
  }

  // Cliente
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  setText(pdf, COLOR.ink900);
  pdf.text(quote.client?.contact || '—', margin + sigColW + 20 + 14, sigLineY + 14);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  setText(pdf, COLOR.ink500);
  const clientRoleLine = quote.client?.contact_role
    ? `${quote.client.contact_role} · ${quote.client.company}`
    : (quote.client?.company || '—');
  pdf.text(clientRoleLine, margin + sigColW + 20 + 14, sigLineY + 26);
  pdf.text('Fecha de aceptación: ___/___/______', margin + sigColW + 20 + 14, sigLineY + 40);

  y += sigBoxH + 10;

  // ─── 13) FOOTER en todas las páginas ─────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  const brandLine = [
    orgSettings?.name || 'NEXOVA',
    orgSettings?.website,
    orgSettings?.phone,
  ].filter(Boolean).join(' · ');

  for (let pg = 1; pg <= totalPages; pg++) {
    pdf.setPage(pg);
    setDraw(pdf, COLOR.ink200);
    pdf.setLineWidth(0.4);
    pdf.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    setText(pdf, COLOR.ink400);
    pdf.text(brandLine, margin, pageHeight - 15);
    pdf.text(
      `Cotización ${quote.code} · Página ${pg} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 15,
      { align: 'right' },
    );
  }

  return pdf;
}

/**
 * Genera el PDF y dispara la descarga con nombre de archivo predecible.
 * Formato: Cotizacion-{code}-{Empresa_Sanitizada}.pdf
 */
export function downloadQuotePdf(
  quote: Quote,
  products: Product[],
  orgSettings: OrganizationSettings | null,
): void {
  const pdf = generateQuotePdf(quote, products, orgSettings);
  const company = (quote.client?.company || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const filename = `Cotizacion-${quote.code}-${company}.pdf`;
  pdf.save(filename);
}

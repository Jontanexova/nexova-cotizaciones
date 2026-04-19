/**
 * Genera el PDF formal de una cotización para descargar y compartir con el cliente.
 *
 * Usa jsPDF con API de dibujo programática (sin html2canvas) para:
 *  - Mantener tamaño del archivo controlado.
 *  - Evitar problemas con emojis / caracteres especiales.
 *  - Obtener consistencia pixel-perfect entre navegadores.
 *
 * El diseño replica la vista PublicLink.tsx que ve el cliente online:
 *  - Header teal con código y datos de la cotización.
 *  - Texto de propuesta en recuadro destacado.
 *  - Items con módulos y precios en soles + USD.
 *  - Bloque oscuro de totales con columnas S/ y USD.
 *  - Grid de condiciones (plazo / pago / tipo de cambio).
 *  - Contacto del vendor + footer con paginación.
 */
import { jsPDF } from 'jspdf';
import type { OrganizationSettings, Product, Quote } from './types';
import { computeQuoteTotals, fmtDate, fmtMoney, fmtUSD, getRecurringCharges, getRecurringHeaderText, getRecurringRowSubtext } from './utils';

// Paleta (RGB de las mismas CSS vars del panel)
const COLOR = {
  teal900: [19, 78, 74] as const,
  teal700: [15, 118, 110] as const,
  teal50: [236, 253, 245] as const,
  teal300: [94, 234, 212] as const,
  ink900: [15, 23, 42] as const,
  ink700: [51, 65, 85] as const,
  ink500: [100, 116, 139] as const,
  ink400: [148, 163, 184] as const,
  ink300: [203, 213, 225] as const,
  ink200: [226, 232, 240] as const,
  ink100: [241, 245, 249] as const,
  ink50: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  dark600: [71, 85, 105] as const,
  separator: [51, 65, 85] as const,
};

function setFill(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setText(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(pdf: jsPDF, rgb: readonly [number, number, number]) {
  pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

export function generateQuotePdf(
  quote: Quote,
  products: Product[],
  orgSettings: OrganizationSettings | null,
): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth(); // 595
  const pageHeight = pdf.internal.pageSize.getHeight(); // 842
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const totals = computeQuoteTotals(quote.items || [], products, quote.discount);
  const tc = orgSettings?.exchange_rate ? Number(orgSettings.exchange_rate) : null;
  const hasTc = !!(tc && tc > 0);

  let y = 0;

  const ensureSpace = (need: number) => {
    if (y + need > pageHeight - 50) {
      pdf.addPage();
      y = margin;
    }
  };

  // ═══ Header teal ═══
  const headerHeight = 112;
  setFill(pdf, COLOR.teal900);
  pdf.rect(0, 0, pageWidth, headerHeight, 'F');

  // Logo brand texto
  setText(pdf, COLOR.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('NEXOVA', margin, 30);

  // Código a la derecha
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  setText(pdf, [210, 240, 232]);
  pdf.text('COTIZACIÓN', pageWidth - margin, 24, { align: 'right' });
  pdf.setFontSize(15);
  setText(pdf, COLOR.white);
  pdf.text(quote.code, pageWidth - margin, 42, { align: 'right' });

  // Título propuesta (wrap si es largo)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  setText(pdf, COLOR.white);
  const titleText = `Propuesta comercial para ${quote.client?.company || 'Cliente'}`;
  const titleLines = pdf.splitTextToSize(titleText, contentWidth - 70);
  pdf.text(titleLines, margin, 70);

  // Fechas
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  setText(pdf, [225, 240, 235]);
  const fechaLinea = `Emitida el ${fmtDate(quote.created_at)}  ·  Válida hasta ${fmtDate(quote.valid_until)}`;
  pdf.text(fechaLinea, margin, headerHeight - 15);

  y = headerHeight + 22;

  // ═══ Texto de propuesta (si existe) ═══
  if (quote.proposal_text && quote.proposal_text.trim()) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const boxPadding = 14;
    const txtLines = pdf.splitTextToSize(
      quote.proposal_text.trim(),
      contentWidth - boxPadding * 2,
    );
    const boxHeight = txtLines.length * 12.5 + boxPadding * 2;
    ensureSpace(boxHeight + 12);
    setFill(pdf, COLOR.teal50);
    pdf.rect(margin, y, contentWidth, boxHeight, 'F');
    // Borde izquierdo teal destacado
    setFill(pdf, COLOR.teal700);
    pdf.rect(margin, y, 3, boxHeight, 'F');
    setText(pdf, [15, 44, 50]);
    pdf.text(txtLines, margin + boxPadding, y + boxPadding + 9);
    y += boxHeight + 20;
  }

  // ═══ Inversión detallada (header) ═══
  ensureSpace(30);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  setText(pdf, COLOR.ink900);
  pdf.text('Inversión detallada', margin, y);
  y += 16;

  setDraw(pdf, COLOR.ink200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 14;

  // ═══ Items ═══
  for (const it of quote.items || []) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;

    // Calcular precio total del item (base + módulos) × qty
    let line = Number(p.base_price || 0);
    for (const sm of it.modules || []) {
      const m = p.modules?.find((x) => x.id === sm.module_id);
      if (m) line += Number(m.price || 0);
    }
    line *= it.qty;

    // v2.18: primer período recurrente
    const recurringLines: { label: string; amount: number }[] = [];
    if (p.requires_recurring) {
      for (const sm of it.modules || []) {
        const pm = p.modules?.find((x) => x.id === sm.module_id);
        if (pm && Number(pm.recurring_monthly_price || 0) > 0 && sm.recurring_billing_cycle) {
          const monthly = Number(pm.recurring_monthly_price);
          const amt = (sm.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly) * it.qty;
          line += amt;
          recurringLines.push({
            label: `${pm.name} · ${sm.recurring_billing_cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes'}`,
            amount: amt,
          });
        }
      }
      const anyMod = (it.modules || []).some((sm) => {
        const pm = p.modules?.find((x) => x.id === sm.module_id);
        return pm && Number(pm.recurring_monthly_price || 0) > 0;
      });
      if (!anyMod && Number(p.recurring_monthly_price || 0) > 0 && it.recurring_billing_cycle) {
        const monthly = Number(p.recurring_monthly_price);
        const amt = (it.recurring_billing_cycle === 'annual' ? monthly * 12 : monthly) * it.qty;
        line += amt;
        recurringLines.push({
          label: `Renovación · ${it.recurring_billing_cycle === 'annual' ? 'primer año (12 meses)' : 'primer mes'}`,
          amount: amt,
        });
      }
    }

    // Preparar contenido para estimar altura y auto-paginar
    const rightColWidth = 120;
    const descLines = p.description
      ? pdf.splitTextToSize(p.description, contentWidth - rightColWidth)
      : [];
    const modules = (it.modules || [])
      .map((sm) => p.modules?.find((x) => x.id === sm.module_id))
      .filter((m): m is NonNullable<typeof m> => !!m);

    const itemHeight =
      16 +
      Math.max(descLines.length * 11.5, hasTc ? 12 : 0) +
      modules.length * 12.5 +
      recurringLines.length * 12.5 +
      14;

    ensureSpace(itemHeight);

    // Nombre producto + precio soles (mismo baseline)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    setText(pdf, COLOR.ink900);
    pdf.text(p.name, margin, y);
    pdf.text(fmtMoney(line), pageWidth - margin, y, { align: 'right' });
    y += 13;

    // Descripción a la izquierda y USD a la derecha (en la misma franja)
    if (descLines.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      setText(pdf, COLOR.ink500);
      pdf.text(descLines, margin, y);
      if (hasTc) {
        pdf.text(fmtUSD(line, tc!), pageWidth - margin, y, { align: 'right' });
      }
      y += descLines.length * 11.5;
    } else if (hasTc) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      setText(pdf, COLOR.ink500);
      pdf.text(fmtUSD(line, tc!), pageWidth - margin, y, { align: 'right' });
      y += 11.5;
    }

    // Módulos como bullets
    if (modules.length > 0) {
      y += 4;
      for (const m of modules) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        setText(pdf, COLOR.ink700);
        pdf.text('•', margin + 8, y);
        pdf.text(m.name, margin + 18, y);
        setText(pdf, COLOR.ink400);
        const nameWidth = pdf.getTextWidth(m.name);
        pdf.text(`+${fmtMoney(m.price)}`, margin + 18 + nameWidth + 6, y);
        y += 12.5;
      }
    }

    // v2.18: líneas de primer período recurrente
    if (recurringLines.length > 0) {
      if (modules.length === 0) y += 4;
      for (const rl of recurringLines) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        setText(pdf, COLOR.ink500);
        pdf.text('•', margin + 8, y);
        pdf.text(rl.label, margin + 18, y);
        setText(pdf, COLOR.ink400);
        const lblWidth = pdf.getTextWidth(rl.label);
        pdf.text(`+${fmtMoney(rl.amount)}`, margin + 18 + lblWidth + 6, y);
        y += 12.5;
      }
    }

    y += 8;
    // Separador sutil entre items
    setDraw(pdf, COLOR.ink100);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 12;
  }

  // ═══ Bloque de totales (fondo oscuro) ═══
  // Estructura: [headers S/ USD] + [Subtotal] + [Descuento?] + [IGV] + [separador] + [Total grande]
  const boxPad = 18;
  const headerRowH = hasTc ? 16 : 0;
  const rowH = 18;
  const numRows = 1 + (quote.discount > 0 ? 1 : 0) + 1; // subtotal + descuento? + igv
  const totalBlockH = 60; // espacio para Total grande + Referencial
  const boxHeight = boxPad * 2 + headerRowH + numRows * rowH + 14 + totalBlockH;

  y += 6;
  ensureSpace(boxHeight + 14);

  setFill(pdf, COLOR.ink900);
  pdf.roundedRect(margin, y, contentWidth, boxHeight, 10, 10, 'F');

  let ty = y + boxPad;
  const labelX = margin + boxPad;
  // Las dos columnas numéricas las posicionamos alineadas a la derecha
  const usdColX = pageWidth - margin - boxPad;
  const solesColX = hasTc ? usdColX - 96 : usdColX;

  // Headers de columna (S/ y USD)
  if (hasTc) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    setText(pdf, COLOR.ink400);
    pdf.text('S/', solesColX, ty, { align: 'right' });
    pdf.text('USD', usdColX, ty, { align: 'right' });
    ty += headerRowH;
  }

  const drawRow = (
    label: string,
    solesVal: number,
    prefix: string,
    labelColor: readonly [number, number, number],
    valueColor: readonly [number, number, number],
  ) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setText(pdf, labelColor);
    pdf.text(label, labelX, ty);
    setText(pdf, valueColor);
    pdf.text(`${prefix}${fmtMoney(solesVal)}`, solesColX, ty, { align: 'right' });
    if (hasTc) {
      pdf.text(`${prefix}${fmtUSD(solesVal, tc!)}`, usdColX, ty, { align: 'right' });
    }
    ty += rowH;
  };

  drawRow('Subtotal', totals.subtotal, '', COLOR.ink300, COLOR.white);
  if (quote.discount > 0) {
    drawRow(
      `Descuento (${quote.discount}%)`,
      totals.discountAmt,
      '- ',
      COLOR.teal300,
      COLOR.teal300,
    );
  }
  drawRow('IGV (18%)', totals.igv, '', COLOR.ink300, COLOR.ink300);

  // Separador antes del Total
  setDraw(pdf, COLOR.separator);
  pdf.setLineWidth(0.6);
  pdf.line(labelX, ty + 2, usdColX, ty + 2);
  ty += 16;

  // Total label
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  setText(pdf, COLOR.ink300);
  pdf.text('Total', labelX, ty + 10);

  // Total valor soles (grande)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  setText(pdf, COLOR.white);
  pdf.text(fmtMoney(totals.total), usdColX, ty + 10, { align: 'right' });

  // Subtexto "Referencial en dólares - $ XXX"
  if (hasTc) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    setText(pdf, COLOR.ink400);
    pdf.text(
      `Referencial en dólares - ${fmtUSD(totals.total, tc!)}`,
      usdColX,
      ty + 26,
      { align: 'right' },
    );
  }

  y += boxHeight + 20;

  // ═══ Pagos recurrentes (si algún producto tiene recurring_* configurado) ═══
  const recurring = getRecurringCharges(quote.items || [], products);
  if (recurring.length > 0) {
    const recPad = 14;
    const headerLinesH = 14 + 14 + 10; // título + nota + gap antes de filas
    const rowH = 30; // altura uniforme por fila
    const recBoxH = recPad * 2 + headerLinesH + recurring.length * rowH;

    ensureSpace(recBoxH + 14);

    setFill(pdf, COLOR.ink50);
    pdf.roundedRect(margin, y, contentWidth, recBoxH, 8, 8, 'F');
    // Borde izquierdo ámbar para diferenciarlo de los boxes teal
    setFill(pdf, [245, 158, 11]);
    pdf.rect(margin, y, 3, recBoxH, 'F');

    let ry = y + recPad + 10; // baseline del primer texto
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
    for (const hl of headerLines) {
      pdf.text(hl, margin + recPad, ry);
      ry += 10.5;
    }
    ry += 8;

    for (let i = 0; i < recurring.length; i++) {
      const r = recurring[i];
      const periodLabel = r.cycle === 'annual' ? 'año' : 'mes';

      if (i > 0) {
        setFill(pdf, COLOR.ink400);
        pdf.rect(margin + recPad, ry - 13, contentWidth - recPad * 2, 1.5, 'F');
      }

      // Línea 1: label (bold) · precio renovación (bold)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      setText(pdf, COLOR.ink900);
      const nameLabel = r.qty > 1 ? `${r.label}  × ${r.qty}` : r.label;
      pdf.text(nameLabel, margin + recPad, ry);
      pdf.text(
        `${fmtMoney(r.renewal_amount)} / ${periodLabel}`,
        pageWidth - margin - recPad,
        ry,
        { align: 'right' },
      );
      ry += 12;

      // Línea 2: producto · subtexto (muted) · precio USD (muted)
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      setText(pdf, COLOR.ink500);
      const subtext = `${r.product_name} · ${getRecurringRowSubtext(r)}`;
      pdf.text(subtext, margin + recPad, ry);
      if (hasTc) {
        pdf.text(
          `${fmtUSD(r.renewal_amount, tc!)} / ${periodLabel}`,
          pageWidth - margin - recPad,
          ry,
          { align: 'right' },
        );
      }
      ry += 18;
    }

    y += recBoxH + 18;
  }

  // ═══ Grid de 3 (o 2) campos ═══
  ensureSpace(50);
  const cols = hasTc ? 3 : 2;
  const cellW = contentWidth / cols;

  const drawCell = (i: number, title: string, value: string) => {
    const cellX = margin + cellW * i;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    setText(pdf, COLOR.ink400);
    pdf.text(title.toUpperCase(), cellX, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    setText(pdf, COLOR.ink900);
    const valueLines = pdf.splitTextToSize(value, cellW - 8);
    pdf.text(valueLines, cellX, y + 15);
  };

  drawCell(0, 'Tiempo de implementación', `${quote.delivery_weeks} semanas`);
  drawCell(1, 'Condiciones de pago', quote.payment_terms || '—');
  if (hasTc) {
    drawCell(2, 'Tipo de cambio referencial', `S/ ${tc!.toFixed(4)} = 1 USD`);
  }
  y += 44;

  // ═══ Contacto del vendor ═══
  if (quote.vendor) {
    ensureSpace(50);
    setFill(pdf, COLOR.ink50);
    pdf.roundedRect(margin, y, contentWidth, 40, 8, 8, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    setText(pdf, COLOR.dark600);
    pdf.text(
      `¿Preguntas? Contacta con ${quote.vendor.name}  ·  ${quote.vendor.email}`,
      pageWidth / 2,
      y + 25,
      { align: 'center' },
    );
    y += 50;
  }

  // ═══ Footer en todas las páginas ═══
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    setText(pdf, COLOR.ink400);
    const brandName = orgSettings?.name || 'Nexova';
    const footerLeft = `${brandName} · ${quote.code}  ·  Generado ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    pdf.text(footerLeft, margin, pageHeight - 20);
    pdf.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 20, {
      align: 'right',
    });
  }

  return pdf;
}

/**
 * Genera el PDF y dispara la descarga con un nombre de archivo predecible.
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
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-zA-Z0-9]+/g, '_') // reemplazar no-alfanum por _
    .replace(/^_+|_+$/g, '') // trim underscores
    .slice(0, 40);
  const filename = `Cotizacion-${quote.code}-${company}.pdf`;
  pdf.save(filename);
}

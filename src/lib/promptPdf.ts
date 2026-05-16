/**
 * Genera un prompt estructurado a partir de una cotización para que Claude
 * arme el proyecto correspondiente siguiendo best practices de desarrollo.
 *
 * El prompt incluye:
 * - Instrucciones de rol (senior full-stack developer)
 * - Best practices mandatorios
 * - Requerimientos originales del cliente
 * - Productos y módulos cotizados
 * - Criterios de entrega y aceptación
 */
import { jsPDF } from 'jspdf';
import type { Product, Quote, Vendor } from './types';
import { computeQuoteTotals, fmtMoney } from './utils';

export function buildClaudePrompt(quote: Quote, products: Product[]): string {
  const productos = (quote.items || [])
    .map((it, i) => {
      const product = products.find((p) => p.id === it.product_id);
      const productName = product?.name || 'Producto';
      const modules = (it.modules || [])
        .map((sm) => product?.modules?.find((m) => m.id === sm.module_id))
        .filter((m): m is NonNullable<typeof m> => !!m);
      const mods =
        modules.length > 0
          ? '\n      Módulos:\n' + modules.map((m) => `        - ${m.name}`).join('\n')
          : '';
      return `  ${i + 1}. ${productName} (cantidad: ${it.qty})${mods}`;
    })
    .join('\n');

  const qCurrency = quote.currency || 'PEN';
  const totals = computeQuoteTotals(
    quote.items || [],
    products,
    quote.discount,
    qCurrency,
    quote.exchange_rate,
  );
  const cliente = quote.client;
  const requirements =
    (quote.requirements || '').trim() ||
    '(El cliente no proporcionó requerimientos específicos. Interpreta desde los productos/módulos de la cotización.)';

  return `# PROMPT PARA CLAUDE — Proyecto: ${cliente?.company || 'Cliente'}

## Tu rol
Actúa como un **Senior Full-Stack Developer** con +10 años de experiencia, especializado en arquitecturas modernas (React/Next.js, TypeScript, Node.js, PostgreSQL, Supabase). Tu código debe cumplir con los **mejores estándares de la industria** de desarrollo web y software.

## Best practices obligatorias
Debes aplicar **sin excepción** todas las siguientes prácticas:

### Código
- **TypeScript estricto** (\`strict: true\`): sin \`any\`, tipos explícitos en interfaces públicas.
- **Separación de responsabilidades**: componentes de UI no contienen lógica de negocio; hooks para estado; servicios para I/O.
- **Nombres expresivos**: variables, funciones y archivos revelan intención (evita abreviaciones).
- **DRY con criterio**: extrae a helper solo cuando hay duplicación real (regla de tres).
- **Funciones pequeñas y puras** cuando sea posible; side-effects aislados.
- **Manejo de errores explícito**: nunca tragar excepciones (\`catch\` vacíos). Mostrar feedback al usuario.
- **Comentarios solo para explicar el "porqué"**, nunca el "qué" (el código debe auto-documentarse).

### UX/UI
- **Mobile-first** y accesible (WCAG AA: contraste, foco visible, labels en inputs, roles ARIA donde aplique).
- **Loading states** en toda operación async; skeletons antes que spinners cuando se conoce el layout.
- **Optimistic updates** donde el UX lo justifique.
- **Toasts** para feedback no-bloqueante; modales solo para acciones destructivas o confirmaciones críticas.
- **Keyboard navigation** funcional (Tab, Enter, Esc).

### Arquitectura
- **Separación claras**: \`/components\`, \`/hooks\`, \`/lib\`, \`/pages\`, \`/contexts\`, \`/types\`.
- **Row Level Security (RLS)** en todas las tablas si usas Supabase/Postgres.
- **Nunca expongas secretos** en el cliente; usa Edge Functions o API routes para lógica sensible.
- **Validación** en frontend (UX) Y backend (seguridad).
- **Migraciones SQL versionadas** para cambios de esquema.

### Performance
- **Code splitting** por ruta.
- **Memoización** con \`useMemo\`/\`useCallback\` solo cuando hay evidencia de re-render costoso.
- **Queries eficientes**: selecciona columnas específicas, usa índices, evita N+1.

## Datos del proyecto

**Cliente:** ${cliente?.company || 'N/A'}
**Industria:** ${cliente?.industry || 'N/A'}
**Tamaño de empresa:** ${cliente?.size || 'N/A'}
**Contacto:** ${cliente?.contact || 'N/A'}${cliente?.email ? ` (${cliente.email})` : ''}

**Cotización asociada:** ${quote.code}
**Plazo de entrega estimado:** ${quote.delivery_weeks} semanas
**Inversión total:** ${fmtMoney(totals.total, qCurrency)} (${fmtMoney(totals.subtotal, qCurrency)} subtotal${quote.discount > 0 ? `, ${quote.discount}% descuento aplicado` : ''})

## Requerimientos del cliente (input literal)

${requirements}

## Productos y módulos cotizados

${productos || '  (Sin items cotizados)'}

## Qué necesito que hagas

1. **Analiza** los requerimientos y los productos cotizados, e infiere la arquitectura técnica óptima.
2. **Propón** un stack tecnológico justificando cada elección (frontend, backend, base de datos, auth, hosting).
3. **Define** el modelo de datos: entidades, relaciones, campos y constraints. Incluye migraciones SQL.
4. **Diseña** la estructura del proyecto: árbol de carpetas, convenciones de naming.
5. **Implementa** por fases: MVP funcional primero, luego features secundarios. Define los hitos.
6. **Genera** el código de la primera fase completo y funcional, aplicando todas las best practices mencionadas.
7. **Documenta** cómo correr el proyecto localmente y cómo deployarlo.

Antes de generar código, **muéstrame tu plan** en un resumen ejecutivo. Espera mi confirmación o ajustes antes de proceder. Sé proactivo: si detectas requerimientos ambiguos, pregunta. Si detectas gaps técnicos, proponlos.

**No escatimes calidad. Código production-ready desde el día uno.**

---
_Prompt generado desde Nexova · Panel comercial · cotización ${quote.code}_
`;
}

/**
 * Genera un PDF con el prompt construido usando jsPDF API de dibujo
 * programático (sin html2canvas), para evitar problemas de emoji y
 * mantener el tamaño del PDF controlado.
 *
 * Devuelve el PDF como base64 listo para attach en email.
 */
export function generatePromptPdf(quote: Quote, vendor: Vendor, products: Product[]): string {
  const prompt = buildClaudePrompt(quote, products);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header banda teal
  pdf.setFillColor(15, 118, 110); // var(--teal-700)
  pdf.rect(0, 0, pageWidth, 70, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('NEXOVA', margin, 30);
  pdf.setFontSize(16);
  pdf.text('Prompt para Claude', margin, 52);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Cotización ${quote.code}`, pageWidth - margin, 30, { align: 'right' });
  pdf.text(quote.client?.company || '', pageWidth - margin, 45, { align: 'right' });
  pdf.text(
    `Generado por ${vendor.name} · ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageWidth - margin, 60, { align: 'right' }
  );

  y = 100;
  pdf.setTextColor(15, 23, 42);

  // Intro
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9.5);
  pdf.setTextColor(100, 116, 139);
  const intro =
    'Este documento contiene un prompt estructurado para pegar en Claude y que te ayude a construir el proyecto descrito en la cotización. Incluye contexto del cliente, requerimientos y best practices mandatorias.';
  const introLines = pdf.splitTextToSize(intro, contentWidth);
  pdf.text(introLines, margin, y);
  y += introLines.length * 12 + 16;

  // Cuerpo del prompt con parser simple de Markdown
  pdf.setTextColor(15, 23, 42);
  const lines = prompt.split('\n');
  const lineHeight = 12;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');

    // Línea vacía → espacio
    if (line.trim() === '') {
      y += 6;
      continue;
    }

    // ### Heading 3
    if (line.startsWith('### ')) {
      ensureSpace(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(15, 118, 110);
      pdf.text(line.slice(4), margin, y);
      y += lineHeight + 4;
      pdf.setTextColor(15, 23, 42);
      continue;
    }

    // ## Heading 2
    if (line.startsWith('## ')) {
      ensureSpace(28);
      y += 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(15, 23, 42);
      pdf.text(line.slice(3), margin, y);
      // Subrayado sutil
      pdf.setDrawColor(15, 118, 110);
      pdf.setLineWidth(1.2);
      pdf.line(margin, y + 3, margin + 40, y + 3);
      y += lineHeight + 8;
      continue;
    }

    // # Heading 1
    if (line.startsWith('# ')) {
      ensureSpace(32);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(15, 23, 42);
      const headingLines = pdf.splitTextToSize(line.slice(2), contentWidth);
      pdf.text(headingLines, margin, y);
      y += headingLines.length * 18 + 6;
      continue;
    }

    // Separador horizontal ---
    if (line.trim() === '---') {
      ensureSpace(16);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 12;
      continue;
    }

    // Italic hint al final (_..._)
    if (line.trim().startsWith('_') && line.trim().endsWith('_')) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      const t = line.trim().replace(/^_|_$/g, '');
      const wrapped = pdf.splitTextToSize(t, contentWidth);
      ensureSpace(wrapped.length * lineHeight);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * lineHeight;
      pdf.setTextColor(15, 23, 42);
      continue;
    }

    // Bullet (- o *)
    if (/^\s*[-*]\s/.test(line)) {
      const indent = (line.match(/^(\s*)/)?.[1].length || 0) * 2;
      const txt = line.replace(/^\s*[-*]\s/, '');
      const parsed = renderInlineBold(txt);
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      const wrapped = pdf.splitTextToSize(parsed.plain, contentWidth - 16 - indent);
      ensureSpace(wrapped.length * lineHeight + 2);
      // Bullet punto
      pdf.setFont('helvetica', 'normal');
      pdf.text('•', margin + indent, y);
      // Texto — para bold usamos fallback simple: si hay bold, renderizamos el primer tramo bold, el resto normal
      if (parsed.hasBold) {
        renderWithBold(pdf, wrapped[0], margin + 12 + indent, y, parsed);
      } else {
        pdf.text(wrapped[0], margin + 12 + indent, y);
      }
      for (let i = 1; i < wrapped.length; i++) {
        y += lineHeight;
        ensureSpace(lineHeight);
        pdf.text(wrapped[i], margin + 12 + indent, y);
      }
      y += lineHeight + 1;
      continue;
    }

    // Numbered list (1. )
    if (/^\s*\d+\.\s/.test(line)) {
      const m = line.match(/^(\s*)(\d+)\.\s(.*)$/);
      if (m) {
        const indent = m[1].length * 2;
        const num = m[2];
        const parsed = renderInlineBold(m[3]);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        const wrapped = pdf.splitTextToSize(parsed.plain, contentWidth - 20 - indent);
        ensureSpace(wrapped.length * lineHeight + 2);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${num}.`, margin + indent, y);
        pdf.setFont('helvetica', 'normal');
        if (parsed.hasBold) {
          renderWithBold(pdf, wrapped[0], margin + 16 + indent, y, parsed);
        } else {
          pdf.text(wrapped[0], margin + 16 + indent, y);
        }
        for (let i = 1; i < wrapped.length; i++) {
          y += lineHeight;
          ensureSpace(lineHeight);
          pdf.text(wrapped[i], margin + 16 + indent, y);
        }
        y += lineHeight + 1;
        continue;
      }
    }

    // Párrafo normal
    const parsed = renderInlineBold(line);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    const wrapped = pdf.splitTextToSize(parsed.plain, contentWidth);
    ensureSpace(wrapped.length * lineHeight + 2);
    if (parsed.hasBold && wrapped.length === 1) {
      renderWithBold(pdf, wrapped[0], margin, y, parsed);
      y += lineHeight;
    } else {
      for (const w of wrapped) {
        ensureSpace(lineHeight);
        pdf.text(w, margin, y);
        y += lineHeight;
      }
    }
    y += 2;
  }

  // Footer en última página
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Nexova · ${quote.code}`, margin, pageHeight - 16);
    pdf.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
  }

  // Base64
  const base64 = pdf.output('datauristring').split(',')[1] || pdf.output('datauristring');
  return base64;
}

// ─── Helpers para renderizar **bold** inline en jsPDF ───
interface ParsedInline {
  plain: string;
  hasBold: boolean;
  boldRanges: { start: number; end: number }[];
}
function renderInlineBold(raw: string): ParsedInline {
  const boldRanges: { start: number; end: number }[] = [];
  let plain = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '*' && raw[i + 1] === '*') {
      const end = raw.indexOf('**', i + 2);
      if (end === -1) {
        plain += raw.slice(i);
        break;
      }
      const startPlain = plain.length;
      plain += raw.slice(i + 2, end);
      boldRanges.push({ start: startPlain, end: plain.length });
      i = end + 2;
    } else {
      plain += raw[i];
      i++;
    }
  }
  return { plain, hasBold: boldRanges.length > 0, boldRanges };
}
function renderWithBold(pdf: jsPDF, text: string, x: number, y: number, parsed: ParsedInline) {
  if (!parsed.hasBold) {
    pdf.text(text, x, y);
    return;
  }
  let cursor = x;
  let pos = 0;
  pdf.setFont('helvetica', 'normal');
  for (const range of parsed.boldRanges) {
    if (pos < range.start) {
      const chunk = text.slice(pos, range.start);
      pdf.setFont('helvetica', 'normal');
      pdf.text(chunk, cursor, y);
      cursor += pdf.getTextWidth(chunk);
      pos = range.start;
    }
    const boldChunk = text.slice(range.start, Math.min(range.end, text.length));
    pdf.setFont('helvetica', 'bold');
    pdf.text(boldChunk, cursor, y);
    cursor += pdf.getTextWidth(boldChunk);
    pos = range.end;
  }
  if (pos < text.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.text(text.slice(pos), cursor, y);
  }
}

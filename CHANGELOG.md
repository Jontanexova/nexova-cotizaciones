# v2.25 — Formato proforma tributario + términos híbridos

Este patch transforma la cotización de "propuesta comercial editorial" (header
teal, prosa, cuadro oscuro de totales) a un formato tipo **proforma tributaria
peruana** con bloques Emisor/Cliente, tabla numerada, 5 chips de condiciones y
doble bloque de firmas. Tanto el PDF descargable (`quotePdf.ts`) como la vista
pública que ve el cliente (`PublicLink.tsx`) se mantienen **visualmente espejo**.

---

## Archivos modificados (9)

| Archivo | Tipo |
|---|---|
| `migrations/v2_25_proforma_format.sql`   | nuevo  |
| `src/lib/types.ts`                       | extender |
| `src/lib/utils.ts`                       | extender |
| `src/lib/db.ts`                          | extender |
| `src/lib/quotePdf.ts`                    | **reescritura completa** |
| `src/pages/PublicLink.tsx`               | **reescritura completa** |
| `src/pages/Wizard.tsx`                   | extender |
| `src/pages/SecondaryPages.tsx`           | extender (tab Organización) |
| `src/pages/QuotePreview.tsx`             | extender (+ modal notas) |

---

## Orden de despliegue

> ⚠️ **Crítico**: aplicar la migración SQL **antes** de desplegar el frontend.
> Si el frontend intenta leer/guardar los campos nuevos y la tabla aún no los
> tiene, Supabase va a tirar `42703 column does not exist` y romperás las
> cotizaciones en producción.

1. **Supabase SQL Editor** → correr `migrations/v2_25_proforma_format.sql`.
   Es idempotente (`IF NOT EXISTS`), puede correrse múltiples veces sin riesgo.
2. **Verificar** con la query de verificación comentada al final del archivo
   (descoméntala y córrela para confirmar que los 8 campos existen).
3. **Copiar** los 8 archivos de `src/` sobre tu working copy.
4. **Deploy** a Vercel (normal: `git push` → deploy automático).
5. **Post-deploy**: entrar a **Ajustes → Organización** como Super Admin y
   llenar el textarea **"Notas y condiciones por defecto"** (si lo dejas vacío
   las cotizaciones no mostrarán la sección Notas, solo la ocultan — no rompen).

---

## Campos nuevos en la base de datos

### `quotes` (+5 columnas)
| Columna | Tipo | Cómo se llena |
|---|---|---|
| `justification_text`   | `text` | IA en Step 3 del Wizard — narrativa 2 párrafos |
| `solution_summary`     | `text` | IA — chip "Solución" (~60 chars) |
| `scope_summary`        | `text` | IA — chip "Alcance" (~60 chars) |
| `modality_summary`     | `text` | IA — chip "Modalidad" (~60 chars) |
| `terms`                | `text` | Override por cotización desde QuotePreview. NULL = hereda default |

### `clients` (+2 columnas)
| Columna | Tipo | Cómo se llena |
|---|---|---|
| `contact_role`         | `text` | Nuevo input en Step 1 del Wizard (opcional) |
| `address`              | `text` | Nuevo input en Step 1 del Wizard (opcional) |

### `organization_settings` (+1 columna)
| Columna | Tipo | Cómo se llena |
|---|---|---|
| `default_terms`        | `text` | Textarea en **Ajustes → Organización** (solo Super Admin) |

---

## Comportamiento — casos especiales

### Cotizaciones antiguas (pre-v2.25)
No se rompen. El renderer tiene fallbacks:
- Si `justification_text` está NULL → usa `proposal_text`.
- Si los 3 `*_summary` están NULL → **oculta** la sección "Descripción del
  proyecto" completa (3 chips).
- Si `terms` está NULL y `default_terms` está NULL → **oculta** la sección
  "Notas y condiciones" completa.

### Override de términos congelado
Cuando el vendor guarda un override en QuotePreview, `quote.terms` se llena
con el texto custom. **Aunque después el Super Admin edite `default_terms`
globalmente, esta cotización mantiene su texto custom** — integridad
contractual. Para volver a heredar el default global el vendor debe usar el
botón **"Volver al default"** del modal, que setea `quote.terms = NULL`.

### Primer período recurrente de S/ 0.00
Ahora se **omite** de la tabla (antes aparecía como "Renovación · primer año
+S/ 0.00" que era feo). Solo se muestra el cargo completo en la sección
"Pagos recurrentes".

### Firma del Emisor
Usa el `vendor` que creó la cotización. El rol se mapea vía un nuevo helper
`formalRoleLabel` en `utils.ts`:
- `super_admin` → "Administrador General"
- `admin` → "Administrador"
- `seller` → "Ejecutivo Comercial"
- `external` → "Consultor Externo"

Distinto del `roleLabel` existente (que dice "Super Admin", "Vendedor externo")
— este es para documentos formales, el otro sigue siendo para la UI interna.

### "Son: MIL QUINIENTOS TRECE CON 35/100 SOLES"
Nueva función `moneyToSonText(amount)` en `utils.ts`. Redondea a 2 decimales
antes de partir entero/centavos (evita artefactos de float tipo 1513.349999).
Soporta hasta S/ 999.999.999 (suficiente para cotizaciones comerciales).

### IA de la justificación
**Sigue siendo rule-based** (keyword matching de `requirements`), igual que la
existente para `proposal_text`. Cuando decidas migrar a un LLM real (Anthropic
API), los 4 bloques de generación en `runAiAnalysis()` son los que hay que
reemplazar — están marcados con comentario `v2.25 — Generar campos para el
formato proforma`.

---

## Rollback plan

Si algo explota en producción:

1. **Frontend**: revertir el merge en GitHub + redeploy Vercel (1-2 min).
2. **DB**: los campos nuevos son **additive** — NO hace falta rollback de la
   migración, las columnas extra no estorban al código viejo porque Supabase
   ignora columnas desconocidas en los SELECTs. Si quieres limpiarlas igual:

   ```sql
   alter table public.quotes
     drop column if exists justification_text,
     drop column if exists solution_summary,
     drop column if exists scope_summary,
     drop column if exists modality_summary,
     drop column if exists terms;
   alter table public.clients
     drop column if exists contact_role,
     drop column if exists address;
   alter table public.organization_settings
     drop column if exists default_terms;
   ```

---

## Verificación post-deploy

Mini-checklist para validar que todo quedó bien:

- [ ] En Ajustes → Organización aparece el textarea de "Notas y condiciones por
      defecto" y permite guardar.
- [ ] Crear una cotización nueva desde el Wizard: los chips "Solución /
      Alcance / Modalidad" se llenan solos en el paso 3.
- [ ] En Step 1 del Wizard aparecen los nuevos campos "Cargo del contacto" y
      "Dirección" (opcionales).
- [ ] Publicar una cotización y abrir el link público → se ve el nuevo formato
      proforma con header rojo/teal, tabla numerada, 5 chips y firmas.
- [ ] Descargar el PDF desde el botón de QuotePreview → espejo visual del link
      público.
- [ ] En QuotePreview aparece el bloque "Notas y condiciones" con chip
      "Default global" y botón "Personalizar". Al guardar un override, el chip
      cambia a "Personalizadas" y el botón "Volver al default" se habilita.
- [ ] Cotización antigua (sin los campos IA nuevos) se sigue viendo bien —
      solo oculta la sección "Descripción del proyecto" y cae al
      `proposal_text` para la Justificación.

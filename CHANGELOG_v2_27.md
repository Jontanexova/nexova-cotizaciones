# Nexova Cotizaciones — v2.27

**Fecha**: Abril 2026
**Tema**: Análisis IA migrado de keyword-matching local a Claude Haiku 4.5

---

## Resumen ejecutivo

1. **Análisis de requerimientos con Claude Haiku 4.5** — el Step 3 del Wizard
   ahora manda el brief del cliente a una Edge Function (`analyze-requirements`)
   que usa Claude Haiku 4.5 para proponer productos, módulos, descuento,
   plazo de entrega y los 5 textos narrativos del PDF proforma (solución,
   alcance, modalidad, justificación, carta propuesta).
2. **Fallback automático a modo rule-based** — si la Edge Function falla
   por red, cuota, API key inválida, o si Claude devuelve 0 productos
   válidos del catálogo, el Wizard cae automáticamente al análisis
   keyword-based anterior sin romper el flujo. Se muestra un banner naranja
   "Análisis en modo básico" + badge "Modo básico" en lugar de
   "Claude Haiku 4.5".
3. **Banner de narrativas desactualizadas** — cuando el vendedor edita los
   items en Step 4 después del análisis IA, los textos narrativos quedan
   mencionando productos que ya no están. v2.27 detecta este drift
   (vía signature de items) y muestra un banner amarillo con botón
   **"Regenerar texto"** que vuelve a llamar a Claude pidiéndole sólo los
   textos para la selección actual, sin tocar los items.
4. **Fix bug de substring matching** — el análisis rule-based anterior
   usaba `requirements.toLowerCase().includes(kw)`, lo que provocaba que
   la keyword `'cita'` matcheara con **"solicita"** y dispara AgendaPro
   cada vez que el cliente escribía "Solicita una propuesta...". v2.27
   usa regex con word boundaries manuales sobre
   `[a-záéíóúñ]`, eliminando estos falsos positivos.
5. **Keywords más precisas en rule-based** — la lista del CRM perdió
   `'clientes'` (demasiado genérico, matcheaba casi cualquier
   requerimiento comercial) y ganó `'gestión de clientes'` como frase
   completa. AgendaPro agregó las variantes plurales `'citas'`,
   `'reservas'`, `'turnos'`.

---

## Arquitectura del nuevo flujo IA

```
Wizard Step 2 (onNext)
      │
      ▼
runAiAnalysis()          ──────►   analyze-requirements (Edge Function)
  ├─ éxito LLM                         │
  │    ├─ aiMode = 'llm'                 usa SUPABASE_SECRET
  │    ├─ badge "Claude Haiku 4.5"        ↓
  │    └─ aplica items + textos        api.anthropic.com
  │                                    (Claude Haiku 4.5)
  └─ fallo o 0 productos válidos
       │
       ▼
runRuleBasedAnalysis()  (PURA, sin efectos)
  ├─ aiMode = 'rules'
  ├─ aiError = mensaje friendly
  ├─ banner naranja "Modo básico"
  └─ keyword matching con word boundaries
```

El LLM decide de todo el catálogo que recibe; el rule-based sólo
reconoce el set de keywords hardcoded y cae a un fallback "web + hosting"
si nada matchea.

---

## Cambios

### Feat

- **`src/lib/db.ts`** — nueva función `analyzeRequirementsViaEdgeFunction`
  + types exportados `AiAnalysisInput` y `AiAnalysisResult`.
  Patrón idéntico a `validateRucViaEdgeFunction`: manejo friendly de
  errores desde `error.context.text()`, validaciones `data?.error` /
  `!data?.ok`. La API key de Anthropic vive server-side en
  `organization_settings.anthropic_api_key` y nunca sale al browser.
- **`src/pages/Wizard.tsx`** — nuevos estados `aiMode` (`'none' | 'llm'
  | 'rules'`), `aiError`, `analyzedSignature`, `regenerating`.
- **`src/pages/Wizard.tsx`** — `runAiAnalysis(opts?: {forceLocal?,
  regenerateOnly?})` ahora async, con fallback automático a rule-based
  y soporte para regeneración puntual de textos.
- **Step4Review** — banner naranja (LLM falló), banner amarillo con
  botón "Regenerar texto" (narrativas desactualizadas), badges
  "Claude Haiku 4.5" / "Modo básico" y botón link "Regenerar" en el
  header del panel ANÁLISIS IA.

### Fix

- **Bug A: substring matching** en rule-based. La keyword `'cita'`
  matcheaba con "solicita" via `r.includes('cita')`. Ahora se usa
  `new RegExp(`(^|[^a-záéíóúñ])${kw}([^a-záéíóúñ]|$)`, 'i')` para
  matcheo con word boundaries Unicode-aware.
- **Bug B: narrativas stale al editar items** — los 5 textos del PDF
  proforma (solution/scope/modality/justification/proposal) se llenaban
  una sola vez en Step 3 y quedaban referenciando productos que el
  vendedor pudo haber removido en Step 4. v2.27 detecta el drift
  comparando el `computeItemsSignature(items)` contra el
  `analyzedSignature` guardado, y ofrece regenerar.

### Infra (YA aplicado en producción, no tocar)

- **Migración `v2_27_add_anthropic_api_key`** — agrega columna
  `anthropic_api_key TEXT` a `organization_settings`. Ya aplicada.
- **API key Anthropic** — cargada en `organization_settings`
  (108 chars, formato `sk-ant-api03-…`).
- **Edge Function `analyze-requirements`** v1 ACTIVE en el proyecto
  `ukpoczrgndhkydpdrtvu`. `verify_jwt: false`, usa Claude Haiku 4.5,
  patrón idéntico a `validate-ruc` (lee el token desde
  `organization_settings` server-side).

---

## Deploy

### 1. Migración SQL — ✅ YA APLICADA EN PRODUCCIÓN

No tocar. La columna `organization_settings.anthropic_api_key` ya
existe con la key cargada.

### 2. Edge Function — ✅ YA DEPLOYADA

`analyze-requirements` v1 ACTIVE. No tocar.

### 3. Frontend — push a main (este paso)

```bash
git add -A
git commit -m "v2.27: migrar análisis IA a Claude Haiku 4.5"
git tag v2.27
git push origin main --tags
```

Vercel detecta el push a `main` y auto-deploya a producción.

---

## Smoke test post-deploy

1. Abrir una cotización nueva, ingresar requerimientos (ej. "El cliente
   solicita un sistema de gestión para controlar reservas de citas").
2. En Step 3 debería verse el spinner "Analizando requerimientos…".
3. En Step 4: badge teal **"Claude Haiku 4.5"** en el panel ANÁLISIS IA
   → confirma que el LLM respondió.
4. Remover un producto → aparece banner amarillo **"Los productos
   cambiaron"** con botón "Regenerar texto".
5. Clic en "Regenerar texto" → spinner en el botón, luego desaparece el
   banner, los 5 textos del Step 4 se actualizan con la selección actual.
6. (Opcional) En DevTools → Network, bloquear el request a
   `functions/v1/analyze-requirements` → repetir Step 2 → debería caer
   a modo básico: badge naranja **"Modo básico"** + banner naranja
   "Análisis en modo básico".

Si algo de lo anterior falla, revisar los logs de la Edge Function en
Supabase Dashboard → Edge Functions → `analyze-requirements` → Logs.

---

## Notas para el próximo release

- El chunk `index-*.js` pesa ~617 KB (167 KB gzipped). No es regresión
  de v2.27 — viene arrastrándose desde que se integró `jspdf` +
  `html2canvas` para la exportación PDF. Candidato claro a lazy-loading
  de `quotePdf` y `promptPdf` vía `import()` dinámico en una próxima
  versión.
- El rule-based fallback sigue siendo el mismo de v2.26 + word
  boundaries. Para una v2.28 tendría sentido simplificar o retirar
  parte del rule-based si las métricas de uso muestran que el LLM cubre
  >99% de los casos en producción.

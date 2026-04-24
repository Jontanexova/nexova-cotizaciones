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

## v2.27.1 — cache de analyze-requirements

**Fecha**: Abril 2026

### Qué cambia

Se agrega un cache en memoria (scope: tab del navegador) con TTL de 5 min
para `analyzeRequirementsViaEdgeFunction`. El patrón es idéntico al
`_rucCache` existente desde v2.26 — `Map<string, {at, data}>`, mismo TTL.

### Por qué

Evita llamados redundantes a Anthropic cuando:

- El vendedor vuelve a Step 2 y clica "Siguiente" sin modificar el brief.
- El vendedor clica "Regenerar texto" dos veces seguidas sin cambiar la
  selección de productos.
- En desarrollo / QA se repite el mismo caso de prueba.

Impacto esperado: ~20–40% menos tokens facturados a Anthropic en un día
típico de uso (estimado — depende de cuánto reabra Step 2 un vendedor).

### Implementación

- Nueva función privada `stableStringify(obj)` en `db.ts` — `JSON.stringify`
  con keys ordenadas recursivamente, para que dos inputs equivalentes den
  la misma cache key independientemente del orden de props.
- Cache key = `stableStringify(input)` donde `input` es el payload
  completo (`requirements`, `client`, `urgency`, `products`). Esto garantiza
  que cualquier cambio en el brief, tamaño de cliente, urgencia, o catálogo
  de productos dispare un recálculo real.
- Hits y misses se loguean a la consola del browser con `console.debug`
  para inspección rápida en DevTools:

  ```
  [analyzeRequirements] cache MISS, resultado cacheado
  [analyzeRequirements] cache HIT, edad: 42 s
  ```

### Edge cases

- **Producto agregado/removido en DB mientras la tab está abierta**: el
  catálogo cambia → cache key cambia → cache miss → recálculo automático.
  ✅ Sin intervención manual.
- **API key de Anthropic rotada mid-session**: la cache no conoce esto;
  un HIT devolvería el resultado anterior. Aceptable porque no hay
  diferencia semántica para el vendedor — el resultado cacheado es válido.
- **TTL de 5 min es corto**: si el vendedor necesita regenerar de verdad
  después de >5 min con inputs idénticos, la cache ya expiró y se llama
  a Claude. No hace falta botón "bypass cache".

### Archivos modificados

- `src/lib/db.ts` — +55 líneas (cache map, TTL, stableStringify, cache
  check al inicio, cache set al final).
- Sin cambios en `Wizard.tsx` — el cache es transparente al llamador.

---

## v2.27.2 — Métricas de LLM vs rule-based

**Fecha**: Abril 2026

### Qué cambia

Cada invocación a `runAiAnalysis` en el Wizard ahora escribe una fila en
la nueva tabla `ai_analyses`. Fire-and-forget: el log nunca bloquea el
flujo del vendedor ni dispara errores visibles.

### Por qué

Sin datos no hay forma de decidir si vale la pena seguir manteniendo el
rule-based. Con esta tabla vas a poder responder:

- **¿Cuánto falla el LLM?** — `count(*) filter (mode='rules') / total`.
  Si está consistentemente <1% durante un mes, el rule-based es
  candidato a retiro en v2.28.
- **¿Cuánto ahorra el cache?** — `cached=true / llm_total`. Si es >30%,
  hay más potencial bajando el TTL o persistiendo el cache.
- **¿Cuál es la latencia p95 del LLM?** — `percentile_cont(0.95) within
  group (order by latency_ms) filter (mode='llm' and cached=false)`.
- **¿Qué vendors usan más el análisis IA?** — `count(*) group by
  vendor_id` para entender adopción por equipo.

### Schema de `ai_analyses`

| Columna           | Tipo        | Nota                                         |
| ----------------- | ----------- | -------------------------------------------- |
| `id`              | uuid        | PK                                           |
| `vendor_id`       | uuid FK     | `vendors(id)`, ON DELETE SET NULL            |
| `mode`            | text        | `'llm'` o `'rules'`                          |
| `cached`          | bool        | true si vino del cache de 5min               |
| `regenerate_only` | bool        | true si fue el botón "Regenerar texto"       |
| `latency_ms`      | int         | null en rule-based síncrono                  |
| `error_message`   | text        | null si mode=llm                             |
| `fallback_reason` | text        | `api-error`, `0-products`, `force-local`     |
| `model`           | text        | ej. `claude-haiku-4-5`, null si rules        |
| `input_tokens`    | int         | desde `result.usage.input_tokens`            |
| `output_tokens`   | int         | desde `result.usage.output_tokens`           |
| `suggested_count` | int         | cuántos productos sugirió el LLM             |
| `created_at`      | timestamptz | `now()`                                      |

### RLS

- **INSERT**: vendor autenticado puede insertar SU propio row
  (`vendor_id = auth.uid()`). Previene falsificación entre vendors.
- **SELECT**: admins y super_admins ven todo; otros vendors sólo sus
  propias filas.
- **UPDATE/DELETE**: nadie desde cliente — append-only log.

### Vista agregada lista para usar

La migración crea `ai_analyses_daily_metrics` — métricas por día con
p50 y p95 de latencia, fallback_pct, y totales de tokens:

```sql
select * from public.ai_analyses_daily_metrics;
```

### Deploy — pasos en orden

**1. Migración SQL** — APLICAR PRIMERO, ANTES del push a main:

Correr `migrations/v2_27_2_ai_analyses.sql` en el SQL Editor del proyecto
`ukpoczrgndhkydpdrtvu`, o vía Supabase MCP con `apply_migration`. La
migración es idempotente (`create table if not exists`, `drop policy if
exists`). Si falla por RLS, revisá que `vendors.id` coincida con
`auth.uid()` en tu schema (si usás `vendors.user_id`, ajustá las dos
policies).

**2. Frontend** — push a main:

```bash
git add -A
git commit -m "v2.27.2: métricas ai_analyses + logAiAnalysis fire-and-forget"
git tag v2.27.2
git push origin main --tags
```

### Archivos modificados

- `migrations/v2_27_2_ai_analyses.sql` (nuevo, ~130 líneas) — tabla +
  índices + 2 policies RLS + vista agregada + queries ad-hoc comentadas.
- `src/lib/db.ts` — `AiAnalysisResult` gana `_cached?` + `_latencyMs?`
  (no vienen de la Edge Function, los popula el cliente); nueva función
  `logAiAnalysis(row)`; `analyzeRequirementsViaEdgeFunction` ahora mide
  latencia del request real.
- `src/pages/Wizard.tsx` — import de `logAiAnalysis`, wall-clock
  `analysisStart` al inicio de `runAiAnalysis`, y 3 llamadas
  `void logAiAnalysis(...)` (forceLocal, success LLM, catch fallback).

### Verificación post-deploy

```sql
-- Debería haber al menos una fila a los pocos segundos de usar el Wizard.
select * from public.ai_analyses order by created_at desc limit 5;
```

Si `SELECT` no devuelve nada pero sabés que el vendor usó el Wizard,
revisá los logs de Supabase → la policy de INSERT probablemente rechazó
la fila (porque `vendor_id != auth.uid()`) y el fire-and-forget absorbió
el error sin mostrárselo al usuario.

---

## Notas para el próximo release (v2.28)

- El rule-based fallback sigue siendo el mismo de v2.26 + word boundaries.
  Para v2.28 tendría sentido simplificar o retirar parte del rule-based
  si las métricas de `ai_analyses` muestran que el LLM cubre >99% de los
  casos en producción. Esperar ~4 semanas de datos antes de decidir.
- El bundle principal pesa ~618 KB (168 KB gzipped). El lazy-load de
  `jspdf` / `html2canvas` / `quotePdf` / `promptPdf` **ya está implementado**
  en `QuotePreview.tsx` (ver `await import(...)`), así que el peso viene
  de React + Supabase JS + código de la app. Bajarlo requeriría
  route-based code-splitting (separar Dashboard / Clients / Products /
  Users en chunks independientes con React.lazy + Suspense), que es
  una refactor más invasiva y de valor dudoso para una app interna.


-- ═══════════════════════════════════════════════════════════════════════
-- v2.27.2 — Tabla ai_analyses para métricas de LLM vs rule-based
-- ═══════════════════════════════════════════════════════════════════════
-- Aplicar en Supabase SQL Editor del proyecto ukpoczrgndhkydpdrtvu.
-- Es idempotente (usa IF NOT EXISTS y DROP POLICY IF EXISTS), seguro
-- correr múltiples veces.
--
-- Propósito: append-only log de cada invocación a runAiAnalysis en el
-- Wizard. Permite medir:
--   · fallback rate: % de análisis que caen a rule-based por fallo del LLM
--   · latencia p50 / p95 del LLM
--   · cache hit rate (cuánto ahorramos en tokens)
--   · uso por vendor
--   · razones más comunes de fallback
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1) Tabla ─────────────────────────────────────────────────────────
create table if not exists public.ai_analyses (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid references public.vendors(id) on delete set null,
  mode            text not null check (mode in ('llm', 'rules')),
  cached          boolean not null default false,
  regenerate_only boolean not null default false,
  latency_ms      integer,
  error_message   text,
  fallback_reason text,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  suggested_count integer,
  created_at      timestamptz not null default now()
);

comment on table public.ai_analyses is
  'v2.27.2: log append-only de análisis IA en el Wizard. Cada fila = una invocación. Métricas: fallback rate, latencia del LLM, cache hit rate, uso por vendor.';
comment on column public.ai_analyses.vendor_id is
  'FK a vendors, ON DELETE SET NULL para preservar histórico si el vendor se elimina.';
comment on column public.ai_analyses.mode is
  'llm = Edge Function devolvió resultado válido; rules = fallback a rule-based (LLM falló, 0 productos válidos, o forceLocal).';
comment on column public.ai_analyses.cached is
  'true si el resultado vino del cache en memoria de 5min (sin llamado a Anthropic).';
comment on column public.ai_analyses.regenerate_only is
  'true si fue invocado desde el botón "Regenerar texto" en Step 4.';
comment on column public.ai_analyses.latency_ms is
  'Milisegundos desde inicio del análisis hasta resultado final aplicado. NULL en paths rule-based síncronos.';
comment on column public.ai_analyses.error_message is
  'Mensaje del error que disparó el fallback. NULL si mode=llm o si forceLocal.';
comment on column public.ai_analyses.fallback_reason is
  'Razón estructurada: api-error / 0-products / force-local. Útil para filtrar en queries.';
comment on column public.ai_analyses.model is
  'Modelo reportado por la Edge Function (ej. claude-haiku-4-5). NULL si mode=rules.';

-- ─── 2) Índices para queries comunes ──────────────────────────────────
create index if not exists ai_analyses_created_at_idx
  on public.ai_analyses (created_at desc);
create index if not exists ai_analyses_vendor_created_idx
  on public.ai_analyses (vendor_id, created_at desc);
create index if not exists ai_analyses_mode_idx
  on public.ai_analyses (mode);

-- ─── 3) Row Level Security ────────────────────────────────────────────
-- INSERT: cualquier vendor autenticado puede insertar SU propio row
--         (vendor_id debe coincidir con auth.uid()). Previene que un
--         vendor falsifique métricas de otro.
-- SELECT: admins y super_admins ven todo; el resto sólo sus propias filas.
-- UPDATE/DELETE: nadie desde el cliente (append-only log).
alter table public.ai_analyses enable row level security;

drop policy if exists "ai_analyses_insert_self" on public.ai_analyses;
create policy "ai_analyses_insert_self" on public.ai_analyses
  for insert to authenticated
  with check (vendor_id = auth.uid());

drop policy if exists "ai_analyses_select_admin_or_self" on public.ai_analyses;
create policy "ai_analyses_select_admin_or_self" on public.ai_analyses
  for select to authenticated
  using (vendor_id = auth.uid() or public.is_admin());
-- Nota: public.is_admin() existe desde migraciones iniciales del proyecto;
-- cubre roles 'admin' y 'super_admin'. Si preferís policy más estricta,
-- reemplazá por public.is_super_admin().

-- ─── 4) Vista agregada (opcional, útil para dashboard) ────────────────
-- Expone métricas por día de los últimos 30 días. Reindexa automática.
create or replace view public.ai_analyses_daily_metrics as
select
  date_trunc('day', created_at) as day,
  count(*)                                                               as total,
  count(*) filter (where mode = 'llm'   and cached = false)              as llm_real,
  count(*) filter (where mode = 'llm'   and cached = true)               as llm_cached,
  count(*) filter (where mode = 'rules')                                 as rules,
  round(
    100.0 * count(*) filter (where mode = 'rules')
    / nullif(count(*), 0),
    1
  )                                                                      as fallback_pct,
  percentile_cont(0.5)  within group (order by latency_ms)
    filter (where mode = 'llm' and cached = false)                       as llm_latency_p50,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where mode = 'llm' and cached = false)                       as llm_latency_p95,
  sum(input_tokens)                                                      as total_input_tokens,
  sum(output_tokens)                                                     as total_output_tokens
from public.ai_analyses
where created_at > now() - interval '30 days'
group by 1
order by 1 desc;

comment on view public.ai_analyses_daily_metrics is
  'v2.27.2: métricas diarias últimos 30 días. fallback_pct alto (>10%) indica problemas con el LLM; cache hit rate = llm_cached / (llm_real + llm_cached).';

-- ─── 5) Queries útiles ad-hoc (correr manualmente desde SQL editor) ──
--
-- Fallback rate últimos 7 días:
--   select mode, cached, count(*),
--          round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct
--   from public.ai_analyses
--   where created_at > now() - interval '7 days'
--   group by mode, cached order by count(*) desc;
--
-- Top 5 razones de fallback:
--   select coalesce(fallback_reason, '(sin razón)') as reason, count(*)
--   from public.ai_analyses where mode = 'rules'
--   group by 1 order by count(*) desc limit 5;
--
-- Vendors más activos últimos 30 días:
--   select v.name, v.email, count(*) as analyses,
--          count(*) filter (where a.mode = 'llm' and a.cached = false) as llm_real
--   from public.ai_analyses a
--   left join public.vendors v on v.id = a.vendor_id
--   where a.created_at > now() - interval '30 days'
--   group by v.id, v.name, v.email
--   order by count(*) desc limit 20;

-- ═══════════════════════════════════════════════════════════════════════
-- v2.25 — Formato proforma tributario + términos híbridos + datos cliente
-- ═══════════════════════════════════════════════════════════════════════
-- Aplicar en Supabase SQL Editor del proyecto de producción.
-- Es idempotente (usa IF NOT EXISTS), seguro correr múltiples veces.

-- ─── 1) Nuevos campos en quotes ───────────────────────────────────────
-- Campos generados por IA en el Wizard (paso 3) + override de términos.
alter table public.quotes
  add column if not exists justification_text text,
  add column if not exists solution_summary  text,
  add column if not exists scope_summary     text,
  add column if not exists modality_summary  text,
  add column if not exists terms             text;

comment on column public.quotes.justification_text is
  'v2.25: narrativa 2 párrafos generada por IA a partir de requirements. Sección "Justificación y características del proyecto" del PDF. Fallback a proposal_text si NULL.';
comment on column public.quotes.solution_summary is
  'v2.25: chip "Solución" (~60 chars) generado por IA.';
comment on column public.quotes.scope_summary is
  'v2.25: chip "Alcance" (~60 chars) generado por IA.';
comment on column public.quotes.modality_summary is
  'v2.25: chip "Modalidad" (~60 chars) generado por IA.';
comment on column public.quotes.terms is
  'v2.25: override opcional de "Notas y condiciones" para esta cotización. NULL = usa organization_settings.default_terms. Una línea por nota.';

-- ─── 2) Campos nuevos de cliente ──────────────────────────────────────
-- contact_role y address para el bloque CLIENTE del PDF.
alter table public.clients
  add column if not exists contact_role text,
  add column if not exists address      text;

comment on column public.clients.contact_role is
  'v2.25: cargo del contacto principal (ej. "Gerente General"). Aparece como "Attn: {contact} · {contact_role}" en el bloque Cliente del PDF.';
comment on column public.clients.address is
  'v2.25: dirección del cliente. Aparece en el bloque Cliente del PDF.';

-- ─── 3) Default de términos en organization_settings ──────────────────
alter table public.organization_settings
  add column if not exists default_terms text;

comment on column public.organization_settings.default_terms is
  'v2.25: términos y condiciones por defecto (una línea por nota). Si quotes.terms es NULL, se usan estos al renderizar el PDF y PublicLink.';

-- ─── 4) Seed inicial de default_terms (opcional, solo si está NULL) ───
-- Deja este bloque comentado si prefieres llenarlo tú desde la UI de Ajustes.
-- update public.organization_settings
-- set default_terms =
--   'Los precios incluyen IGV (18%). El desglose se muestra en la tabla de totales.' || E'\n' ||
--   'El cliente proporcionará los contenidos (textos, imágenes, logo) en formato digital editable.' || E'\n' ||
--   'Se incluyen hasta 2 rondas de revisiones sobre el diseño. Cambios adicionales se cotizarán por separado.' || E'\n' ||
--   'La propuesta se activa con la firma de conformidad y el pago del adelanto acordado.' || E'\n' ||
--   'Los cargos recurrentes (hosting, renovaciones, suscripciones) no están incluidos en el total de la inversión inicial.'
-- where default_terms is null;

-- ─── Verificación ─────────────────────────────────────────────────────
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('quotes', 'clients', 'organization_settings')
--   and column_name in (
--     'justification_text', 'solution_summary', 'scope_summary',
--     'modality_summary', 'terms', 'contact_role', 'address', 'default_terms'
--   )
-- order by table_name, column_name;

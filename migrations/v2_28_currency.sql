-- ═══════════════════════════════════════════════════════════════════════
-- v2.28: Moneda por producto (PEN/USD) y por cotización (PEN/USD)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Hasta v2.27 todo se asumía en soles (PEN). Esta migración:
--
--  1. Agrega `products.currency` (PEN|USD): cada producto se registra en una
--     moneda fija. Los módulos del producto heredan esa moneda (no se guarda
--     por separado en product_modules — el cálculo en código usa product.currency).
--
--  2. Agrega `quotes.currency` (PEN|USD): moneda en la que se emite la
--     cotización. Si un producto está en otra moneda, su precio se convierte
--     usando `quotes.exchange_rate` (ya existente) al momento de cotizar.
--
-- Backfill: TODOS los registros existentes quedan en 'PEN' (default). No hay
-- ruptura de datos ni de UI: cotizaciones ya emitidas siguen leyéndose en soles.
--
-- Nota: IGV se aplica al 18% sobre el total en la moneda del quote (PEN o USD).

-- ─── products ──────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PEN';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_currency_check;
ALTER TABLE products
  ADD CONSTRAINT products_currency_check
  CHECK (currency IN ('PEN','USD'));

-- ─── quotes ────────────────────────────────────────────────────────────
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PEN';

ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_currency_check;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_currency_check
  CHECK (currency IN ('PEN','USD'));

-- ─── Comentarios para la doc del esquema ───────────────────────────────
COMMENT ON COLUMN products.currency IS
  'v2.28: moneda nativa del producto (PEN o USD). Los módulos del producto heredan esta moneda.';
COMMENT ON COLUMN quotes.currency IS
  'v2.28: moneda en la que se emite la cotización (PEN o USD). Items en otra moneda se convierten usando exchange_rate.';

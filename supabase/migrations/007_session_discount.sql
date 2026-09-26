-- Bill-level discount applied to the item subtotal, before service and tax.
-- See .claude/spec/discount/tech-design.md.
--
-- Apply this in the Supabase SQL Editor (same path as previous migrations).
--
-- discount_type / discount_value hold what the user entered (e.g. 'percentage' / 15).
-- discount_amount is the resolved IDR amount (e.g. 193050); it is written by the
-- server only and is the single value bill calculations read.
--
-- Defaults keep every existing session at a zero discount, so no backfill is needed.
-- sessions is already in the supabase_realtime publication (migration 004), so
-- the new columns flow through the existing UPDATE subscription.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS discount_type   VARCHAR(10)   NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS discount_type_valid;
ALTER TABLE sessions ADD CONSTRAINT discount_type_valid
  CHECK (discount_type IN ('percentage', 'amount'));

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS discount_value_nonneg;
ALTER TABLE sessions ADD CONSTRAINT discount_value_nonneg
  CHECK (discount_value >= 0);

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS discount_pct_range;
ALTER TABLE sessions ADD CONSTRAINT discount_pct_range
  CHECK (discount_type <> 'percentage' OR discount_value <= 100);

-- Backstop only: the API validates first and returns INVALID_DISCOUNT.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS discount_amount_range;
ALTER TABLE sessions ADD CONSTRAINT discount_amount_range
  CHECK (discount_amount >= 0 AND discount_amount <= subtotal);

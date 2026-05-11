-- Add unit-based splitting to item_assignments.
-- Apply this migration BEFORE deploying code that writes split_type='unit'.

-- 1. Add unit_count column (per-participant unit allocation when split_type='unit')
ALTER TABLE item_assignments
  ADD COLUMN IF NOT EXISTS unit_count INTEGER
  CHECK (unit_count IS NULL OR unit_count > 0);

-- 2. Extend the split_type CHECK constraint to allow 'unit'
ALTER TABLE item_assignments
  DROP CONSTRAINT IF EXISTS item_assignments_split_type_check;
ALTER TABLE item_assignments
  ADD CONSTRAINT item_assignments_split_type_check
  CHECK (split_type IN ('equal', 'percentage', 'unit'));

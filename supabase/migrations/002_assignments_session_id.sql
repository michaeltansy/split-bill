-- Add session_id to item_assignments so realtime subscriptions can filter by session.
-- Apply this migration BEFORE deploying code that writes session_id on insert.

-- 1. Add nullable column with FK
ALTER TABLE item_assignments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;

-- 2. Backfill from items.session_id
UPDATE item_assignments AS a
SET session_id = i.session_id
FROM items AS i
WHERE a.item_id = i.id
  AND a.session_id IS NULL;

-- 3. Enforce NOT NULL after backfill
ALTER TABLE item_assignments
  ALTER COLUMN session_id SET NOT NULL;

-- 4. Index for the realtime postgres_changes filter (filter: session_id=eq.<id>)
CREATE INDEX IF NOT EXISTS idx_assignments_session_id
  ON item_assignments(session_id);

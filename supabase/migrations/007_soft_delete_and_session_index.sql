-- Soft-delete for sessions + an owner-scoped list index + a purge job.
--
-- Apply this in the Supabase SQL Editor (same path as previous migrations).
--
-- Backs the "My Sessions" feature: a signed-in creator can list, paginate, and
-- soft-delete (with Undo) their own sessions. "Delete" sets deleted_at instead of
-- removing the row; a scheduled purge hard-deletes rows soft-deleted >= 2 weeks.

-- 1. Soft-delete marker. NULL = live, timestamp = soft-deleted (recoverable via Undo).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Serves the My Sessions list query: scoped by owner, newest-first, excluding
--    soft-deleted rows. Partial + ordered so cursor pagination is index-only.
CREATE INDEX IF NOT EXISTS idx_sessions_owner_created
  ON sessions (created_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. Purge: hard-delete rows soft-deleted for >= 2 weeks (cascades to
--    participants/items/assignments/bank rows via their ON DELETE CASCADE FKs).
--    NOTE: the previous expires_at branch is intentionally removed so expired
--    sessions persist and remain visible in the "Expired" tab. The function name
--    is kept (callers/schedules may reference it); only soft-deletes are purged now.
-- search_path pinned + schema-qualified table (avoids the function_search_path_mutable
-- advisory; the function runs from the pg_cron job context).
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.sessions
  WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. Schedule the purge daily (run once; requires the pg_cron extension).
--    If pg_cron is not yet enabled, enable it first (dashboard: Database ->
--    Extensions, or the statement below), then create the schedule.
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('cleanup-sessions', '0 3 * * *',
--                        'SELECT cleanup_expired_sessions();');

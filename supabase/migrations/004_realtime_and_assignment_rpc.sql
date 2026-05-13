-- Enable realtime publication and add race-safe assignment RPCs.
-- Apply this in the Supabase SQL Editor (same path as previous migrations).
--
-- After applying, sanity-check:
--   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
--   -> should include sessions, participants, items, item_assignments

-- 1. Realtime publication (idempotent via pg_publication_tables guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE participants;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='item_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE item_assignments;
  END IF;
END$$;

-- 2. REPLICA IDENTITY FULL so DELETE payloads carry the full OLD row.
--    Required for the client's per-row delete handlers to read item_id/participant_id
--    out of payload.old (default DELETE replicates the primary key only).
ALTER TABLE item_assignments REPLICA IDENTITY FULL;
ALTER TABLE items            REPLICA IDENTITY FULL;
ALTER TABLE participants     REPLICA IDENTITY FULL;

-- 3. Per-participant upsert used by POST /api/items/[itemId]/assignments/[participantId]
--    Locks the items row for the duration of the tx so concurrent edits on the same
--    item serialize. Validates cross-row sums inside the lock for percentage/unit.
CREATE OR REPLACE FUNCTION upsert_assignment_validated(
  p_item_id        UUID,
  p_participant_id UUID,
  p_split_type     TEXT,
  p_percentage     NUMERIC,
  p_unit_count     INTEGER
) RETURNS item_assignments
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id UUID;
  v_quantity   INTEGER;
  v_sum_pct    NUMERIC;
  v_sum_units  INTEGER;
  v_row        item_assignments;
BEGIN
  SELECT session_id, quantity INTO v_session_id, v_quantity
  FROM items WHERE id = p_item_id FOR UPDATE;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_split_type NOT IN ('equal','percentage','unit') THEN
    RAISE EXCEPTION 'INVALID_SPLIT_TYPE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO item_assignments (item_id, session_id, participant_id, split_type, percentage, unit_count)
  VALUES (
    p_item_id, v_session_id, p_participant_id, p_split_type,
    CASE WHEN p_split_type='percentage' THEN p_percentage ELSE NULL END,
    CASE WHEN p_split_type='unit'       THEN p_unit_count  ELSE NULL END
  )
  ON CONFLICT (item_id, participant_id) DO UPDATE
    SET split_type = EXCLUDED.split_type,
        percentage = EXCLUDED.percentage,
        unit_count = EXCLUDED.unit_count
  RETURNING * INTO v_row;

  IF p_split_type = 'percentage' THEN
    SELECT COALESCE(SUM(percentage),0) INTO v_sum_pct
    FROM item_assignments WHERE item_id = p_item_id AND split_type = 'percentage';
    IF ABS(v_sum_pct - 100) > 0.01 THEN
      RAISE EXCEPTION 'INVALID_PERCENTAGE_SUM:%', v_sum_pct USING ERRCODE = '22023';
    END IF;
  ELSIF p_split_type = 'unit' THEN
    IF p_unit_count IS NULL OR p_unit_count <= 0 THEN
      RAISE EXCEPTION 'INVALID_UNIT_COUNT' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(SUM(unit_count),0) INTO v_sum_units
    FROM item_assignments WHERE item_id = p_item_id AND split_type = 'unit';
    IF v_sum_units <> v_quantity THEN
      RAISE EXCEPTION 'INVALID_UNIT_SUM:%:%', v_sum_units, v_quantity USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- 4. Bulk replace used by PUT /api/items/[itemId]/assignments
--    Locks the items row, deletes existing rows, inserts the new set, validates sums.
--    Returns the post-state rows.
CREATE OR REPLACE FUNCTION replace_assignments_validated(
  p_item_id     UUID,
  p_assignments JSONB
) RETURNS SETOF item_assignments
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id UUID;
  v_quantity   INTEGER;
  v_sum_pct    NUMERIC;
  v_sum_units  INTEGER;
BEGIN
  SELECT session_id, quantity INTO v_session_id, v_quantity
  FROM items WHERE id = p_item_id FOR UPDATE;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM item_assignments WHERE item_id = p_item_id;

  IF jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO item_assignments (item_id, session_id, participant_id, split_type, percentage, unit_count)
    SELECT
      p_item_id,
      v_session_id,
      (a->>'participant_id')::UUID,
      a->>'split_type',
      CASE WHEN a->>'split_type'='percentage' THEN (a->>'percentage')::NUMERIC ELSE NULL END,
      CASE WHEN a->>'split_type'='unit'       THEN (a->>'unit_count')::INTEGER ELSE NULL END
    FROM jsonb_array_elements(p_assignments) AS a;
  END IF;

  SELECT COALESCE(SUM(percentage),0) INTO v_sum_pct
  FROM item_assignments WHERE item_id = p_item_id AND split_type = 'percentage';
  IF v_sum_pct > 0 AND ABS(v_sum_pct - 100) > 0.01 THEN
    RAISE EXCEPTION 'INVALID_PERCENTAGE_SUM:%', v_sum_pct USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(unit_count),0) INTO v_sum_units
  FROM item_assignments WHERE item_id = p_item_id AND split_type = 'unit';
  IF v_sum_units > 0 AND v_sum_units <> v_quantity THEN
    RAISE EXCEPTION 'INVALID_UNIT_SUM:%:%', v_sum_units, v_quantity USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT * FROM item_assignments WHERE item_id = p_item_id;
END;
$$;

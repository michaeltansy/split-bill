-- Bank info (separate table — v1 enforces 1-to-1 via UNIQUE(session_id);
-- dropping that constraint later unlocks 1-to-many without an app-schema rewrite)
-- and per-participant paid status.
--
-- Apply this in the Supabase SQL Editor (same path as previous migrations).

-- 1. session_bank_accounts table
CREATE TABLE IF NOT EXISTS session_bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  bank_name            TEXT NOT NULL,
  bank_account_number  TEXT NOT NULL,
  bank_account_holder  TEXT NOT NULL,
  display_order        SMALLINT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT bank_account_number_format CHECK (bank_account_number ~ '^[0-9]{8,20}$'),
  CONSTRAINT bank_name_length           CHECK (char_length(bank_name) BETWEEN 1 AND 30),
  CONSTRAINT bank_account_holder_length CHECK (char_length(bank_account_holder) BETWEEN 1 AND 80)
);

-- v1 single-bank lock. To enable multi-bank later:
--   ALTER TABLE session_bank_accounts DROP CONSTRAINT session_bank_accounts_session_id_unique;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_bank_accounts_session_id_unique'
  ) THEN
    ALTER TABLE session_bank_accounts
      ADD CONSTRAINT session_bank_accounts_session_id_unique UNIQUE (session_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_session_bank_accounts_session_id
  ON session_bank_accounts(session_id);

-- RLS — same posture as the rest of the schema (UUID-obscurity model).
ALTER TABLE session_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Session bank accounts are publicly accessible" ON session_bank_accounts;
CREATE POLICY "Session bank accounts are publicly accessible"
  ON session_bank_accounts FOR ALL USING (true);

-- 2. Participants paid status
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 3. Realtime — include session_bank_accounts so future edits propagate,
--    and ensure participants UPDATE payloads carry full OLD/NEW rows
--    (REPLICA IDENTITY FULL was already set in migration 004).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='session_bank_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE session_bank_accounts;
  END IF;
END$$;

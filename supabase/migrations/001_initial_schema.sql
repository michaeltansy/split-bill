-- Split Bill Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 week'),
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  service_amount DECIMAL(10,2) DEFAULT 0,
  grand_total DECIMAL(10,2) DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  service_percentage DECIMAL(5,2) DEFAULT 0,
  receipt_image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, name)
);

CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_session_id ON items(session_id);

-- Item assignments table
CREATE TABLE IF NOT EXISTS item_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  split_type VARCHAR(20) DEFAULT 'equal' CHECK (split_type IN ('equal', 'percentage')),
  percentage DECIMAL(5,2) CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_item_id ON item_assignments(item_id);
CREATE INDEX IF NOT EXISTS idx_assignments_participant_id ON item_assignments(participant_id);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_assignments ENABLE ROW LEVEL SECURITY;

-- Public access policies (sessions are public via UUID obscurity)
DROP POLICY IF EXISTS "Sessions are publicly accessible" ON sessions;
CREATE POLICY "Sessions are publicly accessible" ON sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Participants are publicly accessible" ON participants;
CREATE POLICY "Participants are publicly accessible" ON participants FOR ALL USING (true);

DROP POLICY IF EXISTS "Items are publicly accessible" ON items;
CREATE POLICY "Items are publicly accessible" ON items FOR ALL USING (true);

DROP POLICY IF EXISTS "Assignments are publicly accessible" ON item_assignments;
CREATE POLICY "Assignments are publicly accessible" ON item_assignments FOR ALL USING (true);

-- Enable realtime (run these separately if needed)
-- ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE participants;
-- ALTER PUBLICATION supabase_realtime ADD TABLE items;
-- ALTER PUBLICATION supabase_realtime ADD TABLE item_assignments;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW() AND status != 'expired';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

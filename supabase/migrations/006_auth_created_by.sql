-- Associate sessions with their authenticated creator (Google SSO via Supabase Auth).
--
-- Apply this in the Supabase SQL Editor (same path as previous migrations).
--
-- One-time external setup required for Google SSO (not SQL):
--   1. Google Cloud Console -> APIs & Services -> Credentials -> create an
--      OAuth 2.0 Client ID (type: Web application). Authorized redirect URI:
--        https://<project-ref>.supabase.co/auth/v1/callback
--   2. Supabase dashboard -> Authentication -> Providers -> Google:
--        paste the Google Client ID + Client Secret, then enable.
--   3. Supabase dashboard -> Authentication -> URL Configuration:
--        add Site URL and redirect URLs for both
--        http://localhost:3000  and the production app URL,
--        each allowing the /auth/callback path.

-- created_by is nullable: historical sessions and the anonymous participant
-- flows are unaffected. ON DELETE SET NULL keeps shared bills alive if the
-- Google user is later deleted.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);

# External Integrations

**Analysis Date:** 2026-05-08

## APIs & External Services

**AI / Machine Learning:**
- Google Gemini AI (`gemini-2.0-flash` model) — receipt OCR and parsing
  - SDK/Client: `@google/generative-ai` ^0.24.1
  - Auth: `GEMINI_API_KEY` (server-side only, never exposed to the browser)
  - Integration point: `src/app/api/ocr/route.ts` — POST endpoint that sends a base64-encoded image with a structured JSON prompt; response is parsed to extract line items, totals, tax, and service charges
  - Image size limit: 10 MB enforced before calling the API
  - Model: `genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })`

## Data Storage

**Databases:**
- Supabase (PostgreSQL) — primary data store for all application state
  - Client: `@supabase/supabase-js` ^2.45.0
  - Browser client (anon key): `src/lib/supabase.ts` → `supabase` export
  - Server client (service role key): `src/lib/supabase.ts` → `createServerClient()` — used in all Next.js API route handlers
  - Connection env vars:
    - `NEXT_PUBLIC_SUPABASE_URL` — project URL (public, safe for browser)
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key (public, safe for browser)
    - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side only, bypasses RLS)
  - Schema defined in: `supabase/migrations/001_initial_schema.sql`
  - Tables: `sessions`, `participants`, `items`, `item_assignments`
  - Row Level Security: enabled on all four tables; current policies grant full public access (no user auth — access control relies on UUID obscurity)
  - Realtime: schema includes commented-out publication statements; realtime is NOT currently active
  - uuid-ossp extension enabled for UUID primary key generation

**File Storage:**
- Not used. `receipt_image_url` column exists in the `sessions` table (TEXT type) but no file upload to Supabase Storage or any other storage service is implemented in the current codebase.

**Caching:**
- None. No Redis, Memcached, or Next.js ISR caching configured.

## Authentication & Identity

**Auth Provider:**
- None. The application has no user authentication system.
- Session access is controlled solely by UUID obscurity — anyone with a session UUID can read and write to that session.
- RLS policies on all tables use `USING (true)`, granting unrestricted public access.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, or equivalent configured).

**Logs:**
- `console.log` and `console.error` only, used in:
  - `src/app/api/ocr/route.ts` — logs raw Gemini response and parsed OCR result
  - `src/hooks/useOCR.ts` — logs OCR result on client

## CI/CD & Deployment

**Hosting:**
- Docker container — `Dockerfile` produces a multi-stage standalone image
- Docker Compose — `docker-compose.yml` defines a single `web` service exposing port 3000
- No cloud provider is hardcoded; deployment target is operator-configured

**CI Pipeline:**
- None detected (no GitHub Actions, CircleCI, or similar config files present)

## Scheduled Jobs

**Supabase Edge Function:**
- `supabase/functions/cleanup-sessions/index.ts` — Deno function that deletes all sessions where `expires_at` is in the past
- Runtime: Deno (Supabase Edge Runtime)
- Deployment: `supabase functions deploy cleanup-sessions`
- Scheduling: intended to run via cron (`0 0 * * *` — daily at midnight)
- Auth: uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Deno environment
- Also has a SQL-level stored procedure `cleanup_expired_sessions()` defined in the migration for manual invocation

## Environment Configuration

**Required environment variables:**

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (browser + server) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (browser + server) | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service role key (bypasses RLS) |
| `GEMINI_API_KEY` | Server-only | Google Gemini AI API key |
| `NEXT_PUBLIC_APP_URL` | Public (browser + server) | Base URL of the app (e.g. `http://localhost:3000`); defaults to `http://localhost:3000` in Docker Compose |

**Template:** `.env.example` at project root documents all five variables.

**Secrets location:**
- Local development: `.env.local` (not committed; based on `.env.example`)
- Production (Docker): injected via Docker Compose environment block from host env vars

## Webhooks & Callbacks

**Incoming:**
- None configured.

**Outgoing:**
- None configured.

## Browser APIs Used

- `navigator.clipboard.writeText` — used in `src/components/ShareModal.tsx` for copy-to-clipboard
- `navigator.share` — used in `src/components/ShareModal.tsx` for native OS share sheet (mobile)
- `FormData` / `fetch` — used in `src/hooks/useOCR.ts` to POST image to `/api/ocr`

---

*Integration audit: 2026-05-08*

# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**AI / Machine Learning — Google Gemini:**
- Model: `gemini-2.5-flash-lite` (chosen for free-tier limits: ~30 RPM / 1000 RPD)
- SDK: `@google/generative-ai` ^0.24.1 (`GoogleGenerativeAI`, `SchemaType`, `Schema`)
- Auth: `GEMINI_API_KEY` (server-only)
- Wired in: `src/app/api/ocr/route.ts`
  - Accepts `multipart/form-data` with an `image` field
  - Enforces image MIME type and a 10 MB size cap
  - Sends a strict JSON-schema request (`responseMimeType: 'application/json'`, `responseSchema: RESPONSE_SCHEMA` describing `items[]`, `tax_amount`, `service_amount`)
  - Domain prompt understands Indonesian thousands separators ("58,000" = 58000)
  - Retries once on 503 (with jittered 1.5s sleep); never retries 429 to preserve quota
  - Returns sanitised `{ items, tax_amount, service_amount }`
- Feature flag: `NEXT_PUBLIC_OCR_ENABLED=true` toggles the scan UI in `src/app/page.tsx`; the API also short-circuits with `503 OCR_DISABLED` if `GEMINI_API_KEY` is absent
- Client hook: `src/hooks/useBillScan.ts` posts to `/api/ocr` and enforces a 6s client-side cooldown

**Rate Limiting — Upstash Redis:**
- SDKs: `@upstash/ratelimit` ^2.0.8 over `@upstash/redis` ^1.38.0
- Wired in: `src/lib/ratelimit.ts`
- Two sliding-window limiters created when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present:
  - `ratelimit` — default 30 requests / 10 s per IP, prefix `splitbill`; tunable via `UPSTASH_RATELIMIT_REQUESTS` and `UPSTASH_RATELIMIT_WINDOW`
  - `ocrRatelimit` — default 8 requests / 1 m per IP (stays under Gemini RPM), prefix `splitbill:ocr`; tunable via `UPSTASH_OCR_RATELIMIT_REQUESTS` and `UPSTASH_OCR_RATELIMIT_WINDOW`
- Edge enforcement: `src/middleware.ts` applies the global limiter to all `/api/:path*` requests and sets `X-RateLimit-Limit/Remaining/Reset` headers; rejects with HTTP 429 and `Retry-After` when exceeded
- OCR-specific limit applied additionally inside `src/app/api/ocr/route.ts` using `clientIp()` derived from `x-forwarded-for` / `x-real-ip`
- Disabled when env vars are absent (logs a warning in production)

## Data Storage

**Database — Supabase (PostgreSQL):**
- Client SDK: `@supabase/supabase-js` ^2.45.0
- Browser client (anon key): exported as `supabase` from `src/lib/supabase.ts`
- Server client (service role key, bypasses RLS): `createServerClient()` in `src/lib/supabase.ts`, used by every route handler under `src/app/api/`
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL` — project URL (public)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key (public)
  - `SUPABASE_SERVICE_ROLE_KEY` — service-role key (server-only)
- Schema/migrations:
  - `supabase/migrations/001_initial_schema.sql` — `sessions`, `participants`, `items`, `item_assignments`; UUID PKs via `uuid-ossp`; RLS enabled with `USING (true)` (public-by-UUID-obscurity); SQL function `cleanup_expired_sessions()`
  - `supabase/migrations/002_assignments_session_id.sql` — adds `session_id` FK (+ index) to `item_assignments` for realtime filtering
  - `supabase/migrations/003_assignments_unit_split.sql` — adds `unit_count` column and extends `split_type` CHECK constraint to allow `'unit'` (unit-based splitting feature)

**Realtime:**
- Supabase Realtime via `postgres_changes` channels in `src/hooks/useSession.ts`
- Subscribes to `sessions`, `participants`, `items`, `item_assignments` filtered by `session_id`
- Channel naming: `session:${sessionId}`
- On any change, the hook re-fetches through the REST API (not the change payload)
- Requires the realtime publication to include these tables (commented-out `ALTER PUBLICATION supabase_realtime ADD TABLE ...` lines in `001_initial_schema.sql`; must be enabled in the Supabase dashboard or SQL)

**File Storage:**
- Not used. `sessions.receipt_image_url` (TEXT) exists in the schema but is not populated; OCR sends the image to Gemini and never persists it.

**Caching:**
- No Next.js ISR/data-cache usage; rate-limit state lives in Upstash Redis (above).

## Authentication & Identity

- No user authentication. Sessions are guarded by UUID obscurity only.
- RLS policies on every table grant `FOR ALL USING (true)` to public clients.
- No auth provider (no Supabase Auth, NextAuth, Clerk, etc.) is wired in.

## Monitoring & Observability

- **Error tracking:** none.
- **Logging:** `console.log` / `console.warn` / `console.error` only. Notable sites: `src/app/api/ocr/route.ts` (Gemini errors, non-JSON responses, 503 retry), `src/lib/ratelimit.ts` (missing-env warning).

## CI/CD & Deployment

- **CI:** none detected (no `.github/`, CircleCI, GitLab CI, or similar config).
- **Hosting:** Dockerfile + docker-compose for self-hosted; Vercel-compatible but no `vercel.json`.
- **Edge Function deploy:** Supabase CLI handles `supabase/functions/cleanup-sessions/`.

## Scheduled Jobs

**Supabase Edge Function `cleanup-sessions`:**
- File: `supabase/functions/cleanup-sessions/index.ts`
- Runtime: Deno (Supabase Edge Runtime), imports `@supabase/supabase-js@2` via `esm.sh`
- Logic: `DELETE FROM sessions WHERE expires_at < now()` (cascade clears child tables)
- Auth: reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Deno env
- Intended schedule: daily at midnight (`0 0 * * *`) per the file's deploy comments
- Backstop: SQL function `cleanup_expired_sessions()` defined in migration 001 for manual invocation

## API Surface (Next.js Route Handlers)

All handlers live under `src/app/api/` and use `createServerClient()` from `src/lib/supabase.ts`. The global rate-limit middleware applies to every route.

| Method(s) | Path | File | Purpose |
|-----------|------|------|---------|
| POST | `/api/ocr` | `src/app/api/ocr/route.ts` | Gemini receipt OCR (rate-limited separately) |
| POST | `/api/sessions` | `src/app/api/sessions/route.ts` | Create a new session row |
| GET, PATCH | `/api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` | Fetch session + participants + items + assignments; update session totals |
| POST | `/api/sessions/[id]/participants` | `src/app/api/sessions/[id]/participants/route.ts` | Add a participant or bulk add `{ names: string[] }` |
| DELETE | `/api/sessions/[id]/participants/[participantId]` | `.../participants/[participantId]/route.ts` | Remove participant |
| POST | `/api/sessions/[id]/items` | `src/app/api/sessions/[id]/items/route.ts` | Insert single item or array of items |
| POST | `/api/sessions/[id]/items/bulk` | `src/app/api/sessions/[id]/items/bulk/route.ts` | Bulk-insert validated items |
| PATCH, DELETE | `/api/sessions/[id]/items/[itemId]` | `src/app/api/sessions/[id]/items/[itemId]/route.ts` | Update or delete an item |
| PUT | `/api/items/[itemId]/assignments` | `src/app/api/items/[itemId]/assignments/route.ts` | Replace assignments; validates `percentage` sum = 100 and `unit_count` sum = item.quantity |

**Edge middleware:** `src/middleware.ts` with `matcher: '/api/:path*'` applies global Upstash rate limiting and rate-limit response headers to every API call.

## Environment Configuration

**Documented in `.env.example`:**

| Variable | Scope | Required? | Purpose |
|----------|-------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Required | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Required | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Required | Bypasses RLS in route handlers |
| `NEXT_PUBLIC_APP_URL` | Public | Required (defaults to `http://localhost:3000` in compose) | Used for share links / QR codes |
| `GEMINI_API_KEY` | Server-only | Optional | Enables `/api/ocr` |
| `NEXT_PUBLIC_OCR_ENABLED` | Public (build-time) | Optional | Surfaces scan UI when `'true'` |
| `UPSTASH_REDIS_REST_URL` | Server-only | Optional | Enables rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only | Optional | Enables rate limiting |
| `UPSTASH_RATELIMIT_REQUESTS` | Server-only | Optional | Default 30 |
| `UPSTASH_RATELIMIT_WINDOW` | Server-only | Optional | Default `10 s` |
| `UPSTASH_OCR_RATELIMIT_REQUESTS` | Server-only | Optional | Default 8 |
| `UPSTASH_OCR_RATELIMIT_WINDOW` | Server-only | Optional | Default `1 m` |

**Secrets location:**
- Local dev: `.env.local` (gitignored; mirrors `.env.example`)
- Production (Docker Compose): injected from host env; note that `docker-compose.yml` currently only forwards the four Supabase/app vars — `GEMINI_API_KEY` and Upstash vars must be added there or via another env mechanism

## Webhooks & Callbacks

- **Incoming:** none.
- **Outgoing:** none beyond direct Gemini API calls from `/api/ocr` and Supabase REST/Realtime traffic.

## Browser APIs Used

- `navigator.clipboard.writeText` and `navigator.share` — `src/components/ShareModal.tsx` (copy link, native share sheet)
- `QRCodeSVG` from `qrcode.react` — `src/components/ShareModal.tsx` (QR code for the session URL)
- `FormData` + `fetch` to `/api/ocr` — `src/hooks/useBillScan.ts`
- PWA manifest declared via `src/app/manifest.ts` (standalone display, theme color `#2563eb`)

---

*Integration audit: 2026-05-12*

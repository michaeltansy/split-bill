<!-- refreshed: 2026-05-12 -->
# Architecture

**Analysis Date:** 2026-05-12

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                  Next.js 15 App Router (Browser)                     │
│                                                                      │
│  Home (Create)              Session Page                             │
│  `src/app/page.tsx`         `src/app/session/[id]/page.tsx`          │
│  • Manual item entry        • Owner view OR participant view         │
│  • Optional AI bill scan    • Resolved by `?participant=` query      │
│  • useBillScan hook         • useSession + useBillCalculation hooks  │
└──────┬─────────────────────────────┬──────────────────────────┬──────┘
       │ fetch()                     │ fetch()                  │ Supabase
       │ POST /api/ocr               │ /api/sessions/:id/*      │ Realtime
       ▼                             ▼                          │ channel
┌──────────────────────────────────────────────────────────────┐│
│              Next.js Route Handlers (Server, Node runtime)   ││
│              `src/app/api/`                                  ││
│                                                              ││
│  Edge gate: `src/middleware.ts` (Upstash Redis rate limit    ││
│             on every /api/* request)                         ││
│                                                              ││
│  /api/ocr                          → Gemini 2.5 Flash Lite   ││
│                                      (per-IP OCR rate limit) ││
│  /api/sessions                     → POST create             ││
│  /api/sessions/[id]                → GET (joined), PATCH     ││
│  /api/sessions/[id]/items          → POST add (single+bulk)  ││
│  /api/sessions/[id]/items/bulk     → POST bulk-only          ││
│  /api/sessions/[id]/items/[itemId] → PATCH, DELETE           ││
│  /api/sessions/[id]/participants   → POST (single + bulk)    ││
│  /api/sessions/[id]/participants/  → DELETE                  ││
│        [participantId]                                       ││
│  /api/items/[itemId]/assignments   → PUT (replace all,       ││
│                                      stamps session_id,      ││
│                                      validates split rules)  ││
└────────────────────────┬─────────────────────────────────────┘│
                         │ @supabase/supabase-js (service role)  │
                         ▼                                       │
┌───────────────────────────────────────────────────────────────┴┐
│              Supabase (PostgreSQL + Realtime)                  │
│                                                                │
│  Tables: sessions, participants, items, item_assignments       │
│  Migrations: 001 (initial), 002 (assignments.session_id),      │
│              003 (assignments.unit_count + 'unit' split_type)  │
│  RLS: enabled, FOR ALL USING (true) — UUID obscurity model     │
│  Realtime: postgres_changes filtered by session_id on all      │
│            four tables                                         │
│  Edge Function: cleanup-sessions (daily cron, deletes expired) │
└────────────────────────────────────────────────────────────────┘
         ▲
         │ optional
         │
┌────────┴──────────────────────────────────────────────────────┐
│  External Services                                            │
│  • Google Gemini (OCR) — `GEMINI_API_KEY` (feature-gated)     │
│  • Upstash Redis     — rate limiting for middleware + OCR     │
└───────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Home page | Manual item form + optional AI bill scan; creates session and bulk items | `src/app/page.tsx` |
| Session page | Owner + participant view; orchestrates all session interactions | `src/app/session/[id]/page.tsx` |
| Root layout | Sets metadata/viewport, applies Inter font, wraps in `Providers` | `src/app/layout.tsx` |
| Providers | Wraps app in `ToastProvider` (only global context) | `src/components/Providers.tsx` |
| Middleware | Per-IP rate-limit gate over all `/api/*` (Upstash; no-op if env unset) | `src/middleware.ts` |
| useSession | Session CRUD via API + Supabase Realtime subscriptions; triggers full re-fetch | `src/hooks/useSession.ts` |
| useBillScan | POSTs image to `/api/ocr`; exposes 6s client-side cooldown + state | `src/hooks/useBillScan.ts` |
| useBillCalculation | `useMemo` wrapper over `calculateParticipantBills` + assigned/unassigned totals | `src/hooks/useBillCalculation.ts` |
| useShareSession | Builds share URL, wraps Web Share API + clipboard fallback | `src/hooks/useShareSession.ts` |
| useClipboard | Promise-based clipboard copy with auto-reset `copied` flag | `src/hooks/useClipboard.ts` |
| calculations.ts | Pure: `calculateParticipantBills` (equal / percentage / unit), `calculatePercentages` | `src/lib/calculations.ts` |
| format.ts | Pure IDR/number formatting (`id-ID` locale, integer rounding) | `src/lib/format.ts` |
| validation.ts | Pure validators (used inconsistently in API routes; client uses inline checks) | `src/lib/validation.ts` |
| ratelimit.ts | Lazy Upstash Ratelimit singletons (global + OCR-specific); `null` if env unset | `src/lib/ratelimit.ts` |
| supabase.ts | Browser singleton `supabase` (anon) + `createServerClient()` (service role) | `src/lib/supabase.ts` |
| OCR route | Gemini 2.5 Flash Lite call with structured `responseSchema`; per-IP OCR limit; one retry on 503 | `src/app/api/ocr/route.ts` |
| Sessions API | Create session; GET joins session+participants+items+assignments | `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts` |
| Items API | POST single/bulk; PATCH, DELETE | `src/app/api/sessions/[id]/items/route.ts`, `…/bulk/route.ts`, `…/[itemId]/route.ts` |
| Participants API | POST single + bulk (handles `23505` unique-violation); DELETE | `src/app/api/sessions/[id]/participants/route.ts`, `…/[participantId]/route.ts` |
| Assignments API | PUT replaces all assignments for one item; stamps `session_id`; validates percentage-sum=100 and unit-sum=item.quantity | `src/app/api/items/[itemId]/assignments/route.ts` |
| ItemCard | Inline edit + assignment dialog with three split modes (equal / percentage / unit) | `src/components/ItemCard.tsx` |
| ParticipantView | Per-participant view: My / Shared / Unclaimed item buckets, claim/unclaim, copy bill | `src/components/ParticipantView.tsx` |
| BillSummary | Owner-side per-participant breakdown with expand + copy | `src/components/BillSummary.tsx` |
| cleanup-sessions | Supabase Edge Function (Deno); daily cron deletes expired sessions | `supabase/functions/cleanup-sessions/index.ts` |

## Pattern Overview

**Overall:** Full-stack Next.js 15 App Router monolith. The browser is effectively a SPA; pages are marked `'use client'` and fetch through co-located Route Handlers, which talk to Supabase Postgres using the service role key. There is no separate backend service.

**Key Characteristics:**
- All pages are client components (`'use client'`) — no Server Components, no Server Actions, no SSR of data. `RootLayout` is the only server component and only carries metadata/font setup.
- Real-time collaboration uses Supabase Realtime `postgres_changes` subscriptions in `useSession` (`src/hooks/useSession.ts`). Every event triggers a full re-fetch via `GET /api/sessions/:id` (re-fetch, not delta-patch).
- All four realtime channels are scoped with `filter: session_id=eq.<id>`. Migration `002_assignments_session_id.sql` added `session_id` to `item_assignments` specifically to enable this filter, and `PUT /api/items/:itemId/assignments` stamps `session_id` on every inserted row.
- State lives exclusively in React hooks (`useState`, `useMemo`, `useCallback`). No Redux, Zustand, or other store.
- Bill calculation is client-side and pure: `calculateParticipantBills` runs on every render via `useMemo` and now supports three split types — `equal`, `percentage`, and `unit` (units-of-the-item, added in migration 003).
- Cross-cutting rate limiting is enforced by `src/middleware.ts` (matcher `/api/:path*`). OCR has an additional, stricter per-IP limiter inside the route. Both are no-ops when Upstash env vars are absent.
- The "AI bill reader" is a fully optional, build-time-gated feature (`NEXT_PUBLIC_OCR_ENABLED`). When enabled, the home page shows a scan button; the route additionally checks `GEMINI_API_KEY` at runtime and returns `OCR_DISABLED` 503 if missing.

## Layers

**Presentation Layer:**
- Purpose: Render UI and handle user interactions
- Location: `src/app/page.tsx`, `src/app/session/[id]/page.tsx`, `src/components/`
- Contains: React components, page layouts, event handlers
- Depends on: Hooks layer, `src/lib/format.ts`
- Used by: Browser

**Hooks Layer:**
- Purpose: Encapsulate async state, API communication, and client-side derived state
- Location: `src/hooks/`
- Contains: `useSession`, `useBillScan`, `useBillCalculation`, `useShareSession`, `useClipboard`
- Depends on: API layer (via `fetch`), `src/lib/supabase.ts` (Realtime only), `src/lib/calculations.ts`
- Used by: Page components

**Edge / Middleware Layer:**
- Purpose: Pre-route rate limiting for every `/api/*` request
- Location: `src/middleware.ts`
- Contains: Upstash sliding-window check, sets `X-RateLimit-*` headers, returns 429 on breach
- Depends on: `src/lib/ratelimit.ts`
- Used by: All API routes implicitly via Next.js middleware

**API Layer:**
- Purpose: Validate input, enforce split-type invariants, perform DB operations using the Supabase service role client
- Location: `src/app/api/`
- Contains: Next.js Route Handlers (`route.ts` exporting `GET`/`POST`/`PUT`/`PATCH`/`DELETE`)
- Depends on: `src/lib/supabase.ts` (`createServerClient()`), `src/types/index.ts`, `src/lib/ratelimit.ts` (OCR route only)
- Used by: Hooks layer (browser fetch) and the share-link participants

**Data / Persistence Layer:**
- Purpose: Store all application data with relational integrity
- Location: Supabase-managed PostgreSQL (external)
- Schema files: `supabase/migrations/001_initial_schema.sql`, `…/002_assignments_session_id.sql`, `…/003_assignments_unit_split.sql`
- Tables: `sessions`, `participants`, `items`, `item_assignments`
- Used by: API layer

**Shared / Utilities:**
- `src/types/index.ts` — All TS interfaces and API request/response types (`Session`, `Item`, `Participant`, `ItemAssignment`, `SplitType`, `ParticipantBill`, `UpdateAssignmentsRequest`, `APIErrorCode`)
- `src/lib/calculations.ts` — Pure split math (equal / percentage / unit)
- `src/lib/format.ts` — IDR/number formatting
- `src/lib/validation.ts` — Reusable validators (currently underused by API routes)
- `src/lib/ratelimit.ts` — Lazy Upstash singletons
- `src/lib/supabase.ts` — Client factory

## Data Flow

### Create Session (manual or AI-scanned)

1. Home `src/app/page.tsx` mounts; user starts with one blank draft item.
2. (Optional, OCR-enabled builds) User taps the scan button → `useBillScan.scan(file)` (`src/hooks/useBillScan.ts`) → `POST /api/ocr`.
3. OCR route (`src/app/api/ocr/route.ts`):
   - Checks `GEMINI_API_KEY` (503 `OCR_DISABLED` if missing).
   - Applies per-IP OCR rate limit (`ocrRatelimit.limit(clientIp)`); returns 429 `RATE_LIMITED` with `Retry-After` if exceeded.
   - Validates the uploaded file (image only, ≤10 MB).
   - Sends the base64 image + prompt to Gemini `gemini-2.5-flash-lite` with a structured `responseSchema`.
   - Retries once on 503 (model overload only, never on 429).
   - Sanitizes the response into `{ items, tax_amount, service_amount }`.
4. Home merges OCR result into the draft form; user reviews/edits.
5. `handleCreateSession` POSTs the totals to `/api/sessions` → row inserted with `expires_at = NOW() + 1 week`.
6. Items are bulk-POSTed to `/api/sessions/:id/items` (array path).
7. Browser navigates to `/session/:id`.

### Session Page Load

1. `useSession(id)` mounts inside `src/app/session/[id]/page.tsx`.
2. `fetchSession()` issues `GET /api/sessions/:id`.
3. The route (`src/app/api/sessions/[id]/route.ts`) checks `expires_at` (returns 410 `SESSION_EXPIRED` if past), then runs three `select *` queries (sessions, participants, items) and a fourth fetch over `item_assignments` filtered by item IDs. Assignments are joined into items in JS.
4. The hook calls `setSession`, `setParticipants`, `setItems`.
5. A Supabase Realtime channel `session:${id}` subscribes to `postgres_changes` on all four tables, each filtered `session_id=eq.<id>`. Any event re-invokes `fetchSession()`.

### Item Assignment (owner)

1. User taps the assign icon in `ItemCard` → assignment dialog opens with three split options:
   - **Equal** — checkbox each participant; saved percentages are `100 / N`.
   - **Custom %** — per-participant percentage inputs; must sum to 100.
   - **By Unit** (disabled when `item.quantity < 2`) — per-participant integer unit counts that must sum to `item.quantity`.
2. `handleSaveAssignment` builds an `AssignmentPayload[]` and calls `updateAssignments` → `PUT /api/items/:itemId/assignments`.
3. The route (`src/app/api/items/[itemId]/assignments/route.ts`):
   - Looks up the item to recover `session_id` and `quantity`.
   - Validates percentage sum (== 100 ± 0.01) and/or unit sum (== `item.quantity`).
   - Deletes existing assignments, then inserts the new rows with `session_id` stamped on each.
4. Realtime fires `postgres_changes` on `item_assignments`.
5. `useSession` re-fetches; `useBillCalculation` recomputes `bills` via `useMemo`.

### Bill Calculation (per assignment)

`src/lib/calculations.ts → calculateParticipantBills`:
- `equal`: `shareAmount = item.price * item.quantity / N`, `sharePercentage = 100 / N`.
- `percentage`: `shareAmount = totalItemPrice * percentage / 100`.
- `unit`: `shareAmount = unit_count * item.price`, `sharePercentage = unit_count / item.quantity * 100`.
- Tax and service are then redistributed pro-rata across participant subtotals; everything is rounded to 2 dp.

### Participant (Shared Link) View

- URL: `/session/:id?participant=Name` resolves to the same `SessionPage` component.
- `currentParticipant` is found case-insensitively in `participants`.
- Renders `ParticipantView` (`src/components/ParticipantView.tsx`) which categorizes items into `myItems` / `sharedItems` / `unclaimedItems` based on the current participant's assignments.
- `handleClaimItem` rewrites the item's assignments as equal-split among the existing participants plus/minus the current one and calls the same `PUT /api/items/:itemId/assignments` flow.
- `handleUpdateShare` switches the split to `percentage` and updates only the current participant's value.

**State Management:**
- No global store. All session state lives in the `SessionPage`'s `useSession` + `useBillCalculation` + `useShareSession` hooks.
- The only React Context is `ToastProvider` (`src/components/Toast.tsx`), wrapped by `Providers` in `src/components/Providers.tsx`.

## Key Abstractions

**Session:**
- Purpose: Top-level container for a bill-splitting event with a 1-week TTL
- Type: `src/types/index.ts → Session`
- Schema: `supabase/migrations/001_initial_schema.sql`

**Item / ItemWithAssignments:**
- Purpose: A line item (`price` is per-unit; `quantity` is integer). `ItemWithAssignments` is the in-memory join the GET route assembles.
- Type: `src/types/index.ts → Item`, `ItemWithAssignments`
- Assembled by: `GET /api/sessions/:id/route.ts` (manual join in JS)

**ItemAssignment (with SplitType):**
- Purpose: Links a participant to an item with a chosen split mode.
- Fields: `split_type: 'equal' | 'percentage' | 'unit'`, nullable `percentage` and `unit_count`, plus a denormalised `session_id` (added in migration 002 for realtime filtering).
- Type: `src/types/index.ts → ItemAssignment`, `SplitType`

**ParticipantBill / ParticipantItem:**
- Purpose: Computed per-person totals with itemized breakdown and proportional tax/service share.
- Type: `src/types/index.ts → ParticipantBill`, `ParticipantItem`
- Computed by: `src/lib/calculations.ts → calculateParticipantBills`

**OCR ExtractedBill (loose, hook-local):**
- Purpose: Result shape returned from `/api/ocr` and consumed by `useBillScan`.
- Type: `src/hooks/useBillScan.ts → ExtractedBill`
- Note: This type is intentionally not in `src/types/index.ts` — it's a narrow boundary between the OCR route and the create-session form.

## Entry Points

**Browser Entry (Home):**
- Location: `src/app/page.tsx`
- Triggers: User visits `/`
- Responsibilities: Manual item entry; optional AI scan (gated by `NEXT_PUBLIC_OCR_ENABLED`); create session and bulk items; redirect to `/session/:id`

**Browser Entry (Session):**
- Location: `src/app/session/[id]/page.tsx`
- Triggers: User visits `/session/:id` (owner) or `/session/:id?participant=Name` (participant)
- Responsibilities: Load session via `useSession`; render owner layout or `ParticipantView` based on the `participant` query

**API Entry (OCR):**
- Location: `src/app/api/ocr/route.ts`
- Triggers: `POST /api/ocr` with `multipart/form-data`
- Responsibilities: Feature gate, OCR rate limit, image validation, Gemini call, response sanitization

**Edge / Middleware:**
- Location: `src/middleware.ts`
- Matcher: `/api/:path*`
- Responsibilities: Sliding-window per-IP rate limit; injects `X-RateLimit-*` headers; returns 429 on breach. Disabled when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are unset.

**App Layout:**
- Location: `src/app/layout.tsx`
- Responsibilities: Metadata, Open Graph + Twitter cards, viewport, Inter font, wraps children in `Providers`

**PWA Manifest:**
- Location: `src/app/manifest.ts`
- Exports a `MetadataRoute.Manifest`; icons reference `/icon-192.png` and `/icon-512.png` (no `public/` directory exists in the repo — icons are not currently bundled).

**Edge Function (out-of-process, Deno):**
- Location: `supabase/functions/cleanup-sessions/index.ts`
- Triggers: Supabase scheduled cron (deploy + schedule manually as documented in the file header)
- Responsibilities: Hard-deletes sessions where `expires_at < now()`; cascade removes participants, items, and assignments

## Architectural Constraints

- **Auth model:** None. Sessions are "public by UUID obscurity" — RLS policies are `FOR ALL USING (true)`. There is no Supabase Auth integration. Access control relies entirely on UUID unguessability and the rate limiter.
- **Runtime:** All API routes run on the default Node.js runtime (none opt into `edge`). The middleware runs on Edge by default. The Supabase Edge Function `cleanup-sessions` runs in Deno and is excluded from TS compilation (`tsconfig.json → exclude: ["supabase/functions"]`).
- **Threading:** Stateless serverless functions; single-threaded Node event loop. The only module-level mutable state is the lazy Upstash singletons in `src/lib/ratelimit.ts` and the browser-side Supabase client in `src/lib/supabase.ts`.
- **Session TTL:** Set to 1 week by the DB default on `sessions.expires_at`. `GET /api/sessions/:id` returns 410 once past expiry; `cleanup-sessions` hard-deletes rows daily.
- **Real-time consistency:** Each Realtime event triggers a full session re-fetch (4 sequential DB queries). Simpler, but cost-inefficient under heavy concurrency.
- **Split rules (server-enforced):** Percentage assignments must sum to 100 ± 0.01. Unit assignments must sum to the item's `quantity`. Mixed split types within one item are accepted by the schema but the validation logic treats `unit` and `percentage` groups independently.
- **Currency:** Hardcoded to IDR throughout the UI (`src/lib/format.ts` uses `Intl.NumberFormat('id-ID')`). No locale abstraction.
- **OCR feature gate:** Build-time `NEXT_PUBLIC_OCR_ENABLED=true` shows the scan UI; runtime `GEMINI_API_KEY` enables the route. Both must be present in production for the scan button to work.

## Anti-Patterns

### Full re-fetch on every Realtime event

**What happens:** Every `postgres_changes` event on `sessions`, `participants`, `items`, or `item_assignments` calls `fetchSession()` in `src/hooks/useSession.ts`, which re-runs `GET /api/sessions/:id` (4 DB queries).
**Why it's wrong:** A single assignment edit re-fetches all session data. With many concurrent participants this cascades — every claim triggers a fan-out re-fetch on every connected client.
**Do this instead:** Apply the delta from the Realtime event payload directly to local state, or subscribe with table-specific handlers that patch only the changed entity.

### Unrestricted PATCH on sessions

**What happens:** `PATCH /api/sessions/:id` (`src/app/api/sessions/[id]/route.ts`) forwards the entire request body to `supabase.update(body)` with no field allowlist.
**Why it's wrong:** Any caller can overwrite any column, including `expires_at`, `status`, and `receipt_image_url`.
**Do this instead:** Explicitly pick allowed fields before update (`{ subtotal, tax_amount, service_amount, grand_total, tax_percentage, service_percentage }`).

### Inconsistent validation surface

**What happens:** `src/lib/validation.ts` provides reusable validators but most API routes inline their own checks (e.g., name-required in `participants/route.ts`, percentage-sum in `assignments/route.ts`) and the home page uses ad-hoc `parseFloat`/`parseInt` guards.
**Why it's wrong:** Rule changes (max name length, max price) have to be made in multiple places.
**Do this instead:** Route every input shape through `src/lib/validation.ts`, or replace it with a schema validator (zod) shared between client and server.

### Manual JS join in GET session

**What happens:** `GET /api/sessions/:id/route.ts` runs four separate `supabase.from(...).select(...)` queries and joins `assignments` into `items` in JS.
**Why it's wrong:** Adds latency vs. a single PostgREST nested `select('*, items(*, item_assignments(*))')`. Also makes it easy to forget the `session_id` filter on a future table.
**Do this instead:** Use Supabase's nested select to fetch the full graph in one round-trip.

## Error Handling

**Strategy:** API routes return `{ error: string, code: APIErrorCode | string }` JSON with appropriate HTTP status. Hooks throw on non-OK responses; pages render inline error/empty states. User-facing failures additionally surface as toasts via `useToast()` (e.g., create-session failure, OCR fallback message).

**Patterns:**
- API routes: `try/catch` returning `NextResponse.json({ error, code }, { status })`. No centralized error middleware.
- OCR route: special handling for Gemini 429 (`GEMINI_QUOTA`) and 503 (`GEMINI_OVERLOADED`, with one in-route retry); JSON-parse failures return `OCR_PARSE_FAILED`.
- Hooks: `apiFetch` in `useSession.ts` reads `body.error` and throws a JS `Error`. `useBillScan.scan` catches and stores `error` plus starts a 6 s cooldown.
- Middleware: returns 429 with `Retry-After` and `X-RateLimit-*` headers.

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.warn` / `console.error` only. No structured logger. The OCR route logs Gemini failures and 503 retries.
**Validation:** Inline per-route on the server; pure validators in `src/lib/validation.ts` are available but underused. Server-side enforces split-type invariants (percentage sum, unit sum).
**Rate limiting:** Edge middleware for all `/api/*` (global 30 / 10 s default), plus an OCR-specific limiter (default 8 / 1 min). Both no-op when Upstash env vars are absent. The client also enforces a 6 s OCR cooldown in `useBillScan` to avoid bursts.
**Authentication:** None. All endpoints unauthenticated.
**Realtime filtering:** Every `postgres_changes` channel uses `filter: session_id=eq.<id>` — enabled by migration `002_assignments_session_id.sql` which denormalised `session_id` onto `item_assignments`.

---

*Architecture analysis: 2026-05-12*

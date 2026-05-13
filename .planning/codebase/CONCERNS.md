# Codebase Concerns

**Analysis Date:** 2026-05-12

Severity-prioritized inventory of technical debt, security risks, performance issues, reliability gaps, and maintainability concerns. Findings cite `file:line` so they are immediately actionable. Recent commits (`43d1f21` AI bill reader, `9b163fa` unit feature) are given extra attention.

Status note vs. previous (2025-05-08) CONCERNS.md: dead-code items (`lru.go`, `eng.traineddata`, `onnxruntime_b`, stale `src/pages/`, `receiptParser.ts`) have been cleaned up. Global rate limiting and a Gemini-specific limiter have been added. `session_id` was backfilled into `item_assignments` so realtime subscriptions now filter server-side. Unit-based splitting was added with quantity-sum validation. The largest remaining risks are RLS, missing API auth/authz, and absent input-schema validation.

---

## CRITICAL severity

### Open Supabase RLS — every row is publicly readable and mutable

- **File:** `supabase/migrations/001_initial_schema.sql:69-79`
- **Issue:** All four tables (`sessions`, `participants`, `items`, `item_assignments`) have policy `FOR ALL USING (true)`. The browser holds `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/lib/supabase.ts:4-6`) which is publicly bundled, so anyone on the internet can `select`/`insert`/`update`/`delete` any row directly via the Supabase REST API — bypassing the Next.js API entirely. Server-side rate limiting (`src/middleware.ts`) does **not** apply to direct Supabase calls.
- **Impact:** Full data exfiltration of every session/bill in the database; anyone can wipe or tamper with any session. Defeats every other authz check in the app.
- **Fix approach:** Either (a) revoke anon-key direct access entirely and route 100% of traffic through Next.js API routes using the service-role key (the app already does this for all writes — see all routes under `src/app/api/`), then change the policies to `USING (false)`; or (b) issue a session-bound HMAC cookie at session creation and check it in RLS via a custom claim. Option (a) is far smaller — the only remaining client-side Supabase usage is realtime `postgres_changes` subscriptions in `src/hooks/useSession.ts:71-100`, and those work over a separate channel that respects RLS independently. After switching off RLS-open policies, the realtime channels also need RLS-compatible policies that allow `SELECT` but no writes for the anon role.

### No authentication or authorization on any API route

- **Files:** every handler under `src/app/api/` — e.g., `src/app/api/sessions/[id]/route.ts:75-105`, `src/app/api/sessions/[id]/items/[itemId]/route.ts:4-34`, `src/app/api/sessions/[id]/participants/[participantId]/route.ts:4-31`, `src/app/api/items/[itemId]/assignments/route.ts:5-103`
- **Issue:** Any caller who knows (or guesses) a session UUID can mutate every aspect of that session. There is no per-session token, no owner cookie, no shared-secret link, and no rate limit binding mutations to a specific actor. The "share by link" model relies entirely on UUID secrecy.
- **Impact:** A leaked screenshot or copy/paste of a URL gives an attacker total control over that session — including renaming items to change prices, deleting other participants, and reassigning bills to themselves.
- **Fix approach:** On session create, set a signed HTTP-only cookie containing the session id (owner) and a participant-claim token. Require the cookie or a `?token=` query param for any mutating route. Allow `GET` to remain link-shareable but gate `POST`/`PATCH`/`PUT`/`DELETE`. Add a server-side check that participants can only mutate their own claims in `src/app/api/items/[itemId]/assignments/route.ts`.

### Mass-assignment vulnerability on session PATCH and item PATCH

- **Files:**
  - `src/app/api/sessions/[id]/route.ts:82-89` — `supabase.from('sessions').update(body)` forwards the entire request body.
  - `src/app/api/sessions/[id]/items/[itemId]/route.ts:11-17` — `supabase.from('items').update(body)` forwards the entire request body.
- **Issue:** A malicious caller can set any column the schema permits: `expires_at` (extend session indefinitely), `status`, `session_id` (move an item between sessions), `created_at`, `subtotal`/`grand_total` (desync totals from item rows), `receipt_image_url`. No allowlist, no zod schema.
- **Impact:** Data integrity corruption; ability to extend abandoned sessions forever (storage growth); potential to insert XSS payloads into `receipt_image_url` if it ever gets rendered as a URL.
- **Fix approach:** Allowlist the columns explicitly per route. For sessions PATCH, accept only `{ subtotal, tax_amount, service_amount, grand_total, tax_percentage, service_percentage }`. For items PATCH, accept only `{ name, price, quantity }`. Validate types with zod and reject unknown keys.

---

## HIGH severity

### Race condition: assignment update is delete-then-insert, not atomic

- **File:** `src/app/api/items/[itemId]/assignments/route.ts:67-88`
- **Issue:** The PUT handler runs `delete().eq('item_id', itemId)` then `insert(rows)` as two separate Supabase calls. If the insert fails (network, validation, 5xx), the previous assignments are already gone — the item is left silently unassigned. There is no rollback, no error-recovery path, and no transaction.
- **Impact:** Data loss under partial failure. With participant-mode UI (`src/components/ParticipantView.tsx:57-67`) calling this on every claim/unclaim, the surface area is large. Concurrent claims by two participants on the same item can also race: both pass the unit-sum check independently against stale reads.
- **Fix approach:** Wrap delete+insert in a Postgres function (RPC) so it executes inside a single transaction. Alternatively, switch to `upsert` keyed on `(item_id, participant_id)` plus an explicit delete of rows not in the new set. Add a `SELECT ... FOR UPDATE` against the item to serialize concurrent claims.

### Concurrent claims by multiple participants can corrupt assignments

- **Files:**
  - `src/app/session/[id]/page.tsx:117-173` — `handleClaimItem` and `handleUpdateShare` build the new assignment list from a possibly-stale local `items` snapshot, then PUT the whole list.
  - `src/app/api/items/[itemId]/assignments/route.ts:67-88` — full replace semantics.
- **Issue:** Participant A and Participant B view the same item with no current assignments. Both click "Claim" within the same realtime debounce window. Each computes a new assignment list locally that contains only themselves (since the other has not yet been broadcast). Whichever PUT lands second wins, overwriting the first claim.
- **Impact:** Silently lost claims; "ghost" claims that appear and then disappear; user confusion about who owes what.
- **Fix approach:** Have the client send **deltas** (`addParticipant`/`removeParticipant`) rather than replacing the full set. Server-side: read the current assignments, apply the delta, write — all in one DB function. Or add optimistic-concurrency via an `assignments_version` column on `items`.

### Realtime channel re-fetches the entire session on every event

- **File:** `src/hooks/useSession.ts:71-100`
- **Issue:** On any `postgres_changes` event for `sessions`, `participants`, `items`, or `item_assignments`, the hook calls `fetchSession()` which hits `GET /api/sessions/${id}` — pulling the whole session, all participants, all items, and all assignments. For a session with 30 items being actively edited, every keystroke that triggers a save will broadcast → re-fetch the entire payload to every connected client. This will not scale beyond a handful of concurrent users per session, and bursts compound exponentially as participants edit shares.
- **Impact:** Bandwidth waste, DB load, perceived lag. Free-tier Supabase will throttle quickly under load.
- **Fix approach:** Use the payload from `postgres_changes` events to apply targeted state patches (e.g., `setItems((prev) => prev.map(...))`) instead of refetching everything. Debounce writes (`TaxServiceInput`, share-percentage inputs) client-side before the PATCH call. Coalesce in-flight refetches with an AbortController.

### Realtime + state divergence: components hold local form state that doesn't reconcile with remote updates

- **Files:**
  - `src/components/ItemCard.tsx:43-62` — `selectedParticipants`, `percentages`, `unitCounts` are initialized from `assignments` on mount only.
  - `src/components/TaxServiceInput.tsx:18-39` — local `subtotal`/`taxAmount`/`serviceAmount` reset only when `session.subtotal`/`tax_amount`/`service_amount` change.
- **Issue:** If a remote update arrives while the user is in the middle of editing an assignment dialog or a tax field, their unsaved local input may be silently overwritten (or, worse, retained and then save back stale values). `ItemCard` initialization is one-shot — it never re-syncs with `assignments` after the user opens the editor.
- **Impact:** Lost edits in collaborative scenarios; assignments that "snap back" unexpectedly.
- **Fix approach:** Show a "remote changes detected — discard your edits and reload?" prompt when remote state diverges from the snapshot the user started editing against. Or lock the row optimistically while editing.

### `useSession` makes 3 sequential queries instead of one (N+1 lite)

- **File:** `src/app/api/sessions/[id]/route.ts:32-55`
- **Issue:** The GET handler runs four serial queries: session, participants, items, then assignments. Plus an in-memory join. For a long-polled session re-fetched on every realtime event (per HIGH item above), this is amplified.
- **Impact:** Latency that scales linearly with payload size; visible in the loading skeleton on every realtime tick.
- **Fix approach:** Use a single Supabase query with nested selects: `supabase.from('sessions').select('*, participants(*), items(*, item_assignments(*))').eq('id', id).single()`. One round trip; Postgres does the join.

### Gemini OCR has no image-content validation and no per-IP daily cap

- **File:** `src/app/api/ocr/route.ts:62-181`
- **Issue:** The endpoint accepts any image ≤ 10 MB and forwards it to Gemini. There is a per-IP minute-window limit (`src/lib/ratelimit.ts:11-12`, 8/min) but no daily cap. An attacker behind a single IP can burn the full free-tier daily quota (~1000 RPD) in 2 hours; a rotating-IP botnet can drain it in minutes. The Gemini key is server-only (correctly named `GEMINI_API_KEY` per `src/app/api/ocr/route.ts:64` and `.env.example:12`), so it cannot be stolen — but the quota can be exhausted, denying service to legitimate users.
- **Impact:** Quota DoS. App degrades to manual-entry (which is graceful: `src/hooks/useBillScan.ts:62` falls back), but the user experience suffers.
- **Fix approach:** Add a second Upstash bucket (`ocrDailyRatelimit`, 30 requests per 24h per IP). Optionally require a session id in the request body and bind quota to session ownership (post-auth). Add a global daily counter and short-circuit when ≥ 80% of free tier consumed.

### OCR result drives untrusted data straight into a form with no length cap on item count

- **Files:**
  - `src/app/api/ocr/route.ts:39-52` — `sanitiseItems` clamps name length and rejects bad rows but does not cap **array length**.
  - `src/app/page.tsx:54-66` — directly maps `result.items` to React state.
- **Issue:** A crafted prompt-inject or a degenerate receipt could return thousands of items. The client will render every one in the form. The follow-up `POST /api/sessions/${id}/items` (`src/app/api/sessions/[id]/items/route.ts:13-35`) inserts all of them at once with no row-count limit.
- **Impact:** Browser tab unresponsiveness; Supabase row explosion; potential to wedge the DB if combined with session-creation spam.
- **Fix approach:** Cap `sanitiseItems` output at e.g. 100 items. Validate item-array length in both API routes (`items/route.ts` POST, `items/bulk/route.ts:19-24`).

### No input schema validation — anywhere

- **Files:** every API route (e.g., `src/app/api/sessions/[id]/items/route.ts:11`, `src/app/api/sessions/[id]/participants/route.ts:10-11`, `src/app/api/items/[itemId]/assignments/route.ts:12`)
- **Issue:** Handlers `JSON.parse` the body and either pass it straight to Supabase or do ad-hoc field checks. `zod`/`valibot`/`yup` is not in `package.json`. Types like `UpdateAssignmentsRequest` (`src/types/index.ts:86-93`) are compile-time only and do nothing at runtime.
- **Impact:** Malformed payloads become 500s with stack traces in logs (or Supabase errors that leak schema info via `error.message`, see e.g. `src/app/api/sessions/[id]/items/route.ts:28`). Type confusion can bypass checks (e.g., a string `percentage` of "100" passes the `Math.abs(total - 100) > 0.01` numeric check because of coercion).
- **Fix approach:** Add `zod`. Define schemas alongside `src/types/index.ts`. Wrap each handler with `schema.safeParse(body)` and return a clean 400 on failure.

### Session expiry only enforced on GET, not on mutations

- **File:** `src/app/api/sessions/[id]/route.ts:26-32` (only place that checks `expires_at`)
- **Issue:** PATCH on `/api/sessions/[id]`, POST on `/api/sessions/[id]/items`, `/items/bulk`, `/participants`, and PUT on `/api/items/[itemId]/assignments` never check session expiry. An attacker can keep an "expired" session alive forever by writing to it.
- **Impact:** The cleanup function `cleanup_expired_sessions` (`supabase/migrations/001_initial_schema.sql:88-97`) only runs on demand and only deletes rows where `expires_at < NOW()`. Combined with mass-assignment on PATCH (CRITICAL above), an attacker can also set `expires_at` to year 2999.
- **Fix approach:** Extract the expiry check into a shared helper in `src/lib/supabase.ts` (or new `src/lib/session-guard.ts`) and call it at the top of every mutating route. Remove `expires_at` from the allowed update fields.

---

## MEDIUM severity

### Item subtotal/grand_total never recomputed server-side

- **Files:**
  - `src/app/page.tsx:105-141` — client computes `subtotal`, `grandTotal`, `taxPct`, `servicePct` and POSTs them.
  - `src/components/TaxServiceInput.tsx:56-71` — client recomputes and PATCHes them.
  - `src/app/api/sessions/route.ts:10-22` and `src/app/api/sessions/[id]/route.ts:82-89` — server accepts whatever the client sends.
- **Issue:** The session's `subtotal`/`grand_total`/`tax_percentage`/`service_percentage` are derived values, but they are stored as authoritative columns and trusted from the client. Adding/removing items via `POST /api/sessions/[id]/items` does **not** trigger a recompute — they desync immediately. The bill-summary UI (`src/components/BillSummary.tsx`) and participant calculations (`src/lib/calculations.ts:72-88`) use `session.tax_amount` and `session.service_amount` directly, so a wrong `subtotal` makes proportional shares wrong.
- **Impact:** Bills don't add up after any item edit. Users see numbers they can't reconcile.
- **Fix approach:** Either (a) compute these from `items` on every read (drop the columns), or (b) add a Postgres trigger on `items` insert/update/delete that recomputes the session row. Option (a) is simpler and removes a class of bugs.

### Equal-split is implemented as percentage-split, not true equal-share

- **File:** `src/app/session/[id]/page.tsx:128-139` (and `:143-149`), `src/components/ItemCard.tsx:154-158`
- **Issue:** When a participant claims an item via `handleClaimItem`, every existing assignment is rewritten with `split_type: 'equal'` and `percentage: 100 / N`. This works arithmetically but conflates the two split types — when the SQL filter `split_type = 'percentage'` is used (e.g., in future migrations or analytics), equal splits will incorrectly be excluded; conversely the percentage-sum validation in `src/app/api/items/[itemId]/assignments/route.ts:31-40` checks only `split_type === 'percentage'`, so a malformed equal split with wrong percentages would not be caught.
- **Impact:** Latent correctness bug; brittleness to future split-type additions (unit was added this way and works because unit has its own branch, but the pattern is fragile).
- **Fix approach:** For `equal` splits, store `percentage: null` and compute the share from `assignments.length` in `src/lib/calculations.ts` (the calc code already handles this in the `else` branch at line 47-50). Pick one representation.

### `useSession` `fetchSession` and the realtime callback have no in-flight coalescing

- **File:** `src/hooks/useSession.ts:47-67, 71-100`
- **Issue:** Each `postgres_changes` event triggers a full `fetchSession`. A burst of N writes ⇒ N parallel GET requests, all of which `setIsLoading(true)` and race for the final `setSession`. Out-of-order completions can flicker the UI briefly back to a stale state. There is also no `AbortController` — an unmount during a burst can update state on an unmounted component (React 18 mostly hides this but still wastes work).
- **Impact:** Bandwidth amplification (3-4x on bursty sessions), occasional UI flicker, console warnings under StrictMode.
- **Fix approach:** Coalesce with `useRef` for an in-flight controller and a "pending refetch" boolean; cancel previous via `AbortController`; only set state if `fetchVersion` matches.

### No server-side cap on items per session or participants per session

- **Files:**
  - `src/app/api/sessions/[id]/items/route.ts:13-35` — bulk insert accepts arbitrary array length.
  - `src/app/api/sessions/[id]/items/bulk/route.ts:19-24` — only rejects empty arrays.
  - `src/app/api/sessions/[id]/participants/route.ts:14-44` — bulk insert accepts arbitrary array length.
- **Issue:** A single request with `{ items: [...10_000_items] }` will attempt to insert all of them. Supabase will probably fail at the payload-size limit, but the partial state and 500 are ugly.
- **Impact:** Resource abuse vector; bad UX on accidental large pastes.
- **Fix approach:** Cap at 200 items / 50 participants per request. Reject with 413 (Payload Too Large) above that.

### Unit-count typing mismatch could clip multi-quantity unit splits

- **File:** `src/app/api/items/[itemId]/assignments/route.ts:44-65`
- **Issue:** The unit-sum check uses strict equality `totalUnits !== item.quantity`. `item.quantity` comes from Postgres as a JS number; `a.unit_count` comes from JSON. Both should be integers per the migrations (`003_assignments_unit_split.sql:6-7` is `INTEGER`, `001_initial_schema.sql:42` is `INTEGER`), so equality should hold — but the validation accepts non-integer `unit_count` floats (no `Number.isInteger` check). A client could send `unit_count: 1.0000001` and break the sum check, or send `unit_count: 0.5` to claim a half-unit (which the DB would store as 1 after rounding via `INTEGER`, silently changing the value).
- **Impact:** Unit splits can silently round; sum validation can be evaded.
- **Fix approach:** Add `Number.isInteger(a.unit_count)` to the `badUnits` check (`src/app/api/items/[itemId]/assignments/route.ts:46-48`). Better: validate the entire `UpdateAssignmentsRequest` with zod.

### Calculations have no tests for unit-split branch

- **Files:** `src/lib/calculations.test.ts` (covers `equal` and `percentage` only, lines 59-149); `src/lib/calculations.ts:40-50` (unit branch).
- **Issue:** The unit-split path is the newest code (commit `9b163fa`) and the only one with no test coverage. Rounding edge cases (e.g., `unit_count = 3` of a `quantity = 7` item at `price = 100/3`) are unverified.
- **Impact:** Unknown bugs in production for the most recently added user-facing feature.
- **Fix approach:** Add unit-split test cases to `src/lib/calculations.test.ts` mirroring the existing patterns. Cover: even split, uneven, rounding loss, mixed split types on different items.

### OCR cooldown is client-side only and reset on tab refresh

- **File:** `src/hooks/useBillScan.ts:5, 28-41, 67`
- **Issue:** The 6-second cooldown is enforced purely in React state and disappears on reload. The Upstash limiter (`src/lib/ratelimit.ts:11-12`) is the real backstop, but a user who refreshes after each scan bypasses the cooldown and hits the network limiter — which returns a less-friendly error than the cooldown UI would.
- **Impact:** Minor UX inconsistency. Not a real abuse vector because the server limiter still gates.
- **Fix approach:** Persist the cooldown timestamp in `sessionStorage` so it survives reload.

### `assignments: any[]` and other escape hatches

- **Files:**
  - `src/app/api/sessions/[id]/route.ts:47` — `let assignments: any[] = [];`
  - `src/app/api/sessions/[id]/items/route.ts:15` — `body.items.map((item: any) => ...)`
- **Issue:** `any` defeats `strict: true` (`tsconfig.json:6`) at exactly the boundary where type safety matters most — untyped network input.
- **Impact:** Type confusion bugs slip past the compiler.
- **Fix approach:** Replace with the proper row types from `src/types/index.ts` and run input through zod first.

### `useShareSession` is exported but unused

- **Files:** `src/hooks/useShareSession.ts` defines a hook; `src/app/session/[id]/page.tsx:47` imports `copyShareUrl, copied` from it but never references them (the actual share UI lives in `src/components/ShareModal.tsx`, which has its own `handleCopy`).
- **Issue:** Dead-but-wired-up code. Two implementations of "copy share URL" coexist.
- **Impact:** Maintenance friction; bigger bundle.
- **Fix approach:** Either delete `useShareSession.ts` and `useClipboard.ts`, or refactor `ShareModal.tsx` to use them. Pick one and remove the other.

---

## LOW severity

### `next.config.js` is empty

- **File:** `next.config.js:1-4`
- **Issue:** No security headers, no image domains configured, no `experimental` flags, no `output: 'standalone'` (despite a `Dockerfile` being present). The Docker build will pull a full `.next` output rather than the optimized standalone bundle.
- **Fix approach:** Add at minimum:
  - `output: 'standalone'` for Docker.
  - `headers()` for `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
  - `images.remotePatterns` if/when receipt images get stored.

### `tsconfig.json` strictness can be tighter

- **File:** `tsconfig.json:2-19`
- **Issue:** `strict: true` is on but `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are off. `participantBill = bills.find(...)` returns `T | undefined` correctly thanks to default rules, but `assignments[0]` etc. across components is typed as `T` rather than `T | undefined`.
- **Fix approach:** Turn on `noUncheckedIndexedAccess` and fix the resulting type errors.

### Toast ID generation is collision-prone

- **File:** `src/components/Toast.tsx:40` — `Math.random().toString(36).substring(2, 9)`
- **Issue:** ~7 chars of base-36 entropy (~36^7 ≈ 8e10). Tiny collision probability in practice but `crypto.randomUUID()` is already used elsewhere (`src/app/page.tsx:19`) and is collision-free.
- **Fix approach:** Use `crypto.randomUUID()`.

### Stale planning markdown files at repo root

- **Files:** `future_plan.md`, `plan.md`, `tech_plan.md`, `task_breakdown.md` (all in repo root, last touched April 30 per `ls -la`).
- **Issue:** These predate `.planning/codebase/` and have overlapping/contradictory content. New contributors don't know which is canonical.
- **Fix approach:** Move them into `.planning/archive/` or delete; treat `.planning/codebase/` as the single source of truth.

### Missing README.md

- **File:** repo root (no README detected; `Read README*` returned no matches).
- **Issue:** No setup instructions, no env-var reference, no architecture pointer, no Docker instructions. Onboarding requires reading `.env.example` plus 9 source files to understand what runs where.
- **Fix approach:** Add a one-page `README.md` with: prerequisites, `npm install`, env-var checklist (point at `.env.example`), `npm run dev`, `npm run test`, Supabase migrations path, and a one-line link to `.planning/codebase/ARCHITECTURE.md`.

### Hard-coded magic constants

- **Files:**
  - `src/app/api/ocr/route.ts:101` — `10 * 1024 * 1024` file-size cap.
  - `src/app/api/ocr/route.ts:130` — `1500 + Math.random() * 500` retry jitter.
  - `src/hooks/useBillScan.ts:5` — `COOLDOWN_MS = 6_000`.
  - `supabase/migrations/001_initial_schema.sql:11` — `INTERVAL '1 week'` session expiry.
- **Issue:** No central config; expiry, cooldown, max-file-size, and retry timing are sprinkled.
- **Fix approach:** A `src/lib/config.ts` module exporting tunables from `process.env` with sensible defaults.

### `participants` prop on `useShareSession` is declared but `participants` arg unused in `useSession`'s `removeParticipant` chain

- **File:** `src/app/session/[id]/page.tsx:42-47` — imports `copyShareUrl, copied` from `useShareSession` then never uses them.
- **Fix approach:** Run `next lint` with `noUnusedLocals: true` to surface these.

### Type duplication: `AssignmentPayload` and `UpdateAssignmentsRequest['assignments'][number]` are functionally identical

- **Files:** `src/components/ItemCard.tsx:7-12`; `src/types/index.ts:86-93`.
- **Issue:** Two near-identical interfaces drift over time. The `ItemCard` version is a UI-internal alias and the global one is the API contract.
- **Fix approach:** Export a single canonical type from `src/types/index.ts` and re-export from `ItemCard` if needed.

### Coverage threshold not enforced

- **File:** `vitest.config.ts` (no `coverage.thresholds` configured).
- **Issue:** `npm run test:coverage` reports coverage but never fails. CI (when added) will not catch regressions.
- **Fix approach:** Add `coverage.thresholds: { lines: 60, functions: 60, branches: 50 }` and ratchet up.

---

## Documentation gaps

- **No README.md** (see LOW severity above).
- **Env vars are partially documented.** `.env.example:1-23` covers Supabase + Gemini + Upstash but does not mention `NEXT_PUBLIC_APP_URL` requirement for OG meta or share URLs in non-localhost deployments. Also, `UPSTASH_OCR_RATELIMIT_REQUESTS` / `UPSTASH_OCR_RATELIMIT_WINDOW` are read by `src/lib/ratelimit.ts:11-12` but not listed in `.env.example`.
- **No migration runbook.** `supabase/migrations/` has three SQL files but no instructions on order or how to apply them in a managed Supabase project. The comment in `002_assignments_session_id.sql:1-2` says "Apply this migration BEFORE deploying code…" but there is no documented enforcement.
- **`docker-compose.yml` and `Dockerfile` exist but no instructions** on how they are meant to be used (development? production?). The empty `next.config.js` (no `output: 'standalone'`) suggests the Dockerfile may produce a sub-optimal image.

---

## Quick wins (recommended order)

1. **Lock down RLS.** Change all four policies from `FOR ALL USING (true)` to `FOR ALL USING (false)` once you verify no client-side Supabase write paths exist outside `useSession.ts:71-100` (realtime SELECTs work via a separate path). (`supabase/migrations/`) — **biggest security win for ~10 min of work**.
2. **Allowlist update fields** in `src/app/api/sessions/[id]/route.ts:82-89` and `src/app/api/sessions/[id]/items/[itemId]/route.ts:11-17`. (30 min)
3. **Add zod and validate every API body.** Start with `UpdateAssignmentsRequest` since it's the most-called mutation. (2 hr)
4. **Replace delete-then-insert with a transactional RPC** in `src/app/api/items/[itemId]/assignments/route.ts:67-88`. (1-2 hr)
5. **Add unit-split tests** to `src/lib/calculations.test.ts`. (30 min)
6. **Add a daily OCR rate-limit bucket** in `src/lib/ratelimit.ts`. (30 min)
7. **Compute session totals server-side** instead of trusting the client — either remove the columns or add a trigger. (2-3 hr; biggest correctness win)
8. **Write a README.md.** (1 hr)

---

## Out of scope for this map

- Detailed performance profiling (requires running app + traces).
- Threat modeling beyond the obvious (no formal STRIDE pass).
- Accessibility audit of UI components.
- Bundle-size audit (no analyzer run).
- Dependency CVE audit (`npm audit` not run during this map).

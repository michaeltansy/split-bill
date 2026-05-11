# Codebase Concerns — split-bill

Severity-prioritized inventory of technical debt, risks, and gaps. Findings cite file paths so they're actionable.

---

## HIGH severity

### Security

- **No auth on any API route.** All routes under `src/app/api/` (sessions, items, ocr) are publicly callable. Anyone with a session id can read/mutate the session. There is no rate limiting, no API key, and no session-bound auth check.
- **Supabase RLS is fully open.** `supabase/migrations/001_initial_schema.sql:70-79` defines policies as `FOR ALL USING (true)` for `sessions`, `participants`, `items`, and `item_assignments`. RLS provides no protection — every row is readable and mutable by any client with the anon key. The anon key is required to be in the browser bundle (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so this is internet-exposed.
- **Mass-assignment vulnerability on item update.** `src/app/api/sessions/[id]/items/route.ts` PATCH handler appears to forward request body fields directly into `supabase.from('items').update(body)`. Without a field allowlist, callers can mutate `session_id`, `created_at`, prices, names — anything the column set permits.
- **Gemini API key surface.** OCR route uses a server-side Gemini key. Confirm `GOOGLE_API_KEY` (or equivalent) is **not** prefixed with `NEXT_PUBLIC_` in `.env.example`. If it ever leaks into the client bundle, attackers can run free OCR on the user's quota.
- **No request validation / schema check.** API routes parse JSON without zod/valibot/yup. Malformed payloads may surface as 500s instead of 400s, and untyped values reach the DB.

### Reliability

- **Realtime subscription has no session filter.** The `item_assignments` realtime channel (in `src/hooks/useSession.ts`) subscribes globally — every connected client receives every assignment change for every session. This is both a privacy leak and a scale issue. Filter on `session_id` server-side via channel filter, not client-side filtering after broadcast.
- **Non-atomic assignment update.** Updating who claims an item is implemented as `delete` then `insert`. If insert fails after delete succeeds, the assignment is silently lost. Wrap in a Supabase transaction or use `upsert` with a unique constraint.
- **Race condition on concurrent claims.** Two participants claiming the same item concurrently can both succeed because no DB-level uniqueness constraint enforces "one assignment per item per participant" or "split-share sums to 1." Add a unique index and/or a check constraint.
- **No retry / no error boundary on Gemini OCR.** OCR is the highest-latency, most failure-prone external call. Failures bubble straight to the user with no exponential backoff and no fallback (e.g., manual entry mode).

### Missing functionality

- **Receipt image upload is not implemented.** The `sessions` schema and types support a receipt image, but there is no actual upload to Supabase Storage. OCR currently reads from a transient blob/base64. Users cannot revisit a session and view the original receipt.
- **Session expiry is enforced inconsistently.** GET routes check expiry; PATCH/POST mutating routes do not. Expired sessions can still be mutated.
- **Zero automated tests.** No tests for any API route, hook, or component. `vitest.config.ts` exists but no `*.test.ts` / `*.spec.ts` files. Critical paths (OCR parsing, tax/service calculation, share rounding) are unverified.

---

## MEDIUM severity

### Performance

- **OCR result not cached.** Re-uploading the same image re-hits Gemini. Cache by image hash (sha256) keyed in Supabase or in-memory.
- **Realtime broadcast storm potential.** Even after fixing the session filter, broadcasting on every keystroke / every share-fraction change will be noisy. Debounce mutations client-side before write.
- **Bundle size unaudited.** Next.js bundle includes Supabase client, Gemini SDK (server-only ideally), Tesseract artifact (`eng.traineddata`, 5 MB at repo root — see "dead code"), and a QR library. Run `next build` with bundle analyzer.

### Maintainability

- **`future_plan.md`, `plan.md`, `tech_plan.md`, `task_breakdown.md`** all live at repo root with overlapping content. These should be consolidated into `.planning/` or removed — they confuse new contributors about which is canonical.
- **Type duplication.** Domain types (Session, Item, Participant, Assignment) are likely re-declared in multiple component files. Centralize in `src/types/` or generate from Supabase schema with `supabase gen types`.
- **Inline magic numbers.** Tax/service percentages, expiry windows, share rounding precision — confirm these aren't sprinkled across components.

### Reliability

- **No structured logging.** API routes likely use bare `console.error`. Production debugging will be difficult without request ids and consistent log shape.
- **No CI.** No `.github/workflows/`, no test/lint/build automation. Every commit goes to main without checks.

---

## LOW severity

### Dead code / accidental commits

- **`src/hooks/lru.go`** — A Go LeetCode solution committed to a Next.js project. Has nothing to do with the app and may not even compile. Delete.
- **`eng.traineddata`** (~5 MB at repo root) — Tesseract English language pack. The codebase migrated to Gemini for OCR; Tesseract is no longer used. Delete and add to `.gitignore`.
- **`onnxruntime_b`** (root) — Looks like a stray symlink or binary from an abandoned ONNX-based OCR experiment. Delete after confirming.
- **`src/lib/receiptParser.ts`** is shown as deleted in git status but the deletion isn't yet committed — finalize that.
- **`src/pages/`** appears as untracked (per git status) — Next.js app router uses `src/app/`. If `src/pages/` is empty or stale, remove it to avoid Next.js mode confusion (mixing pages and app router can cause silent routing bugs).

### Config

- **`.env.example` modified but not reviewed here.** Verify all required env vars are listed and correctly prefixed (`NEXT_PUBLIC_` only for client-safe values).
- **`tsconfig.json` modified.** Confirm `strict: true` and that `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` are considered.

### Dependencies

- **No dependency audit visible.** Run `npm audit` and pin Next.js / React / Supabase to known-good majors. The migration from Tesseract → Gemini may have left unused deps in `package.json`.

---

## Quick wins (suggested order)

1. Delete `lru.go`, `eng.traineddata`, `onnxruntime_b`, stale `src/pages/`. (5 min)
2. Add zod schemas for API request bodies; reject unknown keys. (1–2 hr)
3. Filter realtime subscription by `session_id`. (30 min)
4. Wrap assignment update in a Supabase transaction or convert to `upsert`. (1 hr)
5. Tighten RLS: at minimum, scope `sessions` reads/writes to rows whose `id` matches a header/cookie token issued at session creation. Full auth is bigger.
6. Add a smoke test for the OCR → parse → save flow. (2–3 hr)

---

## Out of scope for this map

- Detailed performance profiling (requires running app + traces).
- Threat modeling beyond the obvious (no STRIDE pass done here).
- Accessibility / a11y audit of UI components (separate review).

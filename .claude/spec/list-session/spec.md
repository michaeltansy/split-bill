# My Sessions — Per-User Session List Tech Plan

## Context

Auth (Google SSO) landed in the previous phase. Sessions created while signed in are
now stamped with `created_by = auth.uid()` (migration `006`), but there is **no way
for a user to find their own sessions** — once you navigate away, the only path back
is the original share link. The `created_by` column was added precisely to enable
this "My Sessions" view (auth spec Q2, deferred to here).

This phase builds the list and the management actions around it: a signed-in user can
see the sessions they created (split into **Active** and **Expired** tabs), jump back
into any of them, and **soft-delete** ones they no longer need (with Undo). The session
page itself gains **owner-only affordances** now that ownership is queryable.

### What stays the same
- Participants remain anonymous; this is a **creator-only** feature, reachable only
  behind the existing auth gate.
- The session detail page (`/session/[id]`) stays publicly reachable by link; the list
  links into it, and the new owner controls are additive (hidden for non-owners/anonymous).
- Pre-auth / anonymous sessions (`created_by = null`) are owned by no one and never
  appear in any user's list. Matches the auth spec's "no backfill" decision.
- RLS stays `USING (true)` (auth spec Q1 deferred). All authorization for the new
  read/delete/restore/close actions is enforced **in the handler**, scoped to `auth.uid()`.

## Requirements

1. New authenticated page **`/sessions`** ("My Sessions") listing the signed-in user's
   sessions (`created_by = user id`, not soft-deleted), ordered by `created_at` descending.
2. The page requires an authenticated user; unauthenticated visitors are redirected to
   `/login?redirect=/sessions` (same guard pattern as `/`).
3. The list has **two tabs: "Active" and "Expired"** (no per-tab counts in the labels).
   - **Active** = `expires_at >= now()` AND `status = 'active'`.
   - **Expired** = `expires_at < now()` OR `status IN ('expired','completed')`. A **closed**
     (completed) session lives here too — completed and expired are unified into one tab.
4. **Cursor pagination, 10 rows per page per tab.** When a tab has more than 10 sessions,
   a **"Load more"** action fetches the next page using the oldest visible `created_at` as
   the cursor. No page-number UI.
5. New endpoint **`GET /api/sessions`** returning the user's sessions for a given tab +
   cursor. `401 { code: 'UNAUTHENTICATED' }` when there is no session.
6. Each row shows: created date, grand total (formatted IDR), status badge, and
   participant count. The whole row links to `/session/[id]`.
7. **Soft-delete from the list, with confirmation and Undo.** A per-row delete control
   opens a confirm dialog; confirming calls an owner-scoped `DELETE /api/sessions/[id]`
   that sets `deleted_at = now()` (no row removal), removes the row locally, and shows an
   **Undo** toast that restores it (`deleted_at = null`) if tapped.
8. **Owner-only affordances on the session page** (when signed-in user is `created_by`):
   an **"Owned by you"** marker, **Close session** (mark `status = 'completed'`), and
   **Delete session** (confirm → soft-delete → redirect to `/sessions`). Hidden for
   non-owners and anonymous visitors.
9. All owner-scoped queries (list, delete, restore, close) are filtered server-side by
   `created_by = <verified user id>`, taken from the verified session — never from a
   request param or body.
10. A navigation entry point: `AccountMenu` gains a **"My Sessions"** link.
11. An empty state per tab (e.g. "No active sessions yet" with a link to `/`).
12. Soft-deleted sessions are inaccessible everywhere: `GET /api/sessions/[id]` returns
    `404` for a session with `deleted_at` set (so a shared link to a deleted session 404s
    for participants too), until restored.

## Non-Requirements

- No dedicated "Trash" page/tab to browse soft-deleted sessions — recovery is only via the
  immediate Undo toast in this phase (browsing/restoring later is a future surface).
- No rename / duplicate of sessions.
- No bulk selection/delete — one row at a time.
- No search or free sort; order is fixed newest-first within each tab.
- No page-number pagination — cursor "Load more" only.
- No third "Closed/Completed" tab — completed folds into Expired.
- No real-time updates on the list — it reflects state at page load (plus local mutation).
- No widening of the public/anonymous edit model: existing open per-item/per-participant
  flows are unchanged. Only **status changes**, **soft-delete**, and **restore** become
  owner-gated (new actions).
- No browsable "Trash" surface and no re-opening a closed session — recovery is the Undo
  toast only, and Close is one-way.

## Architecture & Data Flow

```
[Browser] GET /sessions  (RSC page, server-guarded)
  -> createServerComponentClient(cookies).auth.getUser()
  -> no user? redirect('/login?redirect=/sessions')
  -> user? render <SessionListTabs> (initial Active page from a shared helper)

Tab switch / Load more (client):
  GET /api/sessions?tab=active|expired&cursor=<created_at?>
    -> verify user (getUser)
    -> service-role query: .eq('created_by', user.id).is('deleted_at', null)
       + tab filter + .order('created_at', desc) + (.lt('created_at', cursor)) + .limit(11)
    -> { sessions, next_cursor }

Soft-delete (list row OR session page):
  DELETE /api/sessions/[id]
    -> verify user; UPDATE sessions SET deleted_at = now()
       WHERE id = :id AND created_by = user.id AND deleted_at IS NULL  (RETURNING id)
    -> 0 rows? 404 (not owner / not found / already deleted — indistinguishable)

Undo (toast):
  PATCH /api/sessions/[id] { deleted_at: null }   (owner-gated; only null accepted)

Close (session page, owner):
  PATCH /api/sessions/[id] { status: 'completed' } (owner-gated)
```

The owner rule is uniform: **every owner-scoped query is filtered by
`created_by = <verified auth.uid()>`, derived server-side.** The initial `/sessions`
render uses a shared `listSessionsForUser(...)` helper (no self-fetch); the same helper
backs `GET /api/sessions` for tab switches and "Load more".

## Data Model

**One migration: `supabase/migrations/007_soft_delete_and_session_index.sql`** (manual,
numbered convention like the others; applied in the Supabase SQL Editor).

```sql
-- Soft-delete: "delete" sets this instead of removing the row (recoverable via Undo).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Serves the My Sessions list: scoped by owner, newest-first, excluding soft-deleted.
-- Partial + ordered so cursor pagination is index-only for the common case.
CREATE INDEX IF NOT EXISTS idx_sessions_owner_created
  ON sessions (created_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- Purge: hard-delete sessions that have been soft-deleted for >= 2 weeks (cascades to
-- participants/items/assignments/bank rows). The previous expires_at branch is REMOVED
-- so expired sessions persist for the Expired tab; only soft-deleted rows are purged.
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

- `deleted_at` nullable; `NULL` = live, timestamp = soft-deleted.
- Existing `created_by` (FK→`auth.users`, migration `006`), `created_at`, `expires_at`,
  `grand_total`, `status` (migration `001`) cover the rest.
- **The expired-delete branch is dropped** (decision): expired sessions are no longer
  hard-deleted, so they remain visible in the Expired tab indefinitely. The function now
  purges *only* soft-deleted rows older than 14 days.
- **Purge runs via `cleanup_expired_sessions()`**, which must be *scheduled* to take effect.
  If a schedule isn't already in place, add one with `pg_cron` (e.g. daily), per the
  Supabase skill — verify the extension and the job after applying:
  ```sql
  -- once, if pg_cron isn't enabled:  create extension if not exists pg_cron;
  select cron.schedule('cleanup-sessions', '0 3 * * *', 'select cleanup_expired_sessions();');
  ```
- The hard-delete **cascade** on the child tables (participants/items/assignments/bank)
  is what makes the purge clean up fully.

> Note: the function name (`cleanup_expired_sessions`) is now a slight misnomer — it purges
> soft-deletes, not expirations. Renaming is cosmetic and risks breaking any existing
> schedule that calls it by name, so the name is kept; the comment documents the behavior.

> Verify with `supabase db advisors` / MCP `get_advisors` after applying; confirm the new
> column + index via a probe query (per the Supabase skill's "verify your work" rule).

### TypeScript types (`src/types/index.ts`)

```ts
export type SessionTab = 'active' | 'expired';

// + on the existing Session interface:
//   deleted_at: string | null;

export interface SessionSummary {
  id: string;
  created_at: string;
  expires_at: string;
  grand_total: number;
  status: 'active' | 'completed' | 'expired';
  participant_count: number;
}

export interface ListSessionsResponse {
  sessions: SessionSummary[];
  next_cursor: string | null; // created_at of the last row, or null when no more pages
}
```

Add `'UNAUTHENTICATED'` and `'FORBIDDEN'` to `APIErrorCode` (`UNAUTHENTICATED` is already
returned by `POST /api/sessions` but missing from the union — fold that fix in here).

## API & Lib Changes

### Shared helper — `listSessionsForUser` (`src/lib/sessions.ts`, new)
```ts
listSessionsForUser(client, userId, tab: SessionTab, cursor: string | null): Promise<ListSessionsResponse>
```
- Select `id, created_at, expires_at, grand_total, status, participants(count)`.
- `.eq('created_by', userId).is('deleted_at', null)`.
- Tab filter per Requirement 3 (active vs expired/completed) using `expires_at` + `status`.
- `.order('created_at', { ascending: false })`; if `cursor`, `.lt('created_at', cursor)`.
- `.limit(11)` → return first 10 + `next_cursor = rows[9].created_at` when an 11th exists.
  Map the `participants` aggregate → `participant_count`.

### `GET /api/sessions` (`src/app/api/sessions/route.ts`)
- New `GET` alongside `POST`. `getUser()` → `401 UNAUTHENTICATED` if none.
- Parse `tab` (default `'active'`, validate against `SessionTab`) and `cursor`.
- Return `listSessionsForUser(serviceClient, user.id, tab, cursor)`.

### `DELETE /api/sessions/[id]` — soft delete (`src/app/api/sessions/[id]/route.ts`)
- New `DELETE` export. Verify user; `401` if none.
- `UPDATE sessions SET deleted_at = now() WHERE id = :id AND created_by = user.id AND deleted_at IS NULL`
  returning `id` (single owner-scoped statement — never read-then-write).
- 0 rows → `404 SESSION_NOT_FOUND` (covers not-found, not-owner, already-deleted; reveals nothing).

### `PATCH /api/sessions/[id]` — owner-gate sensitive fields (`src/app/api/sessions/[id]/route.ts`)
- `PATCH` stays open for the existing editing flow (totals etc.). **But** if the body
  includes `status` or `deleted_at`, require auth + ownership: load user (`401` if none),
  apply the update with `.eq('created_by', user.id)`, `403 FORBIDDEN` on 0 rows.
- `deleted_at` only accepts `null` (restore/Undo) — reject any non-null value so deletion
  always goes through the confirm-guarded `DELETE` verb, never a bare PATCH.
- This makes **Close** (`status='completed'`) and **Undo** (`deleted_at: null`) owner-only
  without touching the open edits. (Broader PATCH gating remains auth spec Q1, out of scope.)

### `GET /api/sessions/[id]` — hide soft-deleted
- Treat `deleted_at IS NOT NULL` as `404 SESSION_NOT_FOUND` (alongside the existing
  not-found / expired checks) so deleted sessions are unreachable by anyone until restored.

## UI Changes

### New `/sessions` page (`src/app/sessions/page.tsx`, server component)
- Guard mirroring `/`: `getUser()` → `redirect('/login?redirect=/sessions')` when none.
- Header (app title + `<AccountMenu>` + "Create session" link to `/`) + `<SessionListTabs>`
  seeded with the first Active page via the helper.

### `<SessionListTabs>` (`src/components/SessionListTabs.tsx`, client)
- **Active** / **Expired** tabs (no counts). First visit to a tab fetches its first page via
  `GET /api/sessions?tab=...`; results cached per tab in state.
- Renders `<SessionRow>`s; a **"Load more"** button when `next_cursor != null` (appends next page).
- Per-tab empty state with a CTA to `/`.

### `<SessionRow>` (`src/components/SessionRow.tsx`, client)
- Whole row links to `/session/[id]`: created date, grand total IDR, status badge,
  "N people" count. Reuse existing tokens (`bg-surface-card`, `rounded-2xl`,
  `border-border-subtle`, status colors).
- Trailing **Delete** control → confirm dialog → `DELETE /api/sessions/[id]` → optimistic
  row removal → **Undo toast** (calls `PATCH { deleted_at: null }` and re-inserts the row;
  toast auto-dismiss leaves it deleted). Rollback + error toast on failure.

### Confirm dialog
- Reuse an existing modal/dialog if present; else add a minimal `<ConfirmDialog>`
  (title, body, Cancel / Delete). Used by the list row and the session-page delete control.

### Session page owner affordances (`src/app/session/[id]/...`)
- `useSession` already exposes `session.created_by`. Add a client check:
  `supabase.auth.getUser()` → `isOwner = user?.id === session.created_by`.
- When `isOwner`:
  - **"Owned by you"** marker in the header.
  - **Close session** → `updateSession({ status: 'completed' })` (hardened PATCH);
    reflects via the existing realtime `sessions` UPDATE handler. Closed sessions surface
    under the Expired tab.
  - **Delete session** → confirm → `DELETE /api/sessions/[id]` → `router.push('/sessions')`
    (with an Undo toast on the destination if practical; otherwise just confirm).
- Non-owner / anonymous: none render; page behaves exactly as today.

### Entry point
- `AccountMenu` gains a **"My Sessions"** link (to `/sessions`), shown only when signed in.

## Security Notes

- **Authorization is enforced in handlers**, not the DB: the service-role client bypasses
  RLS and `sessions` RLS is `USING (true)`. Every owner-scoped action is safe **only
  because** it filters by `created_by = <verified user.id>` from `getUser()` (validates
  the JWT), never from client input.
- **Soft-delete and restore are single owner-scoped statements** (`UPDATE ... WHERE id AND
  created_by = user.id`) — never read-then-write. A non-owner gets `404`/`403` and changes
  nothing. `deleted_at` via PATCH accepts **only `null`** (restore); deletion is
  confirm-guarded behind the `DELETE` verb.
- **Status changes are owner-gated** via the same `created_by` filter; `403` on 0 rows. The
  rest of `PATCH` stays open by design.
- Endpoints take **no `userId`/`created_by` parameter**; owner is always the caller.
  `tab` and `cursor` are the only inputs and cannot widen scope.
- `getUser()` (not `getSession()`) for all auth decisions.
- Soft-deleted sessions `404` from `GET /api/sessions/[id]`, so a leaked link to a deleted
  session exposes nothing while it's deleted.
- `limit(11)` bounds response size; cursor pagination bounds total fetched.

## Plan

**Stage 0 — Migration.** Write/apply `007_soft_delete_and_session_index.sql` (`deleted_at`
+ partial composite index + `cleanup_expired_sessions()` rewritten to purge only 2-week-old
soft-deletes, expired-delete branch dropped); schedule the function via `pg_cron` if not
already scheduled; run advisors; verify column/index/job. Extend `Session` type with
`deleted_at`.

**Stage 1 — Owner-scoped API.** Types (`SessionTab`, `SessionSummary`,
`ListSessionsResponse`, error codes), `listSessionsForUser` helper, `GET /api/sessions`,
soft-delete `DELETE /api/sessions/[id]`, `PATCH` owner-gating (status + `deleted_at:null`),
and the `deleted_at` 404 on `GET /api/sessions/[id]`. End: all endpoints verifiable via curl.

**Stage 2 — List page & tabs.** `/sessions` (guarded), `<SessionListTabs>`, `<SessionRow>`,
`<ConfirmDialog>`, empty states, "Load more", delete + **Undo toast**.

**Stage 3 — Session-page owner affordances.** Ownership marker, Close, Delete-from-page.

**Stage 4 — Navigation & verify.** `AccountMenu` link; build passes; manual E2E incl.
cross-account isolation and Undo.

## Task Breakdown

### Stage 0 — Migration
- [ ] **T0.1** `007_soft_delete_and_session_index.sql`: `deleted_at` column + partial
  `(created_by, created_at DESC) WHERE deleted_at IS NULL` index + rewrite
  `cleanup_expired_sessions()` to purge only rows soft-deleted ≥ 14 days (drop the
  expired-delete branch). Apply, run advisors, verify.
- [ ] **T0.2** Schedule `cleanup_expired_sessions()` via `pg_cron` if not already scheduled;
  verify the job (`select * from cron.job`).
- [ ] **T0.3** Add `deleted_at: string | null` to the `Session` interface.

### Stage 1 — API
- [ ] **T1.1** Types: `SessionTab`, `SessionSummary`, `ListSessionsResponse`; add
  `'UNAUTHENTICATED'`, `'FORBIDDEN'` to `APIErrorCode`.
- [ ] **T1.2** `src/lib/sessions.ts`: `listSessionsForUser` (scoped, `deleted_at IS NULL`,
  tab filter, order desc, cursor, limit 11 → 10 + `next_cursor`, `participant_count`).
- [ ] **T1.3** `GET /api/sessions`: verify user → 401; parse `tab`/`cursor`; return helper output.
- [ ] **T1.4** `DELETE /api/sessions/[id]`: owner-scoped soft-delete (set `deleted_at`); 404 on 0 rows.
- [ ] **T1.5** Harden `PATCH /api/sessions/[id]`: owner-gate `status` and `deleted_at`
  (`deleted_at` only `null`); 401/403; other fields unchanged.
- [ ] **T1.6** `GET /api/sessions/[id]`: 404 when `deleted_at` is set.

### Stage 2 — List page & tabs
- [ ] **T2.1** `src/app/sessions/page.tsx`: guard → redirect when signed out; seed first
  Active page; render header + tabs.
- [ ] **T2.2** `<SessionListTabs>`: Active/Expired tabs, per-tab fetch + cache, "Load more".
- [ ] **T2.3** `<SessionRow>`: row link, date/IDR/status/count, delete control.
- [ ] **T2.4** `<ConfirmDialog>` (or reuse) + wire delete (optimistic remove) + **Undo toast** (restore).
- [ ] **T2.5** Per-tab empty states with CTA to `/`.

### Stage 3 — Session-page owner affordances
- [ ] **T3.1** Compute `isOwner` (`getUser()` vs `session.created_by`).
- [ ] **T3.2** Owner-only marker + Close (PATCH status) + Delete (→ `/sessions`).

### Stage 4 — Navigation & verify
- [ ] **T4.1** `AccountMenu` "My Sessions" link.
- [ ] **T4.2** Build passes (`next build`).
- [ ] **T4.3** Manual E2E: sign in → create sessions → `/sessions` Active tab shows them
  (correct total/count/status) → create >10 to verify "Load more" → close one → it moves to
  Expired → delete from list (confirm) → row disappears, **Undo** restores it → open a
  session you own: marker + Close + Delete; Delete → `/sessions`; deleted session's link
  now 404s → open a session you don't own (or anonymous): no owner controls → second account
  sees only its own sessions and cannot delete/close/restore another's (404/403) → signed
  out, `/sessions` redirects to `/login`.

## Acceptance

- `/sessions` lists exactly the signed-in user's non-deleted sessions, split into
  Active/Expired tabs (completed folds into Expired), newest first; other users' and
  anonymous sessions never appear.
- Each tab paginates 10 at a time; "Load more" appears only when more rows exist.
- `GET /api/sessions` returns `401` without a cookie, accepts only `tab`/`cursor`, and
  exposes no way to request another user's rows.
- Deleting (after confirm) soft-deletes the session and removes the row; an **Undo** toast
  restores it. A non-owner's `DELETE`/restore/close returns `404`/`403` and changes nothing.
- A soft-deleted session `404`s from `GET /api/sessions/[id]` until restored.
- On a session the user owns: "Owned by you" marker, Close (→ `completed`, lands in
  Expired), and Delete (→ `/sessions`) are present; absent for non-owners/anonymous.
- The open editing flows (items, claims, paid status) are unchanged.
- Visiting `/sessions` signed out redirects to `/login?redirect=/sessions`.

## Open Questions

- **Q1 (resolved → in scope)**: Purge soft-deleted rows after **2 weeks** via
  `cleanup_expired_sessions()` (see Data Model). The existing expired-delete branch is
  **dropped** so the Expired tab persists; the function now purges only soft-deletes.
- **Q2 (resolved → out of scope)**: No browsable "Trash" surface; Undo toast is the only
  recovery path in v1.
- **Q3 (resolved → out of scope)**: "Close" is one-way; re-opening a completed session is
  not supported in v1.
</content>

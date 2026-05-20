# Authentication — Google SSO Tech Plan

## Context

The app currently has **no authentication**. Sessions are reachable by anyone who has the UUID link ("public via UUID obscurity"), Supabase RLS policies are all `USING (true)`, and `src/middleware.ts` only does rate limiting. The server-side Supabase client uses the **service role key**, which bypasses RLS entirely.

We want to add sign-in so that:
- A session has a real **owner** (the authenticated creator), not just whoever holds the link.
- The creator can later find their sessions (foundation for a "my sessions" list — not built here, but the data model should support it).

For simplicity we ship **Google SSO only** — no email/password, no magic links, no other providers. Supabase Auth already supports Google as an OAuth provider, so we lean on it rather than introducing a separate auth service (NextAuth, Clerk, etc.).

### Key scope decision — who must sign in?

**Only the session creator signs in. Participants stay anonymous.**

- **Why:** The core UX is "share a link, friends open it and claim items." Forcing every participant through Google login would break that frictionless flow and is a much larger surface. The creator is the one person who benefits from persistence and ownership.
- **How it applies:** The create-session page and `POST /api/sessions` require a logged-in user. The participant view (`/session/[id]?participant=...`) and item-claiming stay open to anyone with the link, exactly as today.

This keeps the change small and reversible, and we can tighten participant access later if needed.

## Requirements

1. Add Supabase Auth with the **Google** OAuth provider; no other sign-in methods.
2. Use **`@supabase/ssr`** for cookie-based sessions that work across App Router server components, route handlers, and middleware.
3. New `/login` page with a single "Continue with Google" button.
4. OAuth callback route at `/auth/callback` that exchanges the code for a session and redirects back to the intended destination.
5. The create-session page (`/`) requires an authenticated user; unauthenticated visitors are redirected to `/login?redirect=/`.
6. `POST /api/sessions` requires an authenticated user and stamps the new session with `created_by = auth.uid()`.
7. `sessions` gains a nullable `created_by uuid` FK to `auth.users`. Existing rows (pre-auth) keep `created_by = null`.
8. A header/account control shows the signed-in user's name/avatar and a **Sign out** action on authenticated pages.
9. Sign-out clears the session cookie and returns the user to `/login`.
10. Participant flows (`/session/[id]`, `?participant=`, item claiming, marking paid) remain accessible **without** login.
11. Middleware refreshes the Supabase auth session on each request (token rotation) while preserving the existing rate-limit behavior.
12. Auth secrets live in env vars; document the Google Cloud OAuth client + Supabase dashboard setup steps.

## Non-Requirements

- No email/password, magic-link, OTP, or non-Google providers.
- No role-based access control / admin tiers.
- No "my sessions" dashboard UI (the `created_by` column lays groundwork; the list view is a separate future phase).
- No requirement that participants authenticate, and no linking of participant rows to `auth.users`.
- No multi-tenant / org accounts.
- No migration of existing anonymous sessions to an owner (they stay ownerless).
- No account deletion / profile editing screens (Google manages the identity).
- Not replacing the service-role server client wholesale — see Security Notes for the scoped change.

## Architecture & Auth Flow

```
[Browser] --click "Continue with Google"-->
  supabase.auth.signInWithOAuth({ provider: 'google',
    redirectTo: <origin>/auth/callback?redirect=<dest> })
--> Google consent screen
--> redirect to /auth/callback?code=...&redirect=<dest>
[Route handler /auth/callback]
  supabase.auth.exchangeCodeForSession(code)  // sets cookies
  --> redirect to <dest> (default '/')
[Middleware on every request]
  refresh session (supabase.auth.getUser) + set rotated cookies
  + existing rate limit on /api/*
```

Cookie session is read in:
- **Server components / pages** — `createServerComponentClient()` (reads cookies).
- **Route handlers** — `createRouteHandlerClient()` (reads/writes cookies).
- **Middleware** — `createMiddlewareClient()` (refresh + write cookies).

## Data Model

Migration: `supabase/migrations/006_auth_created_by.sql`

```sql
ALTER TABLE sessions
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_sessions_created_by ON sessions(created_by);
```

- Nullable so historical sessions and the (still-anonymous) participant flows are unaffected.
- `ON DELETE SET NULL` so deleting a Google user doesn't cascade-destroy their shared bills.

### TypeScript types (`src/types/index.ts`)

```ts
interface Session { /* + */
  created_by: string | null;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}
```

## Dependencies & Configuration

- Add dependency: **`@supabase/ssr`** (cookie-aware client factory for App Router). Keep `@supabase/supabase-js`.
- New env vars (names; values come from the dashboards):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already used.
  - `SUPABASE_SERVICE_ROLE_KEY` — already used (server writes).
  - No new secret for Google in the app itself — the Google **Client ID/Secret** are configured in the **Supabase dashboard** (Auth → Providers → Google), not in app env.
- External setup (document in the migration/README, must be done once):
  1. Google Cloud Console → create OAuth 2.0 Client (Web), authorized redirect URI = `https://<project>.supabase.co/auth/v1/callback`.
  2. Supabase dashboard → Auth → Providers → Google → paste Client ID + Secret, enable.
  3. Supabase dashboard → Auth → URL Configuration → add the app's site URL + `/auth/callback` to redirect allow-list (local `http://localhost:3000` and prod URL).

## API, Middleware & Lib Changes

### `src/lib/supabase.ts` — split into purpose-built clients
- Keep `createServerClient()` (service role) for trusted server writes that intentionally bypass RLS (existing API routes).
- Add `@supabase/ssr` factories:
  - `createServerComponentClient()` — cookie session, for RSC/pages.
  - `createRouteHandlerClient()` — cookie session, for route handlers that need `auth.uid()`.
  - `createMiddlewareClient(req, res)` — for the middleware refresh.
- Keep the browser `supabase` singleton for client components (now created via `createBrowserClient` from `@supabase/ssr` so it shares cookies).

### `src/middleware.ts`
- Before the rate-limit logic, call the Supabase middleware client to refresh the session and propagate rotated auth cookies onto the response.
- Keep the matcher; **extend it** so auth-cookie refresh also runs on page routes, not just `/api/*` (e.g. matcher excludes static assets). Rate limiting stays scoped to `/api/*` via an in-handler path check.

### `POST /api/sessions` (`src/app/api/sessions/route.ts`)
- Use `createRouteHandlerClient()` to read the authed user. If none → `401 { code: 'UNAUTHENTICATED' }`.
- Insert `created_by: user.id` alongside existing fields (still using the service-role client for the actual write, or the route-handler client — see Security Notes).

### New routes
- `src/app/auth/callback/route.ts` — `GET` handler: `exchangeCodeForSession`, then redirect to sanitized `redirect` param (must be a same-origin relative path; default `/`).
- `src/app/api/auth/signout/route.ts` — `POST`: `supabase.auth.signOut()`, redirect `/login`.

### Unchanged
- All participant/item/assignment endpoints stay public (no auth gate).

## UI Changes

### New `/login` page (`src/app/login/page.tsx`)
- Centered card on `bg-surface-bg`, app title, single "Continue with Google" button (`bg-brand-primary`, Google glyph + label).
- Reads `redirect` search param, passes it through to `signInWithOAuth`.
- If already authenticated, redirect straight to `redirect`/`/`.

### Create-session page (`src/app/page.tsx`)
- Server-guard: if no user, `redirect('/login?redirect=/')`.
- Render an `<AccountMenu>` in the header (avatar + name + Sign out).

### New components
- `src/components/AccountMenu.tsx` — shows avatar/name, Sign out button (posts to `/api/auth/signout`).
- `src/components/GoogleSignInButton.tsx` — the OAuth trigger button.

### Session page
- No auth gate. Optionally show `AccountMenu` in the owner header **if** a user is present (graceful when anonymous), but do not require it.

## Security Notes

- The existing server client uses the **service role key**, which bypasses RLS. That's acceptable for trusted server-side writes but means auth checks must be enforced **in the route handler** (verify `auth.uid()` before writing `created_by`), not relied upon at the DB layer.
- RLS policies remain `USING (true)` for v1 (UUID-obscurity model unchanged). Tightening RLS so only `created_by` can mutate a session is a **follow-up** — noted in Open Questions, not in scope here, because it would also require the participant flows to authenticate or use a separate anon-scoped policy.
- `redirect` params on `/login` and `/auth/callback` MUST be validated as same-origin relative paths to prevent open-redirect.
- Never expose the service role key to the client; the browser client uses only the anon key.

## Plan

Staged so each step is independently shippable and testable.

**Stage 1 — Foundations.** Add `@supabase/ssr`, build the client factories, extend middleware for session refresh, add the `created_by` migration + types. No user-visible change yet (still no gate).

**Stage 2 — Sign-in flow.** Build `/login`, `GoogleSignInButton`, `/auth/callback` route, and `/api/auth/signout`. End: a user can sign in with Google and the session cookie persists; nothing is gated yet.

**Stage 3 — Gate creation + ownership.** Server-guard the create page, enforce auth in `POST /api/sessions`, stamp `created_by`, add `AccountMenu` to the header.

**Stage 4 — Polish & verify.** Open-redirect hardening, signed-out/edge states, document Google + Supabase dashboard setup, manual E2E.

## Task Breakdown

### Stage 1 — Foundations
- [ ] **T1.1** `npm i @supabase/ssr`.
- [ ] **T1.2** Refactor `src/lib/supabase.ts`: add `createBrowserClient` singleton, `createServerComponentClient`, `createRouteHandlerClient`, `createMiddlewareClient`; keep service-role `createServerClient`.
- [ ] **T1.3** Extend `src/middleware.ts` to refresh the auth session + write rotated cookies; keep rate limiting scoped to `/api/*`; update the matcher to also cover page routes (exclude static assets).
- [ ] **T1.4** Write `supabase/migrations/006_auth_created_by.sql` (`created_by` column + index).
- [ ] **T1.5** Extend `src/types/index.ts` (`Session.created_by`, `AuthUser`).

### Stage 2 — Sign-in flow
- [ ] **T2.1** Build `src/components/GoogleSignInButton.tsx` (calls `signInWithOAuth`, passes sanitized `redirect`).
- [ ] **T2.2** Build `src/app/login/page.tsx` (centered card; redirect away if already authed).
- [ ] **T2.3** Build `src/app/auth/callback/route.ts` (`exchangeCodeForSession` → sanitized redirect).
- [ ] **T2.4** Build `src/app/api/auth/signout/route.ts` (`signOut` → `/login`).
- [ ] **T2.5** Configure Google provider in Supabase dashboard + Google Cloud OAuth client (manual, documented).
- [ ] **T2.6** Manual verify: sign in, cookie set, refresh persists session, sign out clears it.

### Stage 3 — Gate creation + ownership
- [ ] **T3.1** Server-guard `src/app/page.tsx`: redirect to `/login?redirect=/` when no user.
- [ ] **T3.2** Enforce auth in `POST /api/sessions` (401 when anonymous); stamp `created_by = user.id`.
- [ ] **T3.3** Build `src/components/AccountMenu.tsx` (avatar/name + Sign out).
- [ ] **T3.4** Render `AccountMenu` in the create-page header.
- [ ] **T3.5** Manual verify: anonymous → redirected to login; authed create stamps `created_by`; participant link flow still works logged-out.

### Stage 4 — Polish & verify
- [ ] **T4.1** Validate `redirect` params as same-origin relative paths on `/login` and `/auth/callback` (open-redirect guard).
- [ ] **T4.2** Handle edge states: OAuth error/cancel returns to `/login` with a message; expired session mid-flow.
- [ ] **T4.3** Document env + dashboard setup in `supabase/migrations/006_auth_created_by.sql` header and/or README.
- [ ] **T4.4** Build passes (`next build`) and existing tests green.
- [ ] **T4.5** Manual E2E: signed-out visit `/` → login → Google → back to `/` → create session (owned) → open participant link in a private window (no login) → claim + mark paid still work → sign out.

## Acceptance

- Visiting `/` while signed out redirects to `/login`; after Google sign-in the user lands back on `/`.
- A session created while authenticated has `created_by = <user id>`; one created before this feature stays `null`.
- `POST /api/sessions` returns 401 when called without a session cookie.
- The participant link flow (view, claim, mark paid) works fully **without** signing in.
- Sign out clears the cookie and returns to `/login`; protected pages are no longer reachable.
- `redirect` params cannot point off-origin.

## Open Questions

- **Q1**: Tighten RLS so only `created_by` may mutate their session? Requires giving participants a scoped anon path (or auth). Deferred — current model is UUID-obscurity. (Likely a dedicated security phase.)
- **Q2**: Build the "My Sessions" list now that `created_by` exists? Out of scope here; natural next phase.
- **Q3**: Should the session page owner header require the *owner* specifically (vs any authed user)? For v1 the page stays open; revisit alongside Q1.
- **Q4**: Add a lightweight "claimed by me" identity for participants later (e.g. anonymous Supabase auth) so paid-status can't be spoofed? Out of scope; relates to the paid-status spec's owner-confirm question.

<!-- refreshed: 2026-05-08 -->
# Architecture

**Analysis Date:** 2026-05-08

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                      Next.js App (Browser)                         │
│                                                                    │
│  Home Page              Session Page                               │
│  `src/app/page.tsx`     `src/app/session/[id]/page.tsx`            │
│  (OCR upload + create)  (owner view / participant view)            │
└────────┬────────────────────────────┬───────────────────────────┬──┘
         │ fetch()                    │ fetch()                   │ Supabase
         │ POST /api/ocr              │ /api/sessions/:id/*       │ Realtime
         ▼                            ▼                           │ channel
┌────────────────────────────────────────────────────────────────┐  │
│                  Next.js API Routes (Server)                   │  │
│                  `src/app/api/`                                │  │
│                                                                │  │
│  /api/ocr          → Gemini 2.0 Flash (Google AI SDK)         │  │
│  /api/sessions     → CRUD on sessions                         │  │
│  /api/sessions/[id]/items       → CRUD on items               │  │
│  /api/sessions/[id]/participants → CRUD on participants        │  │
│  /api/items/[itemId]/assignments → PUT replaces assignments    │  │
└────────────────────────┬───────────────────────────────────────┘  │
                         │ @supabase/supabase-js (service role)      │
                         ▼                                           │
┌────────────────────────────────────────────────────────────────────┤
│                    Supabase (PostgreSQL + Realtime)                │
│                                                                    │
│  Tables: sessions, participants, items, item_assignments           │
│  RLS: enabled, all-public policies (UUID obscurity model)         │
│  Realtime: postgres_changes subscriptions on all 4 tables         │
│  Edge Function: cleanup-sessions (daily cron, deletes expired)    │
└────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Home page | Receipt upload, OCR trigger, session creation | `src/app/page.tsx` |
| Session page | Owner + participant view, orchestrates all session interactions | `src/app/session/[id]/page.tsx` |
| useSession | All session CRUD via API + Supabase Realtime subscriptions | `src/hooks/useSession.ts` |
| useOCR | Posts image to `/api/ocr`, surfaces result/loading/error state | `src/hooks/useOCR.ts` |
| useBillCalculation | Pure derived computation: per-participant bill breakdown | `src/hooks/useBillCalculation.ts` |
| useShareSession | Generates share URL, wraps Web Share API + clipboard fallback | `src/hooks/useShareSession.ts` |
| calculations.ts | Pure functions: `calculateParticipantBills`, `calculatePercentages` | `src/lib/calculations.ts` |
| OCR route | Accepts image, calls Gemini 2.0 Flash, returns structured `OCRResult` | `src/app/api/ocr/route.ts` |
| Sessions API | CRUD for session record | `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts` |
| Items API | Bulk + single item insert, PATCH, DELETE | `src/app/api/sessions/[id]/items/route.ts`, `…/[itemId]/route.ts` |
| Participants API | POST (add), DELETE (remove) participants | `src/app/api/sessions/[id]/participants/route.ts`, `…/[participantId]/route.ts` |
| Assignments API | PUT (full replace) assignments for one item | `src/app/api/items/[itemId]/assignments/route.ts` |
| supabase.ts | Exports browser singleton `supabase` and `createServerClient()` factory | `src/lib/supabase.ts` |
| Providers | Wraps app in `ToastProvider` (only global context) | `src/components/Providers.tsx` |
| cleanup-sessions | Supabase Edge Function that hard-deletes expired sessions daily | `supabase/functions/cleanup-sessions/index.ts` |

## Pattern Overview

**Overall:** Full-stack monolith — Next.js 15 App Router with co-located API routes, backed by a managed Supabase Postgres database. No separate backend service.

**Key Characteristics:**
- All pages are `'use client'` — the app is effectively a React SPA with Next.js API routes as its own backend.
- No server-side rendering of data; pages fetch on mount via custom hooks.
- Real-time collaboration is achieved by Supabase Realtime postgres_changes subscriptions in `useSession`, which trigger a full re-fetch of the session from the API on every change event.
- State lives exclusively in React hooks (`useState`, `useMemo`, `useCallback`) — no Redux, Zustand, or other global store.
- Bill calculation is purely client-side and stateless: `calculateParticipantBills` in `src/lib/calculations.ts` is called on every render cycle via `useMemo`.

## Layers

**Presentation Layer:**
- Purpose: Render UI and handle user interactions
- Location: `src/app/page.tsx`, `src/app/session/[id]/page.tsx`, `src/components/`
- Contains: React components, page layouts, event handlers
- Depends on: Hooks layer
- Used by: Browser

**Hooks Layer:**
- Purpose: Encapsulate async state management and API communication
- Location: `src/hooks/`
- Contains: `useSession`, `useOCR`, `useBillCalculation`, `useShareSession`, `useClipboard`
- Depends on: API layer (via `fetch`), `src/lib/supabase.ts` (Realtime only), `src/lib/calculations.ts`
- Used by: Page components

**API Layer:**
- Purpose: Validate requests and perform database operations using the Supabase service role client
- Location: `src/app/api/`
- Contains: Next.js Route Handlers
- Depends on: `src/lib/supabase.ts` (`createServerClient()`), `src/types/index.ts`
- Used by: Hooks layer (browser fetch), and indirectly by participants via shared URLs

**Data / Persistence Layer:**
- Purpose: Store all application data with relational integrity
- Location: Supabase-managed PostgreSQL (external)
- Schema defined at: `supabase/migrations/001_initial_schema.sql`
- Tables: `sessions`, `participants`, `items`, `item_assignments`
- Used by: API layer

**Shared / Utilities:**
- `src/types/index.ts` — All TypeScript interfaces and API request/response types
- `src/lib/calculations.ts` — Pure calculation functions (no I/O)
- `src/lib/validation.ts` — Input validation helpers
- `src/lib/supabase.ts` — Client factory

## Data Flow

### New Session with OCR

1. User uploads image in `ImageUploader` → `handleUpload` in `src/app/page.tsx`
2. `useOCR.processImage` POSTs `FormData` to `POST /api/ocr`
3. OCR route sends base64 image to Google Gemini 2.0 Flash, receives JSON
4. Structured `OCRResult` returned to browser
5. `createSession` in `src/app/page.tsx` POSTs session summary to `POST /api/sessions` → Supabase insert
6. Items are then bulk-POSTed to `POST /api/sessions/:id/items`
7. Browser redirects to `/session/:id`

### Session Page Load

1. `useSession(id)` mounts in `src/app/session/[id]/page.tsx`
2. `fetchSession()` calls `GET /api/sessions/:id`
3. API returns `{ session, participants, items: ItemWithAssignments[] }` in a single response (3 DB queries, manually joined)
4. State is set: `setSession`, `setParticipants`, `setItems`
5. Supabase Realtime channel subscribed for all 4 tables — any postgres_changes event triggers `fetchSession()` again

### Item Assignment

1. User toggles or drags assignment in `ItemList` / `ItemCard`
2. Page calls `handleAssignItem` → `useSession.updateAssignments`
3. `PUT /api/items/:itemId/assignments` deletes existing rows then inserts new ones
4. Supabase Realtime fires `postgres_changes` on `item_assignments`
5. `fetchSession()` re-runs, component re-renders with new `items`
6. `useBillCalculation` recomputes `bills` via `useMemo`

### Participant (Shared Link) View

- URL: `/session/:id?participant=Name`
- Same `SessionPage` component, but `currentParticipant` is resolved from the `participant` query param
- Renders `ParticipantView` instead of the owner layout
- Participant can claim/unclaim items; calling the same `updateAssignments` flow above

**State Management:**
- No global state store. All state is local to the `SessionPage` via `useSession`, `useBillCalculation`, and `useShareSession` hooks.
- Toast notifications use React Context (`ToastProvider` in `src/components/Providers.tsx`) — the only global context.

## Key Abstractions

**Session:**
- Purpose: Top-level container for a bill-splitting event with a 1-week TTL
- Type: `src/types/index.ts` → `Session`
- Schema: `supabase/migrations/001_initial_schema.sql`

**ItemWithAssignments:**
- Purpose: Item record with its assignments pre-joined, used throughout the UI
- Type: `src/types/index.ts` → `ItemWithAssignments`
- Assembled by: `GET /api/sessions/:id/route.ts` (manual join in JS)

**ParticipantBill:**
- Purpose: Computed per-person total with itemized breakdown and proportional tax/service share
- Type: `src/types/index.ts` → `ParticipantBill`
- Computed by: `src/lib/calculations.ts` → `calculateParticipantBills`

**OCRResult:**
- Purpose: Structured receipt data returned from the Gemini API route
- Type: `src/types/index.ts` → `OCRResult`

## Entry Points

**Browser Entry (Home):**
- Location: `src/app/page.tsx`
- Triggers: User visits `/`
- Responsibilities: Upload receipt, trigger OCR, create session, redirect to `/session/:id`

**Browser Entry (Session):**
- Location: `src/app/session/[id]/page.tsx`
- Triggers: User visits `/session/:id` (owner) or `/session/:id?participant=Name` (participant)
- Responsibilities: Load session data, manage all interactions, display owner or participant view

**API Entry (OCR):**
- Location: `src/app/api/ocr/route.ts`
- Triggers: `POST /api/ocr` with `multipart/form-data`
- Responsibilities: Image validation, Gemini call, JSON parsing, response sanitization

**App Layout:**
- Location: `src/app/layout.tsx`
- Responsibilities: Sets metadata, applies Inter font, wraps children in `Providers`

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. All API routes are stateless serverless functions.
- **Global state:** Only `ToastProvider` context in `src/components/Providers.tsx`. No module-level mutable singletons except the `supabase` browser client exported from `src/lib/supabase.ts`.
- **Auth model:** No authentication. Sessions are "public by UUID obscurity" — RLS policies allow all operations to all callers. Access control relies entirely on UUID unguessability.
- **Session TTL:** Sessions expire after 1 week (set in DB default). The Supabase Edge Function `supabase/functions/cleanup-sessions/index.ts` hard-deletes them on a daily cron.
- **Real-time consistency:** The Realtime subscription triggers a full API re-fetch (not delta patching), meaning each change causes 3 DB queries. This is simpler but less efficient at scale.
- **Currency:** The app is hardcoded to IDR (Indonesian Rupiah) in all display components (`BillSummary.tsx`, `ParticipantView.tsx`). No locale abstraction exists.

## Anti-Patterns

### Full re-fetch on every Realtime event

**What happens:** Every Supabase Realtime postgres_changes event (for sessions, participants, items, or item_assignments) calls `fetchSession()`, which re-fetches the entire session payload.
**Why it's wrong:** In sessions with many participants and items, a single assignment change re-fetches all data. Multiple simultaneous participants will trigger cascading re-fetches.
**Do this instead:** Apply the delta from the Realtime event payload directly to the existing state, or use Supabase's `select` in the subscription to scope the re-fetch.

### Unrestricted PATCH on sessions

**What happens:** `PATCH /api/sessions/:id` in `src/app/api/sessions/[id]/route.ts` passes `body` directly to `supabase.update(body)` without field allowlisting.
**Why it's wrong:** Any caller can overwrite any column including `expires_at`, `status`, and `receipt_image_url`.
**Do this instead:** Explicitly pick allowed update fields before passing to Supabase.

## Error Handling

**Strategy:** All API routes return JSON with `{ error: string, code: APIErrorCode }` on failure. Hooks catch thrown errors and expose them via `error` state. Components display inline error UI.

**Patterns:**
- API routes: `try/catch` returning `NextResponse.json({ error, code }, { status })`. No centralized error middleware.
- Hooks: Errors thrown by `apiFetch` are caught and stored in local `error` state.
- UI: Error states rendered inline in each page component. Toast notifications for user-facing action failures.

## Cross-Cutting Concerns

**Logging:** `console.log` and `console.error` throughout. No structured logging library.
**Validation:** Inline in each API route handler (e.g., name required check, percentage sum check). `src/lib/validation.ts` exists but usage is not consistent across all routes.
**Authentication:** None. All API endpoints are unauthenticated.

---

*Architecture analysis: 2026-05-08*

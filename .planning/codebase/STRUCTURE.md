# Codebase Structure

**Analysis Date:** 2026-05-12

## Directory Layout

```
split-bill/
├── src/                                # All application source code
│   ├── middleware.ts                   # Edge middleware: rate limit /api/*
│   ├── app/                            # Next.js 15 App Router (pages + API)
│   │   ├── api/                        # Route Handlers (Node runtime)
│   │   │   ├── ocr/route.ts            # POST /api/ocr — Gemini bill scan
│   │   │   ├── sessions/               # Session + nested resources
│   │   │   │   ├── route.ts            # POST /api/sessions
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts        # GET (joined), PATCH
│   │   │   │       ├── items/
│   │   │   │       │   ├── route.ts            # POST single/bulk, …
│   │   │   │       │   ├── bulk/route.ts       # POST bulk-only
│   │   │   │       │   └── [itemId]/route.ts   # PATCH, DELETE
│   │   │   │       └── participants/
│   │   │   │           ├── route.ts                  # POST single+bulk
│   │   │   │           └── [participantId]/route.ts  # DELETE
│   │   │   └── items/[itemId]/assignments/route.ts   # PUT replace all
│   │   ├── session/[id]/page.tsx       # Session view (owner + participant)
│   │   ├── layout.tsx                  # Root layout (server component)
│   │   ├── page.tsx                    # Home: manual entry + optional scan
│   │   ├── manifest.ts                 # PWA manifest
│   │   └── globals.css                 # Tailwind base styles
│   ├── components/                     # Reusable client components
│   ├── hooks/                          # Custom React hooks
│   ├── lib/                            # Pure utilities + clients
│   ├── types/                          # Centralized TypeScript types (barrel)
│   └── test/                           # Vitest setup
├── supabase/                           # Supabase artifacts (NOT TS-checked)
│   ├── functions/cleanup-sessions/     # Deno Edge Function (daily cron)
│   └── migrations/
│       ├── 001_initial_schema.sql              # Initial tables + RLS
│       ├── 002_assignments_session_id.sql      # Denormalise session_id
│       └── 003_assignments_unit_split.sql      # Add unit_count + 'unit'
├── .planning/codebase/                 # GSD codebase analysis docs (this file)
├── .claude/                            # Claude Code project config
├── .env.example                        # Env var template
├── .env.local                          # Local secrets (gitignored)
├── package.json                        # NPM manifest (Next 15, React 18)
├── tsconfig.json                       # TS config (alias `@/* → src/*`)
├── next.config.js                      # Empty (defaults; no `output:standalone`)
├── tailwind.config.ts                  # Tailwind scoped to src/{app,components,pages}
├── postcss.config.mjs                  # PostCSS for Tailwind
├── vitest.config.ts                    # Vitest (jsdom env)
├── Dockerfile / docker-compose.yml     # Container scaffolding
├── .eslintrc.json                      # Extends `next/core-web-vitals`
├── plan.md / tech_plan.md / future_plan.md / task_breakdown.md  # Design docs
└── next-env.d.ts                       # Next.js types
```

Notable absences:
- No `src/pages/` directory (App Router only). Tailwind config still globs `pages/**`; harmless.
- No `public/` directory in the repo, even though `src/app/manifest.ts` references `/icon-192.png` and `/icon-512.png`. PWA icons are not currently shipped.
- No top-level `tests/` directory — tests are co-located beside the code they cover.

## Directory Purposes

### `src/app/` — Next.js App Router

- Purpose: All pages, layouts, and API route handlers
- Routing convention: Folder-based; `page.tsx` = page, `route.ts` = API endpoint, `layout.tsx` = layout
- Key files:
  - `src/app/layout.tsx` — Root layout (server component); sets metadata/viewport, applies Inter font, wraps in `<Providers>`
  - `src/app/page.tsx` — Home; manual item form with optional AI bill scan flow (client component)
  - `src/app/manifest.ts` — PWA manifest (returns `MetadataRoute.Manifest`)
  - `src/app/globals.css` — Global Tailwind styles
  - `src/app/session/[id]/page.tsx` — Session view; renders owner UI or `ParticipantView` based on `?participant=` query

### `src/app/api/` — Route Handlers (server)

- Purpose: All server-side endpoints. Each uses `createServerClient()` from `@/lib/supabase` (service role) for DB access.
- Each endpoint lives in `route.ts` exporting named HTTP method functions (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- Inventory:
  - `src/app/api/ocr/route.ts` — `POST /api/ocr`; Gemini 2.5 Flash Lite receipt extraction; in-route OCR rate limit
  - `src/app/api/sessions/route.ts` — `POST` create session
  - `src/app/api/sessions/[id]/route.ts` — `GET` (joined session+participants+items+assignments), `PATCH`
  - `src/app/api/sessions/[id]/items/route.ts` — `POST` (single or bulk via `items[]`)
  - `src/app/api/sessions/[id]/items/bulk/route.ts` — `POST` bulk-only (with explicit session validation)
  - `src/app/api/sessions/[id]/items/[itemId]/route.ts` — `PATCH`, `DELETE`
  - `src/app/api/sessions/[id]/participants/route.ts` — `POST` single + bulk; maps PG `23505` → 409 `PARTICIPANT_EXISTS`
  - `src/app/api/sessions/[id]/participants/[participantId]/route.ts` — `DELETE`
  - `src/app/api/items/[itemId]/assignments/route.ts` — `PUT` replace; stamps `session_id`; validates percentage-sum=100 and unit-sum=item.quantity

### `src/middleware.ts` — Edge Middleware

- Purpose: Per-IP sliding-window rate limit over all `/api/*`
- Matcher: `config.matcher = '/api/:path*'`
- Runtime: Edge (default for `middleware.ts`)
- Behavior: No-op (`NextResponse.next()`) when `ratelimit` singleton is `null` (i.e., Upstash env vars unset)

### `src/components/` — React Components

- Purpose: Reusable UI components used by pages. All client components.
- Naming: PascalCase `.tsx`, one component per file (named export)
- Inventory:
  - `BillSummary.tsx` — Owner-side per-participant breakdown (expand + copy)
  - `ItemCard.tsx` — Item display + inline edit + assignment dialog (equal / percentage / unit)
  - `ItemList.tsx` — `ItemCard` list + inline add-item form
  - `ParticipantManager.tsx` — Stage names → bulk-commit; remove with PG-error handling
  - `ParticipantView.tsx` — Read-only / claim UI shown when `?participant=Name`
  - `Providers.tsx` — Single global provider wrapper (`ToastProvider`)
  - `ShareModal.tsx` — Tabbed share-link modal (Link / QR via `qrcode.react` / per-participant links)
  - `TaxServiceInput.tsx` — Subtotal/tax/service form on the session page
  - `Toast.tsx` — `ToastProvider` + `useToast()` hook + container/item components

### `src/hooks/` — Custom Hooks

- Purpose: Encapsulate stateful logic (API calls, realtime, derived state)
- Naming: `useXxx.ts`, named export only
- Inventory:
  - `useSession.ts` — Session CRUD + Supabase Realtime subscriptions (re-fetch on every event)
  - `useBillScan.ts` — POST `/api/ocr`; exposes `{ scan, isScanning, error, cooldownRemaining, isCoolingDown, reset }` with a 6 s client cooldown
  - `useBillCalculation.ts` — `useMemo` wrapper over `calculateParticipantBills` + assigned/unassigned totals
  - `useShareSession.ts` — Build share URL (uses `NEXT_PUBLIC_APP_URL` if set); Web Share + clipboard
  - `useClipboard.ts` — Promise-based copy + auto-reset `copied` flag

### `src/lib/` — Library / Utilities

- Purpose: Pure utilities and infrastructure clients
- Inventory:
  - `supabase.ts` — Exports `supabase` (browser anon singleton) and `createServerClient()` (service role factory)
  - `ratelimit.ts` — Lazy Upstash Ratelimit singletons (`ratelimit`, `ocrRatelimit`); both `null` when env unset
  - `calculations.ts` — `calculateParticipantBills` (equal / percentage / unit), `calculatePercentages` (pure)
  - `calculations.test.ts` — Vitest unit tests
  - `format.ts` — `formatNumber`, `formatIDR` using `Intl.NumberFormat('id-ID')`
  - `validation.ts` — Reusable validators (used inconsistently)
  - `validation.test.ts` — Vitest unit tests

### `src/types/` — Type Definitions

- Single barrel `src/types/index.ts` exports ALL app-wide types: DB row types (`Session`, `Participant`, `Item`, `ItemAssignment`), `SplitType` union, computed types (`ItemWithAssignments`, `SessionFull`, `ParticipantBill`, `ParticipantItem`), API request types (`CreateSessionRequest`, `UpdateAssignmentsRequest`), `APIError`, and `APIErrorCode`.
- Convention: Import as `import type { X } from '@/types';`.
- Hook-local types may live next to the hook (e.g., `useBillScan.ts → ExtractedBill`); do this only when the type is purely a boundary value for that one consumer.

### `src/test/` — Test Setup

- `setup.ts` — Single line: `import '@testing-library/jest-dom'`. Loaded by `vitest.config.ts`.
- Actual tests live beside the code they cover (`src/lib/calculations.test.ts`, `src/lib/validation.test.ts`).
- `vitest.config.ts` `include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}']`.

### `supabase/` — External (Not Bundled)

- Excluded from TS compilation by `tsconfig.json → exclude: ["supabase/functions"]`.
- `supabase/migrations/001_initial_schema.sql` — Tables (`sessions`, `participants`, `items`, `item_assignments`), indexes, RLS-enabled with `FOR ALL USING (true)` policies, `cleanup_expired_sessions()` PL/pgSQL function.
- `supabase/migrations/002_assignments_session_id.sql` — Adds nullable `session_id` to `item_assignments`, backfills from `items.session_id`, enforces `NOT NULL`, indexes for realtime filter.
- `supabase/migrations/003_assignments_unit_split.sql` — Adds `unit_count INTEGER` (positive-or-null check) and extends the `split_type` CHECK to `('equal','percentage','unit')`.
- `supabase/functions/cleanup-sessions/index.ts` — Deno `Deno.serve` Edge Function; daily cron hard-deletes expired sessions (cascade removes child rows).

## Key File Locations

### Entry Points

- `src/app/layout.tsx` — Root layout (server component); wraps app in `Providers`
- `src/app/page.tsx` — Home (`/`); create session
- `src/app/session/[id]/page.tsx` — Session view (`/session/:id` and `/session/:id?participant=Name`)
- `src/app/api/ocr/route.ts` — Gemini OCR endpoint
- `src/middleware.ts` — Edge rate limit gate for `/api/*`

### Configuration

- `next.config.js` — Empty config object (Next.js defaults)
- `tsconfig.json` — Strict mode, `@/* → src/*`, excludes `supabase/functions` and tests
- `tailwind.config.ts` — Content scope: `./src/{pages,components,app}/**/*.{js,ts,jsx,tsx,mdx}`
- `postcss.config.mjs` — Tailwind + autoprefixer
- `vitest.config.ts` — jsdom env, globals enabled, alias `@ → ./src`
- `.eslintrc.json` — `next/core-web-vitals` (no custom rules)
- `.env.local` — Runtime secrets (Supabase URL/keys, Gemini API key, Upstash) — NOT committed
- `.env.example` — Template documenting required + optional env vars

### Core Logic

- `src/lib/calculations.ts` — Bill math (pure; equal / percentage / unit)
- `src/lib/format.ts` — IDR/number formatting
- `src/lib/supabase.ts` — Supabase client factory
- `src/lib/ratelimit.ts` — Upstash Ratelimit singletons
- `src/hooks/useSession.ts` — Realtime + API state for one session
- `src/hooks/useBillScan.ts` — OCR client wrapper with cooldown
- `src/types/index.ts` — All TS interfaces and API types

### Testing

- `src/lib/calculations.test.ts` — Calculation unit tests
- `src/lib/validation.test.ts` — Validation unit tests
- `src/test/setup.ts` — Vitest setup file

## Routing Structure (Next.js App Router)

### Pages

| Path | File | Type |
|------|------|------|
| `/` | `src/app/page.tsx` | Client page |
| `/session/[id]` | `src/app/session/[id]/page.tsx` | Client page (also handles `?participant=Name`) |

### API Routes

| Method | Path | File |
|--------|------|------|
| `POST` | `/api/ocr` | `src/app/api/ocr/route.ts` |
| `POST` | `/api/sessions` | `src/app/api/sessions/route.ts` |
| `GET`/`PATCH` | `/api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` |
| `POST` | `/api/sessions/[id]/items` | `src/app/api/sessions/[id]/items/route.ts` |
| `POST` | `/api/sessions/[id]/items/bulk` | `src/app/api/sessions/[id]/items/bulk/route.ts` |
| `PATCH`/`DELETE` | `/api/sessions/[id]/items/[itemId]` | `src/app/api/sessions/[id]/items/[itemId]/route.ts` |
| `POST` | `/api/sessions/[id]/participants` | `src/app/api/sessions/[id]/participants/route.ts` |
| `DELETE` | `/api/sessions/[id]/participants/[participantId]` | `src/app/api/sessions/[id]/participants/[participantId]/route.ts` |
| `PUT` | `/api/items/[itemId]/assignments` | `src/app/api/items/[itemId]/assignments/route.ts` |

Note: There is no `DELETE /api/sessions/[id]` handler (despite the prior version of this doc claiming one). Session deletion happens only via the `cleanup-sessions` Edge Function.

### Special Routes

- `/manifest.webmanifest` — Generated from `src/app/manifest.ts` (PWA support)

## Module Boundaries

- **Pages → Hooks → API → Supabase.** Pages never call `@supabase/supabase-js` directly. They go through hooks (which call `/api/*`). The browser-side `supabase` export from `src/lib/supabase.ts` is used only for Realtime subscriptions inside `useSession.ts`.
- **Hooks ↔ Components.** Hooks are imported by pages and occasionally by components (`Toast.tsx` exports `useToast`). Components must not import from `src/app/api/`.
- **Types.** Anything importing types should use `@/types`. Hook-internal boundary shapes (e.g., `ExtractedBill` in `useBillScan.ts`) may stay local.
- **Lib (pure).** `calculations.ts`, `format.ts`, `validation.ts` MUST stay pure (no I/O, no React). They are the only modules safely importable from both server and client.
- **`ratelimit.ts`** is server-only (reads `process.env`, constructs Redis client). Do not import from client code.
- **Supabase Edge Functions.** `supabase/functions/**` is Deno-runtime and excluded from `tsconfig.json`. Do not import app code from there; do not import from there into the app.

## Naming Conventions

### Files

- React components: `PascalCase.tsx` (e.g., `ItemCard.tsx`, `BillSummary.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useSession.ts`, `useBillScan.ts`)
- Pure libs: `camelCase.ts` (e.g., `calculations.ts`, `format.ts`, `ratelimit.ts`)
- Tests: `<source>.test.ts` co-located beside the source file
- Next.js special files: lowercase reserved names (`page.tsx`, `layout.tsx`, `route.ts`, `manifest.ts`, `middleware.ts`)
- Type files: single barrel `src/types/index.ts`

### Directories

- All lowercase: `components/`, `hooks/`, `lib/`, `types/`, `test/`
- Dynamic route segments: `[id]`, `[itemId]`, `[participantId]` (camelCase inside brackets)
- API resource folders: lowercase plural (`sessions/`, `items/`, `participants/`, `assignments/`)
- SQL migrations: `<NNN>_<snake_case_description>.sql` (e.g., `003_assignments_unit_split.sql`)

### Path Aliases

- `@/*` → `src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- Always use `@/` for cross-module imports (e.g., `@/components/Toast`, `@/lib/calculations`, `@/types`)
- Use relative imports only inside the same logical group (e.g., `./Toast` from `src/components/Providers.tsx`, `./useClipboard` from `useShareSession.ts`)

## Where to Add New Code

### New Page

- File: `src/app/<route-segment>/page.tsx`
- Add `'use client';` at top if it uses hooks/state (every existing page is client).
- Place data-fetching logic in a custom hook under `src/hooks/`; do not fetch in render.

### New API Endpoint

- File: `src/app/api/<resource>/[<param>]/route.ts`
- Export named handlers: `export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> })`
- Use `createServerClient()` from `@/lib/supabase` (service role) for DB access.
- Validate input inline (or via `@/lib/validation`); return `NextResponse.json({ error, code }, { status })` on failure.
- Add a new code to `APIErrorCode` in `src/types/index.ts` if introducing a new error category.
- Remember the global middleware already rate-limits this route; no extra wiring needed.

### New React Component

- File: `src/components/<PascalCase>.tsx`
- Use named export (`export function Foo()`); pages import via `@/components/Foo`.
- Mark `'use client';` if the component uses hooks or browser APIs (most do).
- Format currency with `formatIDR` from `@/lib/format` (do not call `Intl.NumberFormat` directly).

### New Hook

- File: `src/hooks/use<Name>.ts`
- Named export only (`export function useFoo()`)
- Add `'use client';` at top (all current hooks are client-only).
- Co-locate narrow boundary types; otherwise extend `src/types/index.ts`.

### New Pure Utility

- File: `src/lib/<camelCase>.ts`
- Must remain pure (no React, no `fetch`, no module-level mutable state, no `process.env` reads).
- Add tests at `src/lib/<camelCase>.test.ts`.

### New Type

- Add to `src/types/index.ts` — currently a single barrel.
- Do not create per-feature `types.ts` files; keep DB-row and API shapes centralized.
- Hook-local "shape returned by one endpoint" types may stay in the hook file (see `useBillScan.ts → ExtractedBill`).

### New DB Migration

- File: `supabase/migrations/<NNN>_<snake_case_description>.sql`
- Apply manually in Supabase SQL Editor (no automated migration runner is wired up).
- Use `IF NOT EXISTS` / `IF EXISTS` guards so re-running is idempotent (see migrations 002 and 003).
- If the migration adds columns referenced by API code, update `src/types/index.ts` first or in the same change.

### New Edge Function

- Folder: `supabase/functions/<name>/index.ts` (Deno runtime, `Deno.serve(...)`)
- Deploy: `supabase functions deploy <name>`; schedule via `supabase functions schedule`.
- Do not import app code; this folder is excluded from `tsconfig.json`.

### New Test

- For pure libs: co-locate as `<source>.test.ts` next to the source file (e.g., `src/lib/format.test.ts`).
- Test files are auto-discovered by Vitest via `include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}']`.
- Component tests would also go beside the component (jsdom + `@testing-library/react` are already configured); no examples currently exist.

## Special Directories

### `src/test/`

- Purpose: Vitest setup only
- Generated: No
- Committed: Yes

### `.next/`

- Purpose: Next.js build output and dev cache
- Generated: Yes (by `next dev` / `next build`)
- Committed: No

### `supabase/functions/`

- Purpose: Deno-runtime Edge Functions
- Generated: No
- Committed: Yes
- TS-checked: No (excluded in `tsconfig.json`)

### `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`

- Generated artifacts; not committed.

### Documentation Files (Root)

- `plan.md`, `tech_plan.md`, `future_plan.md`, `task_breakdown.md` — original design and planning docs. Reference only; not part of the build.

---

*Structure analysis: 2026-05-12*

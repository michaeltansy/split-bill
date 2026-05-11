# Codebase Structure

**Analysis Date:** 2026-05-08

## Directory Layout

```
split-bill/
├── src/                              # All application source code
│   ├── app/                          # Next.js 15 App Router (routes + API)
│   │   ├── api/                      # Route Handlers (server-side)
│   │   ├── session/                  # Session detail page route
│   │   ├── layout.tsx                # Root layout (Inter font, Providers)
│   │   ├── page.tsx                  # Home page (upload + create)
│   │   ├── manifest.ts               # PWA manifest
│   │   └── globals.css               # Tailwind base styles
│   ├── components/                   # Reusable React components
│   ├── hooks/                        # Custom React hooks
│   ├── lib/                          # Pure utilities + Supabase client factory
│   ├── pages/                        # Empty (`.gitkeep` only) — see notes below
│   ├── test/                         # Vitest test setup
│   └── types/                        # Centralized TypeScript types
├── supabase/                         # Supabase artifacts (NOT TS-checked)
│   ├── functions/                    # Edge Functions (Deno runtime)
│   │   └── cleanup-sessions/         # Daily cron function
│   └── migrations/                   # SQL migration files
├── .planning/codebase/               # GSD codebase analysis docs
├── .claude/                          # Claude Code project config
├── public/                           # (Not present — referenced by manifest icons)
├── .env.local                        # Local secrets (NOT committed)
├── .env.example                      # Env var template
├── package.json                      # NPM manifest (Next 15, React 18)
├── tsconfig.json                     # TS config (alias `@/* → src/*`)
├── next.config.js                    # `output: 'standalone'` for Docker
├── tailwind.config.ts                # Tailwind scoped to `src/{app,components,pages}`
├── postcss.config.mjs                # PostCSS for Tailwind
├── vitest.config.ts                  # Vitest config (jsdom env)
├── Dockerfile                        # Multi-stage Node 20 alpine build
├── docker-compose.yml                # Local docker stack
├── .eslintrc.json                    # Extends `next/core-web-vitals`
├── eng.traineddata                   # (Legacy Tesseract data — no longer used)
├── onnxruntime_b                     # (Symlink into node_modules — legacy)
├── plan.md / tech_plan.md / future_plan.md / task_breakdown.md  # Design docs
└── next-env.d.ts                     # Next.js types
```

## Directory Purposes

### `src/app/` — Next.js App Router

- Purpose: All pages, layouts, and API route handlers
- Routing convention: Folder-based; `page.tsx` = page, `route.ts` = API route, `layout.tsx` = layout
- Key files:
  - `src/app/layout.tsx` — Root layout, applies `Inter` font, wraps in `<Providers>`
  - `src/app/page.tsx` — Home page; OCR upload + session creation flow (client component)
  - `src/app/manifest.ts` — PWA manifest (returns `MetadataRoute.Manifest`)
  - `src/app/globals.css` — Global Tailwind styles
  - `src/app/session/[id]/page.tsx` — Session page (owner + participant view)

### `src/app/api/` — Route Handlers (server)

- Purpose: All server-side endpoints. Use `createServerClient()` from `src/lib/supabase.ts` (service role key).
- Each endpoint lives in `route.ts` exporting `GET`/`POST`/`PUT`/`PATCH`/`DELETE` named functions.
- Subtree:
  - `src/app/api/ocr/route.ts` — `POST /api/ocr` (Gemini 2.0 Flash receipt extraction)
  - `src/app/api/sessions/route.ts` — `POST` create session
  - `src/app/api/sessions/[id]/route.ts` — `GET` (full session join), `PATCH`, `DELETE`
  - `src/app/api/sessions/[id]/items/route.ts` — `POST` create item, `GET` list items
  - `src/app/api/sessions/[id]/items/bulk/route.ts` — `POST` bulk insert items
  - `src/app/api/sessions/[id]/items/[itemId]/route.ts` — `PATCH`, `DELETE` single item
  - `src/app/api/sessions/[id]/participants/route.ts` — `POST` add participant
  - `src/app/api/sessions/[id]/participants/[participantId]/route.ts` — `DELETE` participant
  - `src/app/api/items/[itemId]/assignments/route.ts` — `PUT` replace all assignments for an item

### `src/components/` — React Components

- Purpose: Reusable UI components used by pages
- Naming: PascalCase `.tsx`, one component per file (named export)
- Inventory:
  - `BillSummary.tsx` — Renders per-participant bill breakdown
  - `ImageUploader.tsx` — Drag/drop receipt upload widget
  - `ItemCard.tsx` — Single item row with assignment controls
  - `ItemList.tsx` — Container that renders `ItemCard` list
  - `ParticipantManager.tsx` — Add/remove participants UI
  - `ParticipantView.tsx` — Read-only / claim UI used when `?participant=Name`
  - `Providers.tsx` — Single global provider wrapper (`ToastProvider`)
  - `ReceiptPreview.tsx` — Displays uploaded receipt image
  - `ShareModal.tsx` — Share-link modal with QR code (`qrcode.react`)
  - `TaxServiceInput.tsx` — Tax/service input form
  - `Toast.tsx` — Toast context + `useToast()` hook

### `src/hooks/` — Custom Hooks

- Purpose: Encapsulate stateful logic (API calls, derived state)
- Naming: `useXxx.ts`, named export only
- Inventory:
  - `useSession.ts` — Session CRUD + Supabase Realtime subscriptions; main data hook
  - `useOCR.ts` — Calls `POST /api/ocr`, exposes `{ isProcessing, error, processImage }`
  - `useBillCalculation.ts` — `useMemo` wrapper around `calculateParticipantBills`
  - `useShareSession.ts` — Web Share API + clipboard fallback
  - `useClipboard.ts` — Copy-to-clipboard helper
- Note: `src/hooks/lru.go` is a stray Go file (LeetCode-style LRU cache) — not part of the app, untracked.

### `src/lib/` — Library / Utilities

- Purpose: Pure utilities and infrastructure clients
- Inventory:
  - `supabase.ts` — Exports `supabase` (browser anon client) and `createServerClient()` (service role)
  - `calculations.ts` — `calculateParticipantBills`, `calculatePercentages` (pure)
  - `calculations.test.ts` — Vitest unit tests
  - `validation.ts` — Input validation helpers (used inconsistently)
  - `validation.test.ts` — Vitest unit tests

### `src/types/` — Type Definitions

- Single file `index.ts` exports ALL app-wide types: DB row types, computed types (`ItemWithAssignments`, `ParticipantBill`), OCR types, API request/response types, `APIErrorCode` union.
- Convention: Add new types here rather than scattering across files. Imported as `import type { X } from '@/types';`.

### `src/test/` — Test Setup

- `setup.ts` — Single line: `import '@testing-library/jest-dom'`. Loaded by `vitest.config.ts` `setupFiles`.
- Actual tests live next to the code they test (e.g., `src/lib/calculations.test.ts`).

### `src/pages/` — Empty Legacy

- Contains only `.gitkeep`. App uses App Router exclusively.
- Tailwind config still globs `./src/pages/**` but no content exists.
- DO NOT add Pages Router files here — use `src/app/` instead.

### `supabase/` — External (Not Bundled)

- Purpose: Supabase project artifacts. Excluded from TS compilation in `tsconfig.json`.
- `supabase/migrations/001_initial_schema.sql` — Tables: `sessions`, `participants`, `items`, `item_assignments` + RLS policies + triggers.
- `supabase/functions/cleanup-sessions/index.ts` — Deno Edge Function, daily cron deletes expired sessions.

## Key File Locations

### Entry Points

- `src/app/layout.tsx` — Root layout (server component); wraps app in `Providers`
- `src/app/page.tsx` — Home (`/`); upload + create session
- `src/app/session/[id]/page.tsx` — Session view (`/session/:id` and `/session/:id?participant=Name`)
- `src/app/api/ocr/route.ts` — Gemini OCR endpoint

### Configuration

- `next.config.js` — `output: 'standalone'` (for Docker)
- `tsconfig.json` — Strict mode, `@/* → src/*` path alias, excludes `supabase/functions`
- `tailwind.config.ts` — Content scope: `src/{pages,components,app}/**`
- `postcss.config.mjs` — Tailwind + autoprefixer
- `vitest.config.ts` — jsdom env, globals enabled, alias `@ → src`
- `.eslintrc.json` — `next/core-web-vitals` (no custom rules)
- `.env.local` — Runtime secrets (Supabase URL/keys, Gemini API key) — NOT committed
- `.env.example` — Template for required env vars

### Core Logic

- `src/lib/calculations.ts` — Bill math (pure)
- `src/lib/supabase.ts` — Supabase client factory
- `src/hooks/useSession.ts` — Real-time + API state for one session
- `src/types/index.ts` — All TS interfaces

### Testing

- `src/lib/calculations.test.ts` — Calculation unit tests
- `src/lib/validation.test.ts` — Validation unit tests
- `src/test/setup.ts` — Vitest setup file

## Routing Structure (Next.js App Router)

### Pages

| Path | File | Type |
|------|------|------|
| `/` | `src/app/page.tsx` | Client page |
| `/session/[id]` | `src/app/session/[id]/page.tsx` | Client page (also handles `?participant=` query) |

### API Routes

| Method | Path | File |
|--------|------|------|
| `POST` | `/api/ocr` | `src/app/api/ocr/route.ts` |
| `POST` | `/api/sessions` | `src/app/api/sessions/route.ts` |
| `GET`/`PATCH`/`DELETE` | `/api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` |
| `GET`/`POST` | `/api/sessions/[id]/items` | `src/app/api/sessions/[id]/items/route.ts` |
| `POST` | `/api/sessions/[id]/items/bulk` | `src/app/api/sessions/[id]/items/bulk/route.ts` |
| `PATCH`/`DELETE` | `/api/sessions/[id]/items/[itemId]` | `src/app/api/sessions/[id]/items/[itemId]/route.ts` |
| `POST` | `/api/sessions/[id]/participants` | `src/app/api/sessions/[id]/participants/route.ts` |
| `DELETE` | `/api/sessions/[id]/participants/[participantId]` | `src/app/api/sessions/[id]/participants/[participantId]/route.ts` |
| `PUT` | `/api/items/[itemId]/assignments` | `src/app/api/items/[itemId]/assignments/route.ts` |

### Special Routes

- `/manifest.webmanifest` — Generated from `src/app/manifest.ts` (PWA support)

## Module Boundaries

- **Pages → Hooks → API → Supabase**: Pages never call Supabase directly. They go through hooks (which call `/api/*`). The browser-side `supabase` export from `src/lib/supabase.ts` is used only for Realtime subscriptions in `useSession.ts`.
- **Hooks ↔ Components**: Hooks are imported by pages and occasionally by components (`Toast.tsx` exports `useToast`). Components do not import from `src/app/api/`.
- **Types**: Anything importing types must use `@/types`. Do not redefine DB shapes in feature folders.
- **Lib (pure)**: `calculations.ts` and `validation.ts` MUST stay pure (no I/O, no React). They are the only modules safely importable from both server and client.
- **Supabase Edge Functions**: `supabase/functions/**` is Deno-runtime and excluded from `tsconfig.json`. Do not import app code from there.

## Naming Conventions

### Files

- React components: `PascalCase.tsx` (e.g., `ItemCard.tsx`, `BillSummary.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useSession.ts`)
- Pure libs: `camelCase.ts` (e.g., `calculations.ts`, `supabase.ts`)
- Tests: `<source>.test.ts` co-located beside the source file (e.g., `calculations.test.ts`)
- Next.js special files: lowercase reserved names (`page.tsx`, `layout.tsx`, `route.ts`, `manifest.ts`)
- Type files: `index.ts` (single barrel inside `src/types/`)

### Directories

- All lowercase: `components/`, `hooks/`, `lib/`, `types/`
- Dynamic route segments: `[id]`, `[itemId]`, `[participantId]` (camelCase inside brackets)
- API resource folders: lowercase plural (`sessions/`, `items/`, `participants/`, `assignments/`)

### Path Aliases

- `@/*` → `src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- Always use `@/` for cross-module imports (e.g., `@/components/Toast`, `@/lib/calculations`, `@/types`)
- Use relative imports only inside the same logical group (e.g., `./Toast` from `src/components/Providers.tsx`)

## Where to Add New Code

### New Page

- File: `src/app/<route-segment>/page.tsx`
- Add `'use client';` at top if it uses hooks/state (most pages here are client-side)
- Place data fetching logic in a custom hook under `src/hooks/`

### New API Endpoint

- File: `src/app/api/<resource>/[<param>]/route.ts`
- Export named handlers: `export async function GET(request: Request, { params })`
- Use `createServerClient()` from `@/lib/supabase` (service role) for DB access
- Validate input inline, return `NextResponse.json({ error, code }, { status })` on failure
- Add an entry to the `APIErrorCode` union in `src/types/index.ts` if introducing a new error code

### New React Component

- File: `src/components/<PascalCase>.tsx`
- Use named export (`export function Foo()`); pages import via `@/components/Foo`
- If it has client-only behavior, mark `'use client';`. Most components here are client.

### New Hook

- File: `src/hooks/use<Name>.ts`
- Named export only (`export function useFoo()`)
- Co-locate types if narrowly scoped, otherwise add to `src/types/index.ts`

### New Pure Utility

- File: `src/lib/<camelCase>.ts`
- Must remain pure (no React, no `fetch`, no module-level mutable state)
- Add tests at `src/lib/<camelCase>.test.ts`

### New Type

- Add to `src/types/index.ts` — there is currently a single barrel
- Do not create per-feature `types.ts` files; keep all shapes centralized

### New DB Migration

- File: `supabase/migrations/<NNN>_<description>.sql`
- Apply manually in Supabase SQL Editor (no automated migration runner is wired up)
- Update `src/types/index.ts` row types accordingly

### New Edge Function

- Folder: `supabase/functions/<name>/index.ts` (Deno runtime)
- Deploy: `supabase functions deploy <name>`

### New Test

- For pure libs: co-locate as `<source>.test.ts` next to the source file
- Test files automatically picked up by `vitest` via `include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}']`
- Component tests would also go beside the component (no examples currently exist)

## Special Directories

### `src/pages/`

- Purpose: Empty placeholder; only `.gitkeep`
- Generated: No
- Committed: Yes
- Note: App uses App Router exclusively. Do not introduce Pages Router files here.

### `.next/`

- Purpose: Next.js build output and dev cache
- Generated: Yes (by `next dev` / `next build`)
- Committed: No (in `.gitignore`)

### `supabase/functions/`

- Purpose: Deno-runtime Edge Functions
- Generated: No
- Committed: Yes
- TS-checked: No (excluded in `tsconfig.json`)

### `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`

- Generated artifacts; not committed

### Root-level untracked files

- `eng.traineddata` (~5 MB Tesseract OCR model) — leftover from prior local-OCR approach; OCR now uses Gemini API. Safe to delete.
- `onnxruntime_b` — symlink into `node_modules`; leftover from prior ONNX approach. Safe to delete.
- `src/hooks/lru.go` — unrelated Go file; not part of the app. Safe to delete.

### Documentation Files (Root)

- `plan.md`, `tech_plan.md`, `future_plan.md`, `task_breakdown.md` — original design and planning docs (committed). Reference only; not part of build.

---

*Structure analysis: 2026-05-08*

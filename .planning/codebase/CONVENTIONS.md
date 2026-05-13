# Coding Conventions

**Analysis Date:** 2026-05-12

## Naming Patterns

**Files:**
- React components: PascalCase, `.tsx` extension — `src/components/BillSummary.tsx`, `src/components/ItemCard.tsx`, `src/components/ParticipantView.tsx`, `src/components/TaxServiceInput.tsx`
- Hooks: camelCase with `use` prefix, `.ts` extension — `src/hooks/useSession.ts`, `src/hooks/useBillScan.ts`, `src/hooks/useBillCalculation.ts`, `src/hooks/useShareSession.ts`, `src/hooks/useClipboard.ts`
- Library/utility modules: camelCase, `.ts` extension — `src/lib/calculations.ts`, `src/lib/validation.ts`, `src/lib/format.ts`, `src/lib/supabase.ts`, `src/lib/ratelimit.ts`
- Test files: co-located with source, same base name plus `.test.ts` suffix — `src/lib/calculations.test.ts`, `src/lib/validation.test.ts`
- API routes: Next.js App Router convention — `src/app/api/[resource]/route.ts`, dynamic segments use bracket folders (`src/app/api/sessions/[id]/items/[itemId]/route.ts`)
- Page routes: `src/app/page.tsx`, `src/app/session/[id]/page.tsx`
- Shared types: single barrel at `src/types/index.ts`
- Middleware: `src/middleware.ts`

**Functions:**
- Exported component functions: PascalCase, prefer named exports — `export function BillSummary(...)`, `export function ItemCard(...)`. Only `src/app/page.tsx` and `src/app/session/[id]/page.tsx` use `export default function` (required by Next.js App Router for pages/layouts)
- Exported hooks: camelCase with `use` prefix — `export function useSession(...)`, `export function useBillScan(...)`
- Event handlers inside components: camelCase with `handle` prefix — `handleSaveEdit`, `handleDelete`, `handleCopyBill`, `handleClaim`, `handleToggleParticipant`
- Pure utility functions: camelCase, verb-first — `calculateParticipantBills`, `validateParticipantName`, `sanitiseItems`, `formatIDR`
- API route exports: named HTTP method — `export async function POST(request: NextRequest, ...)`, `GET`, `PATCH`, `DELETE`, `PUT`

**Variables:**
- camelCase throughout — `sessionId`, `editName`, `totalSubtotal`, `isCreating`, `cooldownRemaining`
- Boolean state variables use `is`/`has`/`can` prefix — `isLoading`, `isEditing`, `isDeleting`, `hasChanges`, `canSubmit`, `canShare`
- State setter names follow React convention — `setIsLoading`, `setSession`, `setError`
- Top-of-file module constants: SCREAMING_SNAKE_CASE — `COOLDOWN_MS` (`src/hooks/useBillScan.ts:5`), `PROMPT`, `RESPONSE_SCHEMA`, `REQUESTS`, `WINDOW`, `OCR_REQUESTS`, `OCR_WINDOW`, `OCR_ENABLED`, `NUMBER_FORMAT`

**Types/Interfaces:**
- `interface` is the default for object shapes — `interface Session`, `interface Participant`, `interface ItemCardProps`, `interface UseSessionReturn`, `interface ValidationResult`
- `type` reserved for unions and aliases — `type SplitType = 'equal' | 'percentage' | 'unit'` (`src/types/index.ts:32`), `type APIErrorCode = ...` (`src/types/index.ts:102`), `type ToastType = ...` (`src/components/Toast.tsx:12`), `type DraftItem = { ... }` (`src/app/page.tsx:11`)
- Props interfaces named `[ComponentName]Props` — `BillSummaryProps`, `ItemCardProps`, `TaxServiceInputProps`, `ParticipantManagerProps`
- Hook return types named `Use[Name]Return` — `UseSessionReturn`, `UseBillScanReturn`, `UseClipboardReturn`, `UseShareSessionReturn`, `UseBillCalculationReturn`
- Database row types use snake_case fields to match Supabase columns — `session_id`, `tax_amount`, `expires_at`, `split_type`

**Database/API field names:**
- snake_case in DB rows and API JSON payloads — `subtotal`, `tax_amount`, `service_amount`, `grand_total`, `participant_id`, `item_id`, `unit_count`
- camelCase only after the value enters component-local state (`taxAmount`, `serviceAmount`)

## Code Style

**Formatting:**
- No `.prettierrc` or `.editorconfig` in the repo — formatting is conventional, not enforced
- 2-space indent, single quotes for strings in `src/**/*.ts(x)` (except `src/app/layout.tsx` which uses double quotes)
- Trailing semicolons on every statement
- Trailing commas in multi-line object/array literals and in multi-line function parameter lists
- Arrow functions for inline callbacks; `function` keyword for top-level exports

**Linting:**
- ESLint via `eslint-config-next` (v15.2.0) — only configured implicitly through `next lint`
- No `.eslintrc.*` file checked into repo; relies on defaults from `next/core-web-vitals`
- Run with `npm run lint`

**TypeScript strictness (`tsconfig.json`):**
- `strict: true`, `forceConsistentCasingInFileNames: true`, `isolatedModules: true`, `moduleResolution: "bundler"`
- `target: ES2017`, `jsx: "preserve"`
- Test files explicitly excluded from the main `tsc` program (`**/*.test.ts`, `**/*.test.tsx`, `src/test`)
- Single path alias: `"@/*": ["./src/*"]` — mirrored in `vitest.config.ts` via `resolve.alias`
- Allowed escape hatches: `as any` appears in `src/app/api/sessions/[id]/items/route.ts:15` and `let assignments: any[] = []` in `src/app/api/sessions/[id]/route.ts:47` — both contained to one-line API surface adapters

## Import Organization

**Conventional order (no automated enforcement):**
1. External packages — `next/server`, `react`, `@supabase/supabase-js`, `@google/generative-ai`
2. Internal aliased imports — `@/lib/...`, `@/components/...`, `@/hooks/...`, `@/types`
3. Relative imports — `./Toast`, `./calculations` (only between siblings in the same directory)
4. Type-only imports use `import type { ... }` — `import type { Session, Participant } from '@/types'`, `import type { NextRequest } from 'next/server'` (`src/middleware.ts:2`)

**Mixed value + type imports:** prefer two separate `import` lines or use inline `type` modifier — `import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'` (`src/app/api/ocr/route.ts:2`)

**Path aliases:**
- `@/*` → `src/*` (tsconfig and vitest)
- No deep imports through index re-exports — types come from `@/types` (the only barrel)

## Component Patterns

**Function components:**
- Named exports, destructured props in signature — `export function BillSummary({ bills, totalAssigned, totalUnassigned, grandTotal }: BillSummaryProps)`
- Props typed inline via `[ComponentName]Props` interface declared immediately above the component
- Default values for optional props applied via destructuring defaults — `disabled = false`

**Client vs server components:**
- Every interactive component, hook, and page that uses state/effects starts with `'use client';` on line 1 — applies to all files in `src/components/`, `src/hooks/`, plus `src/app/page.tsx` and `src/app/session/[id]/page.tsx`
- API route handlers (`src/app/api/**/route.ts`), `src/app/layout.tsx`, `src/app/manifest.ts`, and `src/middleware.ts` are server-only — no directive needed
- No `'use server'` directives or Server Actions — all mutations go through API route fetch calls

**State management:**
- Local `useState` only — no Zustand, Redux, Jotai, etc.
- Cross-component state lives in React Context. The only provider is `ToastProvider` (`src/components/Toast.tsx`) wrapped by `src/components/Providers.tsx` and mounted in `src/app/layout.tsx`
- Hooks throw inside `useContext` consumer when accessed outside provider — `throw new Error('useToast must be used within a ToastProvider')` (`src/components/Toast.tsx:31`)
- Memoize derived values with `useMemo`; memoize event handlers with `useCallback` (used pervasively in `ItemCard.tsx`, `ParticipantView.tsx`, `useBillCalculation.ts`)

**Tailwind usage:**
- All styling via Tailwind utility classes inline in `className` — no CSS modules, no styled-components
- `tailwind.config.ts` content paths: `./src/pages`, `./src/components`, `./src/app`
- Color palette uses Tailwind defaults (blue-600, green-600, red-600, yellow-50, gray-50, etc.) — no custom theme tokens beyond `background`/`foreground` CSS vars
- Mobile-first responsive: base styles + `sm:`, `md:`, `lg:` prefixes (e.g. `text-base sm:text-lg`, `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- State variants used: `hover:`, `focus:`, `disabled:`, `disabled:opacity-50 disabled:cursor-not-allowed` for buttons
- Conditional classes built via template literals or ternary, not via `clsx`/`cn` (no helper imported)
- Inline SVGs for icons — no icon library

## Data Fetching Patterns

**No SWR, react-query, or Server Actions.** All data access goes through:

1. **Server side (API routes):** Direct Supabase client created per-request via `createServerClient()` from `src/lib/supabase.ts:9` (uses `SUPABASE_SERVICE_ROLE_KEY`). API route handlers in `src/app/api/**/route.ts` await Next.js promise-based `params` (`{ params }: { params: Promise<{ id: string }> }`), call Supabase, return `NextResponse.json(...)`.

2. **Client side (hooks):** A thin `apiFetch` helper in `src/hooks/useSession.ts:28-38` wraps `fetch` with JSON content-type and throws on non-OK responses. Hooks own `useState` for data and `useEffect` for the initial load.

3. **Real-time:** `src/hooks/useSession.ts:71-100` subscribes to four Supabase Realtime postgres_changes channels (`sessions`, `participants`, `items`, `item_assignments`) filtered by `session_id`. Each event triggers `fetchSession()` — full re-read rather than incremental patch.

4. **OCR upload:** `src/hooks/useBillScan.ts` `POST`s `multipart/form-data` to `/api/ocr`, which proxies to Gemini and returns parsed items.

**Error response shape (server):** `{ error: string; code: string }` with HTTP status. Codes include `SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `INVALID_INPUT`, `INVALID_PERCENTAGE`, `INVALID_UNIT_COUNT`, `INVALID_UNIT_SUM`, `RATE_LIMITED`, `OCR_DISABLED`, `OCR_PARSE_FAILED`, `OCR_FAILED`, `GEMINI_QUOTA`, `GEMINI_OVERLOADED`, `INTERNAL_ERROR` (definitive list in `src/types/index.ts:102-107` for documented codes).

## Error Handling

**API routes:** Every handler wraps its body in `try { ... } catch { return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 }); }`. Domain errors return early with specific code + 4xx status. The bulk-items route uses `throw new Error(...)` inside a `.map` callback then surfaces it via `error instanceof Error ? error.message : 'Internal server error'` (`src/app/api/sessions/[id]/items/bulk/route.ts:71`).

**Client fetch:** `apiFetch` reads the JSON body on failure and throws `new Error(body.error || \`Request failed: ${res.status}\`)` (`src/hooks/useSession.ts:35`). Callers narrow with `err instanceof Error ? err.message : 'Fallback message'` before showing to the user.

**User-visible errors:** Surfaced via `useToast().addToast(message, 'error' | 'info' | 'success' | 'warning')`. Each component also tracks a local `error` string for inline form-level messages (see `ParticipantManager.tsx`, `ItemList.tsx`).

**Confirmation prompts:** `confirm('Are you sure you want to delete this item?')` (`src/components/ItemCard.tsx:92`) — native browser dialog; no custom modal abstraction.

**Logging:** `console.error` / `console.warn` only. The OCR route prefixes logs with `[OCR]` and the rate-limit module with `[ratelimit]`. No logging library, no Sentry/equivalent.

## Function & Module Design

**Function size:** Component functions are large (200–440 lines for `ItemCard.tsx`, `ParticipantView.tsx`, `BillSummary.tsx`) with state, handlers, derived values, and JSX all inline — no split between "container" and "view." Pure utility functions in `src/lib/` are short and single-purpose.

**Exports:** Named exports only (except Next.js page/layout/manifest defaults). No barrel re-exports outside `src/types/index.ts`.

**Comments:** Sparse and reserved for non-obvious intent — e.g. `// Auto-calculate equal percentages` (`ItemCard.tsx:111`), `// Real-time subscriptions — still use the supabase client to listen for / postgres changes, but re-fetch through the API on each event.` (`useSession.ts:69-70`), OCR prompt rules block (`route.ts:5-14`). No JSDoc / TSDoc anywhere.

**Validation:** Pure functions in `src/lib/validation.ts` return `{ isValid: boolean; error?: string }`. They are used directly in `validation.test.ts` and indirectly inside components — but components also inline ad-hoc validation (e.g. `ItemCard.handleSaveEdit` re-implements `isNaN(price) || price < 0` rather than calling `validatePrice`). Server-side validation lives inside the API handlers (`assignments/route.ts:30-65`).

## Git Workflow

**Branches:** Only `main` exists locally and on origin. No feature branches in history.

**Commit messages:** Free-form lowercase subjects, no Conventional Commits, no scopes, no body. Examples from `git log --oneline`:
- `unit feature`
- `provide AI bill reader`
- `dummy update`
- `update`
- `finalize`
- `finalize the project`
- `first commit`

**Tooling:** No `.husky/`, no `.github/`, no `commitlint`, no CI config in the repo.

---

*Convention analysis: 2026-05-12*

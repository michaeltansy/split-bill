# Coding Conventions

**Analysis Date:** 2026-05-08

## Naming Patterns

**Files:**
- React components: PascalCase, `.tsx` extension — `BillSummary.tsx`, `ItemCard.tsx`, `ParticipantView.tsx`
- Hooks: camelCase with `use` prefix, `.ts` extension — `useSession.ts`, `useOCR.ts`, `useBillCalculation.ts`
- Pure utility/library modules: camelCase, `.ts` extension — `calculations.ts`, `validation.ts`, `supabase.ts`
- Test files: co-located with source, same name plus `.test.ts` suffix — `calculations.test.ts`, `validation.test.ts`
- API routes: Next.js App Router convention — `src/app/api/[resource]/route.ts`
- Type file: single barrel at `src/types/index.ts`

**Functions:**
- Exported component functions: PascalCase — `function BillSummary(...)`, `function ItemCard(...)`
- Exported hooks: camelCase with `use` prefix — `export function useSession(...)`, `export function useOCR(...)`
- Event handlers inside components: camelCase with `handle` prefix — `handleSaveEdit`, `handleDelete`, `handleCopyBill`, `handleClaim`
- Pure utility functions: camelCase, verb-first — `calculateParticipantBills`, `validateParticipantName`, `stripCodeFences`
- API route exports: named HTTP method — `export async function POST(request: NextRequest)`

**Variables:**
- camelCase throughout — `sessionId`, `editName`, `totalSubtotal`, `isProcessing`
- Boolean state variables prefixed with `is` or `has` — `isLoading`, `isEditing`, `isDeleting`, `hasChanges`
- State setter names follow React convention — `setIsLoading`, `setSession`, `setError`

**Types/Interfaces:**
- `interface` used for all type definitions, never `type` alias for object shapes — `interface Session`, `interface Participant`, `interface ValidationResult`
- `type` used only for union types — `type ToastType = 'success' | 'error' | 'info' | 'warning'`, `type APIErrorCode = ...`
- Props interfaces named `[ComponentName]Props` — `BillSummaryProps`, `ItemCardProps`, `TaxServiceInputProps`
- Hook return interfaces named `Use[HookName]Return` — `UseSessionReturn`, `UseOCRReturn`, `UseBillCalculationReturn`
- Database entity types in `src/types/index.ts`, grouped by category (Database Types, Computed Types, OCR Types, Bill Calculation Types, API Request/Response Types)

## Code Style

**Formatting:**
- No Prettier config file present — formatting style is consistent but not enforced by tooling
- Single quotes for strings in TypeScript source
- Semicolons at end of statements
- Trailing commas in multi-line arrays and objects

**Linting:**
- ESLint with `next/core-web-vitals` config via `.eslintrc.json`
- No custom rules beyond the Next.js default preset

## TypeScript Usage

**Strict mode:** Enabled (`"strict": true` in `tsconfig.json`)

**Type imports:** Always use `import type { ... }` for type-only imports — seen consistently across all files:
```typescript
import type { Session, Participant, ItemWithAssignments } from '@/types';
```

**Non-null assertions:** Used for env vars with guaranteed presence:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
```

**Generics:** Used for React state and Maps — `useState<Session | null>(null)`, `new Map<string, ParticipantBill>()`

**`any` usage:** Present in one API route for bulk insert parsing — `(item: any)` in `src/app/api/sessions/[id]/items/route.ts` line 16. Otherwise the codebase avoids `any`.

**`unknown` for catch blocks:** `catch { }` (empty catch) used in some places; `err instanceof Error` narrowing used consistently where error messages are extracted:
```typescript
catch (err) {
  const message = err instanceof Error ? err.message : 'Failed to process image';
}
```

## Path Aliases

**Configured alias:** `@/*` maps to `./src/*` in both `tsconfig.json` and `vitest.config.ts`

**Usage:** All internal imports use the `@/` alias — never relative paths across directories:
```typescript
import { supabase } from '@/lib/supabase';
import type { OCRResult } from '@/types';
import { calculateParticipantBills } from '@/lib/calculations';
```

## Import Organization

**Order (observed):**
1. React and Next.js framework imports (`react`, `next/server`, `next/navigation`)
2. External library imports (`@supabase/supabase-js`, `@google/generative-ai`)
3. Internal module imports using `@/` alias (hooks, lib, components)
4. Type-only imports using `import type` (always last in the import block)

No blank lines separating import groups — all imports run consecutively.

## Client vs Server Boundary

**`'use client'` directive:** Present at the top of every component file and every hook file. Only API routes and `src/lib/supabase.ts` omit it (they are server-side).

Pattern:
- `src/app/api/**/*.ts` — server-only, no directive
- `src/components/*.tsx` — always `'use client'`
- `src/hooks/*.ts` — always `'use client'`
- `src/lib/calculations.ts`, `src/lib/validation.ts` — no directive (pure functions, usable anywhere)

## Error Handling

**In hooks:** State-based error tracking with `Error | null` state. Errors thrown from `apiFetch` are caught and stored:
```typescript
const [error, setError] = useState<Error | null>(null);
try { ... } catch (err) {
  setError(err instanceof Error ? err : new Error('Failed to fetch session'));
}
```

**In API routes:** Consistent try/catch wrapping entire handler. Supabase errors checked via `if (error)` after each query:
```typescript
if (sessionError) {
  return NextResponse.json(
    { error: sessionError.message, code: 'INVALID_INPUT' },
    { status: 400 }
  );
}
```
Outer catch returns `{ error: 'Internal server error', code: 'INTERNAL_ERROR' }` with status 500.

**Error response shape:** `{ error: string, code: string }` — defined as `APIError` interface in `src/types/index.ts`.

**In components:** Errors are surfaced via the `useToast` hook (`addToast('message', 'error')`) rather than rendering error UI inline. Critical errors (session not found) render a full-page error state.

**In pure lib functions:** No exceptions thrown — all validation functions return `ValidationResult` objects with `{ isValid: boolean, error?: string }`.

## Logging

**Framework:** Raw `console.log`, `console.error` — no structured logging library.

**Patterns:**
- API routes use prefixed log lines for tracing: `console.log('[OCR] ...', ...)`, `console.log('[createSession] ...')`
- Hooks log OCR results: `console.log('[OCR] result:', ocrResult)` in `src/hooks/useOCR.ts`
- `console.error` used for non-fatal failures (clipboard errors, fetch errors in components)
- No logging in pure library functions (`calculations.ts`, `validation.ts`)

## React Patterns

**State management:** Local component state only via `useState`. No global client state library.

**Memoization:** `useMemo` used for computed values that depend on arrays/objects — `useBillCalculation` is entirely `useMemo`-based. `useCallback` used for event handlers passed as props to prevent unnecessary re-renders.

**Context:** Used sparingly — only for `ToastContext` in `src/components/Toast.tsx`. Pattern: context created with `createContext<ContextType | null>(null)`, consumed via a typed hook that throws if used outside provider.

**Component co-location:** Helper components defined in the same file when they are only used by the parent (e.g., `ToastContainer` and `ToastItem` are unexported private components defined inside `Toast.tsx`).

## CSS / Styling Conventions

**Framework:** Tailwind CSS v3 — utility classes only, no custom CSS files detected beyond global reset in `app/layout`.

**Patterns:**
- Layout: `flex`, `grid`, `space-y-*`, `gap-*` for spacing
- Color palette: `blue-*` for primary actions, `green-*` for success/assigned state, `orange-*`/`red-*` for warnings/errors, `gray-*` for neutral UI
- Interactive states always include hover variant — `hover:bg-blue-700`, `hover:bg-gray-50`
- Disabled state via `disabled:opacity-50` on buttons
- Focus ring: `focus:outline-none focus:ring-2 focus:ring-blue-500` on all inputs
- Responsive layout with `md:` and `lg:` breakpoint prefixes in page components
- No custom Tailwind theme extensions beyond two CSS variable colors (`background`, `foreground`)

## Module Design

**Exports:**
- Components: named exports only — `export function BillSummary(...)`. No default exports except Next.js page components (`export default function Home()`, `export default function SessionPage(...)`)
- Hooks: named exports — `export function useSession(...)`
- Types: named exports from `src/types/index.ts`
- Lib utilities: named exports — `export function calculateParticipantBills(...)`

**No barrel files** for components or hooks — each file exports its own members directly.

---

*Convention analysis: 2026-05-08*

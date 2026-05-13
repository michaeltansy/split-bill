# Testing Patterns

**Analysis Date:** 2026-05-12

## Test Framework

**Runner:**
- Vitest ^4.1.5 (`package.json` devDependencies)
- Config: `vitest.config.ts` at the repo root

**Plugin / environment:**
- `@vitejs/plugin-react` ^6.0.1 — JSX/TSX transform for tests
- `environment: 'jsdom'` (`vitest.config.ts:8`), `jsdom` ^29.1.0
- `globals: true` — `describe`, `it`, `expect` available without explicit import (though the existing test files still import them explicitly, which is fine)
- `setupFiles: ['./src/test/setup.ts']` — single setup module that adds `@testing-library/jest-dom` matchers
- `include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}']`

**Assertion library:**
- Vitest built-in `expect` (Chai-style)
- `@testing-library/jest-dom` ^6.9.1 imported in `src/test/setup.ts:1` (currently unused by the two existing tests but available for component tests)

**React Testing Library:**
- `@testing-library/react` ^16.3.2 installed as devDependency
- Not yet used — no component tests exist

**Path resolution:**
- Vitest mirrors the `tsconfig.json` alias via `resolve.alias: { '@': path.resolve(__dirname, './src') }` (`vitest.config.ts:18-20`) so test files can `import type { ... } from '@/types'`

**Coverage:**
- `coverage: { reporter: ['text', 'json', 'html'], exclude: ['node_modules/', 'src/test/'] }` (`vitest.config.ts:12-15`)
- No threshold enforced, no coverage provider explicitly installed (`@vitest/coverage-v8` not in `package.json`) — running `npm run test:coverage` will prompt to install on first use

**Run commands (`package.json` scripts):**
```bash
npm run test           # vitest (watch mode)
npm run test:run       # vitest run (single pass, CI mode)
npm run test:coverage  # vitest run --coverage
```

## Test File Organization

**Location:** Co-located alongside source files in `src/lib/`. No `__tests__/` or `tests/` directory.

**Naming:** `[module].test.ts` — same base name as the file under test.

**Existing test files (2 total):**
- `src/lib/calculations.test.ts` — 7 `it` blocks across 2 `describe` blocks (`calculatePercentages`, `calculateParticipantBills`)
- `src/lib/validation.test.ts` — 17 `it` blocks across 6 `describe` blocks (`validateParticipantName`, `validateItemName`, `validatePrice`, `validateQuantity`, `validatePercentage`, `validatePercentageSum`)

**Excluded from TypeScript program:** `tsconfig.json` excludes `**/*.test.ts`, `**/*.test.tsx`, and `src/test` (so `tsc --noEmit` doesn't typecheck tests; Vitest handles that during its run).

## Test Structure

**Imports:** Tests import `describe`, `it`, `expect` from `vitest` explicitly even though `globals: true` would also make them available. Source modules are imported with relative paths or `@/types` for shared types.

```typescript
// Pattern from src/lib/calculations.test.ts:1-3
import { describe, it, expect } from 'vitest'
import { calculateParticipantBills, calculatePercentages } from './calculations'
import type { Session, ItemWithAssignments, Participant } from '@/types'
```

**Suite layout:** One `describe(functionName, () => { ... })` per exported function. Inside each, multiple `it('should ...', () => { ... })` cases starting with "should" (BDD-style). No `beforeEach`/`afterEach`/`beforeAll` hooks anywhere.

**Fixture style:** Inline `const mockSession: Session = { ... }` and `const mockParticipants: Participant[] = [ ... ]` declared inside the parent `describe` callback and reused across `it` blocks. No factory helpers, no shared fixtures module.

**Assertion style:** Mix of `.toBe(...)`, `.toEqual(...)`, `.toHaveLength(...)`, `.toBeCloseTo(value, precision)`, `.toContain(...)`. Examples:
```typescript
expect(result.taxPercentage).toBeCloseTo(33.33, 2)              // floating point
expect(bills[0].participant.name).toBe('Alice')                  // primitive equality
expect(validateParticipantName('John')).toEqual({ isValid: true }) // deep equality on result objects
expect(result.error).toContain('80.0%')                          // partial string match
```

## Mocking

**No mocks in the current test suite.** No occurrences of `vi.mock`, `vi.fn`, `vi.spyOn`, `vi.stubGlobal`, or `vi.useFakeTimers` across `src/**`.

**Why none yet:** The two tested modules (`calculations.ts`, `validation.ts`) are pure functions with no I/O or external dependencies. They accept all state as arguments and return plain values.

**What would need mocking when component/hook tests are added:**
- `src/lib/supabase.ts` — Supabase client (`supabase`, `createServerClient`)
- `global.fetch` — used in `useSession.ts`, `useBillScan.ts`, `useShareSession.ts`
- `navigator.clipboard` — used in `useClipboard.ts`, `BillSummary.tsx`, `ParticipantView.tsx`, `ShareModal.tsx`
- `crypto.randomUUID` — used in `src/app/page.tsx:19`
- `@upstash/ratelimit` and `@upstash/redis` — used in `src/lib/ratelimit.ts`
- `@google/generative-ai` — used in `src/app/api/ocr/route.ts`
- `next/navigation` — `useRouter`, `useSearchParams` used in pages

## Coverage

### What is covered

| Module | File | Coverage |
|--------|------|----------|
| `calculations.ts` | `src/lib/calculations.test.ts` | Both exported functions (`calculatePercentages`, `calculateParticipantBills`) including equal split, percentage split, tax/service proportional distribution, and `quantity > 1` cases |
| `validation.ts` | `src/lib/validation.test.ts` | 6 of 8 exported validators (`validateParticipantName`, `validateItemName`, `validatePrice`, `validateQuantity`, `validatePercentage`, `validatePercentageSum`) |

### Coverage gaps

**`src/lib/validation.ts` — partial:**
- `validateTaxOrService` (`validation.ts:120-136`) has no tests
- `hasError` and `getErrorMessage` helpers (`validation.ts:139-146`) have no tests

**`src/lib/calculations.ts` — missing the "unit" split path:**
- The `it 'unit feature'` commit (`9b163fa`) added a `'unit'` `SplitType` and a unit-count branch in `calculateParticipantBills` (`calculations.ts:40-50`). `calculations.test.ts` only exercises `'equal'` and `'percentage'` — `'unit'` splits are untested.

**`src/lib/format.ts` — no tests** (`formatNumber`, `formatIDR`). Trivial but used everywhere in display logic.

**Hooks — no tests:**
- `src/hooks/useSession.ts` (data fetching + realtime subscriptions)
- `src/hooks/useBillScan.ts` (cooldown timer, OCR error handling) — added in commit `43d1f21` ("provide AI bill reader"), shipped without tests
- `src/hooks/useBillCalculation.ts` (memoization wrapper around `calculateParticipantBills`)
- `src/hooks/useShareSession.ts`, `src/hooks/useClipboard.ts`

**Components — no tests:** Every file in `src/components/` is untested. Highest-risk untested code paths:
- `src/components/ItemCard.tsx` — complex assignment state machine with `equal` / `percentage` / `unit` modes and percentage-sum / unit-sum validation
- `src/components/ParticipantView.tsx` — claim/unclaim flow that mutates assignments
- `src/components/Toast.tsx` — context provider used everywhere

**API routes — no tests:** Every route handler in `src/app/api/**/route.ts` is untested. Particularly impactful gaps:
- `src/app/api/items/[itemId]/assignments/route.ts` — server-side validation of percentage sum (must equal 100) and unit-count sum (must equal item quantity) is duplicated from client logic and untested
- `src/app/api/ocr/route.ts` — OCR retry logic on 503, Gemini quota handling, and the `sanitiseItems` parser are all untested

**Middleware — no tests:** `src/middleware.ts` rate-limit headers and 429 response shape.

**Setup file is minimal:** `src/test/setup.ts` only imports `@testing-library/jest-dom`. No global mocks, no MSW server, no env var defaults.

## CI Setup

**None.** No `.github/workflows/`, no `.circleci/`, no `.gitlab-ci.yml`, no `bitbucket-pipelines.yml`. Tests run only when invoked locally via `npm run test*`. No pre-commit hook (no `.husky/`).

## How to Run

```bash
# Watch mode — re-runs on save (default `npm test`)
npm run test

# One-shot — for CI or pre-push verification
npm run test:run

# Coverage report (will require installing @vitest/coverage-v8 on first run)
npm run test:coverage
```

To run a single file:
```bash
npx vitest run src/lib/calculations.test.ts
```

To run tests matching a pattern:
```bash
npx vitest run -t "should calculate equal split"
```

---

*Testing analysis: 2026-05-12*

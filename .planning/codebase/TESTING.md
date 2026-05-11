# Testing Patterns

**Analysis Date:** 2026-05-08

## Test Framework

**Runner:**
- Vitest v4.1.5
- Config: `vitest.config.ts` (root)

**Assertion Library:**
- Vitest built-in (`expect`) with `@testing-library/jest-dom` matchers (v6.9.1) added via setup file

**React Testing:**
- `@testing-library/react` v16.3.2 installed as a dev dependency
- `jsdom` v29.1.0 as the DOM environment

**Run Commands:**
```bash
npm run test          # vitest (watch mode)
npm run test:run      # vitest run (single pass, CI mode)
npm run test:coverage # vitest run --coverage
```

## Test File Organization

**Location:** Co-located alongside source files in `src/lib/`

**Naming:** `[module].test.ts` — same base name as the file under test

**Current test files:**
- `src/lib/calculations.test.ts` — tests for `src/lib/calculations.ts`
- `src/lib/validation.test.ts` — tests for `src/lib/validation.ts`

**Test setup:**
- `src/test/setup.ts` — single line: `import '@testing-library/jest-dom'`
- Referenced in `vitest.config.ts` via `setupFiles: ['./src/test/setup.ts']`

**Vitest glob pattern:** `src/**/*.{test,spec}.{js,ts,jsx,tsx}`

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'
import { functionUnderTest } from './module'
import type { SomeType } from '@/types'

describe('functionName', () => {
  // Shared fixtures as const inside describe block
  const mockEntity: SomeType = { ... }

  it('should [describe behavior]', () => {
    const result = functionUnderTest(args)
    expect(result).toEqual({ ... })
  })
})
```

**Patterns:**
- Each exported function gets its own `describe` block
- Test names follow `'should [expected behavior]'` convention
- Inline mock data (no separate fixture files)
- Typed mock objects — `const mockSession: Session = { ... }` using types from `@/types`
- `@/` alias works in test files via `vitest.config.ts` path resolution

## Mocking

**No mocking currently used.** Both test files cover pure functions that have no external dependencies:
- `src/lib/calculations.ts` — pure math, no I/O
- `src/lib/validation.ts` — pure string/number validation, no I/O

`@testing-library/react` is installed but not yet used in any test file.

## Coverage

**Configuration:** Coverage reporters set to `['text', 'json', 'html']` in `vitest.config.ts`. `node_modules/` and `src/test/` excluded.

**Requirements:** No coverage threshold enforced.

**View Coverage:**
```bash
npm run test:coverage
```

## Test Coverage — Current State

### What IS tested

**`src/lib/calculations.ts` — full function coverage:**
- `calculatePercentages`: tax/service percentage computation, zero-subtotal edge case, floating-point rounding
- `calculateParticipantBills`: empty participants, participants with no items, equal split, percentage split, proportional tax/service distribution, items with `quantity > 1`

**`src/lib/validation.ts` — full function coverage:**
- `validateParticipantName`: empty string, whitespace-only, valid name, duplicate detection (case-insensitive), >50 char limit
- `validateItemName`: empty string, valid name, >100 char limit
- `validatePrice`: NaN input, negative, valid (number and string), >999999.99
- `validateQuantity`: non-integer float, <1, valid (number and string)
- `validatePercentage`: negative, >100, valid boundary values
- `validatePercentageSum`: sums to 100 (with floating-point tolerance), does not sum to 100

**Functions in `validation.ts` NOT covered by tests:**
- `validateTaxOrService` — exists in source, no test cases written
- `hasError` — helper, no test
- `getErrorMessage` — helper, no test

### What is NOT tested

**Hooks (0% coverage):**
- `src/hooks/useSession.ts` — `useSession`, `apiFetch`, all CRUD operations, real-time subscription logic
- `src/hooks/useOCR.ts` — `useOCR`, image processing, API error handling
- `src/hooks/useBillCalculation.ts` — `useBillCalculation` (wraps `calculateParticipantBills`, so partially covered by proxy)
- `src/hooks/useShareSession.ts` — share URL generation, clipboard copy
- `src/hooks/useClipboard.ts` — clipboard hook

**Components (0% coverage):**
- All 10 components in `src/components/` — no render tests, no interaction tests, no snapshot tests
- Critical UI paths not tested: assignment modal flow in `ItemCard.tsx`, bill expand/copy in `BillSummary.tsx`, participant claim/unclaim in `ParticipantView.tsx`

**API Routes (0% coverage):**
- `src/app/api/sessions/route.ts` — POST session creation
- `src/app/api/sessions/[id]/route.ts` — GET session, PATCH session
- `src/app/api/sessions/[id]/items/route.ts` — POST item (single and bulk)
- `src/app/api/sessions/[id]/items/[itemId]/route.ts` — PATCH/DELETE item
- `src/app/api/sessions/[id]/participants/route.ts` — POST participant
- `src/app/api/sessions/[id]/participants/[participantId]/route.ts` — DELETE participant
- `src/app/api/items/[itemId]/assignments/route.ts` — PUT assignments
- `src/app/api/ocr/route.ts` — POST OCR processing (Gemini integration, JSON parsing, sanitization)

**Pages (0% coverage):**
- `src/app/page.tsx` — home page flow
- `src/app/session/[id]/page.tsx` — session page, all view modes (owner, participant, not-found)

**External integrations (untestable without mocks):**
- Supabase client and real-time subscription in `src/lib/supabase.ts`
- Gemini API calls in `src/app/api/ocr/route.ts`

## Types of Tests

**Unit Tests:** Present — 2 files covering 2 pure utility modules

**Integration Tests:** None

**E2E Tests:** None — no Playwright, Cypress, or similar tool detected

## CI/CD Testing Setup

**No CI/CD pipeline configured.** No `.github/workflows/` directory, no `Dockerfile` test stage, no other CI config found. Tests must be run manually during development.

---

*Testing analysis: 2026-05-08*

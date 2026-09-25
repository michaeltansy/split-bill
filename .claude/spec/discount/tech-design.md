# Bill Discount — Technical Design

PRD: [`spec.md`](./spec.md)

## 1. Summary

Add one bill-level discount per session, computed on the item subtotal before service charge and tax. The discount is stored on `sessions`, resolved to an IDR amount **on the server**, split across participants in proportion to their item subtotals, and shown everywhere a bill breakdown appears. Tax and service stay as the absolute amounts entered or scanned. The owner edits them by hand, and changing the discount never rescales them.

```
grand_total = subtotal − discount_amount + service_amount + tax_amount
tax %       = tax_amount     / (subtotal − discount_amount)   (unchanged formula; base is net of discount)
service %   = service_amount / (subtotal − discount_amount)
```

The existing tax/service calculation is otherwise unchanged: amounts are absolute, percentages are `amount / base` to 2 decimals (so 7,5% stays 7,5%), and every per-participant share keeps 2 decimals.

## 2. Current State (relevant gaps)

| Area | File | Gap |
|---|---|---|
| Schema | `supabase/migrations/001_initial_schema.sql` | No discount columns on `sessions`. |
| Calc | `src/lib/calculations.ts` | `total = subtotal + tax + service`; tax/service % computed on gross subtotal; rounds to 2 decimals per share, so participant totals can drift ±1 from `grand_total`. |
| Create API | `src/app/api/sessions/route.ts` `POST` | Trusts client `grand_total` / percentages. |
| Update API | `src/app/api/sessions/[id]/route.ts` `PATCH` | Passes the **raw request body** to `supabase.update()`. There's no field whitelist and no recomputation. |
| OCR | `src/app/api/ocr/route.ts` | Prompt and schema have no discount; discount line is effectively dropped. |
| Create form | `src/app/page.tsx` | `grandTotal = sub + tax + service`. |
| Owner edit | `src/components/TaxServiceInput.tsx` | Same formula; % on gross subtotal. |
| Displays | `BillSummary.tsx`, `ParticipantView.tsx`, `src/lib/bankTransferText.ts` | No discount line in UI or copied text. |
| Validity | `src/hooks/useBillCalculation.ts` | `isValid` fails whenever the receipt has a discount. |

## 3. Data Model

### Migration `supabase/migrations/007_session_discount.sql`

```sql
-- Bill-level discount applied to the item subtotal, before service and tax.
-- Apply in the Supabase SQL Editor (same path as previous migrations).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS discount_type   VARCHAR(10)   NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE sessions
  ADD CONSTRAINT discount_type_valid    CHECK (discount_type IN ('percentage', 'amount')),
  ADD CONSTRAINT discount_value_nonneg  CHECK (discount_value >= 0),
  ADD CONSTRAINT discount_pct_range     CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  ADD CONSTRAINT discount_amount_range  CHECK (discount_amount >= 0 AND discount_amount <= subtotal);
```

| Column | Meaning | Written by |
|---|---|---|
| `discount_type` | `'percentage'` or `'amount'` | client input |
| `discount_value` | What the user typed (`15` or `50000`); lets the UI re-show "15%" | client input |
| `discount_amount` | Resolved IDR amount (`193050`); the **only** value calculations read | server only |

- **Backfill:** none needed. Defaults give `discount_amount = 0`, so existing totals don't change.
- **Realtime:** `sessions` is already published (migration 004), and `useSession` merges `payload.new` into state. The new columns arrive automatically.
- **RLS:** unchanged.
- The CHECK constraints are a backstop. The API validates first and returns a friendly error.

**Alternative considered:** a Postgres `BEFORE INSERT/UPDATE` trigger that computes `discount_amount` and `grand_total`. Rejected because the math would then live in two languages (SQL and TS for the client preview), and Vitest couldn't test it.

## 4. Types (`src/types/index.ts`)

```ts
export type DiscountType = 'percentage' | 'amount';

export interface Session {
  // ...existing
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
}

export interface ParticipantBill {
  // ...existing
  discount_share: number;
}

export interface CreateSessionRequest {
  // ...existing
  discount_type?: DiscountType;
  discount_value?: number;
}

export type APIErrorCode = /* ...existing */ | 'INVALID_DISCOUNT';
```

`ExtractedBill` in `src/hooks/useBillScan.ts` gains `discount_type: DiscountType` and `discount_value: number`.

## 5. Calculation Module (`src/lib/calculations.ts`)

All money math stays in this one pure module. The client uses it for live previews and the server uses it for the values it saves.

### 5.1 New helpers

```ts
/** Resolve the IDR discount from user input. Rounded to 2 decimals, clamped to [0, subtotal]. */
export function resolveDiscountAmount(
  subtotal: number, type: DiscountType, value: number
): number;

/** Canonical totals for a session row. */
export function computeSessionTotals(input: {
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  service_amount: number;
  tax_amount: number;
}): {
  discount_amount: number;
  grand_total: number;        // subtotal − discount + service + tax
  service_percentage: number; // service / (subtotal − discount)            × 100, 2dp
  tax_percentage: number;     // tax / (subtotal − discount)                × 100, 2dp
};

/**
 * Split `total` across `weights` so the parts, rounded to `decimals` places,
 * sum exactly to `total` (largest-remainder method). Ties go to the larger
 * weight, then to the lower index.
 */
export function allocateProportionally(total: number, weights: number[], decimals = 0): number[];
```

`calculatePercentages(subtotal, tax, service)` gains a 4th parameter, `discountAmount = 0`, and divides by `subtotal − discountAmount`. With no discount it returns exactly what it does today. Any divide-by-zero base returns 0%.

### 5.2 `calculateParticipantBills` changes

The item-share loop stays the same. Everything after it changes:

```ts
const weights = bills.map((b) => b.subtotal);           // raw, may be fractional
const assigned = sum(weights);

// every share keeps 2 decimals, as today
const subtotals = allocateProportionally(assigned, weights, 2);
const discounts = allocateProportionally(session.discount_amount, weights, 2);
const services  = allocateProportionally(session.service_amount,  weights, 2);
const taxes     = allocateProportionally(session.tax_amount,      weights, 2);

bills.forEach((b, i) => {
  b.subtotal       = subtotals[i];
  b.discount_share = discounts[i];
  b.service_share  = services[i];
  b.tax_share      = taxes[i];
  b.total          = subtotals[i] - discounts[i] + services[i] + taxes[i];
});
```

- **Every share keeps 2 decimals**, as today. Each column adds up exactly (to the cent). So when all items are assigned and `session.subtotal` equals the item sum, Σ `total` equals `grand_total` exactly.
- `item.share_amount` values stay unrounded for per-item display, which is the current behavior.
- **Refines PRD Req 8:** leftover rupiah go by the largest-remainder method instead of all going to one person. This is fairer with many participants. With a tie it gives the same result as the PRD's worked example (A gets the extra rupiah).
- The existing no-discount tests pass unmodified; the only difference from today is that remainder cents are allocated instead of each share being rounded independently.

### 5.3 Worked check (PRD fixture)

Input: `subtotal 1_287_000, 15%, service 76_577, tax 117_053`. Expected output:
- `discount_amount 193_050`
- `grand_total 1_287_580`
- `service_percentage 7.00`
- `tax_percentage 10.70`

With two participants at 643_500 each, service is 38_288.5 and tax 58_526.5 each, and both totals are 643_790.

## 6. Validation (`src/lib/validation.ts`)

```ts
export function validateDiscount(
  type: unknown, value: unknown, subtotal: number
): ValidationResult;
```

Rules:
- `type` is `'percentage'` or `'amount'`.
- `value` is a finite number ≥ 0.
- Percentage values are ≤ 100.
- Amount values are ≤ `subtotal`.

The client form and both API routes use the same function.

## 7. API

### 7.1 `POST /api/sessions`

1. Validate `discount_type`/`discount_value` (default `'percentage'`/`0`). On failure return `400 INVALID_DISCOUNT`.
2. Call `computeSessionTotals()` on `subtotal`, `discount_*`, `service_amount`, `tax_amount`.
3. Insert the computed `discount_amount`, `grand_total` and percentages. **Ignore** any client-sent `grand_total`, percentages or `discount_amount`. (Today we trust these; the change closes that hole.)

### 7.2 `PATCH /api/sessions/[id]` — hardened

Right now the handler writes whatever arrives in the body. New flow:

1. **Whitelist** editable fields: `subtotal`, `tax_amount`, `service_amount`, `discount_type`, `discount_value`, `status`. Drop everything else, including `grand_total`, the `*_percentage` fields, `discount_amount`, `created_by` and `expires_at`.
2. If any money field is present, load the current row (`select subtotal, tax_amount, service_amount, discount_type, discount_value`) and merge the patch over it.
3. Validate the merged discount against the merged subtotal and return `400 INVALID_DISCOUNT` if it fails. For example, lowering the subtotal below a fixed-amount discount is rejected rather than silently clamped.
4. Call `computeSessionTotals(merged)`, then write the patch fields plus the derived fields.

The read then write is not atomic. That's acceptable: only the owner edits these fields, and the last write still leaves the saved values consistent with each other. No RPC is needed.

`useSession.updateSession` keeps sending `Partial<Session>`. Derived fields it sends are harmless because the server drops them.

### 7.3 `POST /api/ocr`

- **Prompt:** add this rule: *"discount is a bill-level reduction line (DISCOUNT, DISKON, PROMO, POTONGAN). If the line shows a percent, return discount_type 'percentage' and the percent number; otherwise 'amount' and the absolute value as a positive number. Use discount_type 'percentage' and discount_value 0 if absent. Do not treat the discount as an item."*
- **Schema:** add `discount_type` (STRING, enum `percentage|amount`) and `discount_value` (NUMBER). Both optional, so older model responses still parse.
- **Sanitise:** unknown type becomes `'percentage'`, and a value that isn't finite or is negative becomes `0` (use `Math.abs`, since receipts print `-193.050`). A percentage above 100 becomes `0`.
- **Response:** `{ items, tax_amount, service_amount, discount_type, discount_value }`.

## 8. Client

### 8.1 Shared component: `DiscountInput`

New file `src/components/DiscountInput.tsx`, used by both forms:

```tsx
interface DiscountInputProps {
  type: DiscountType;
  value: string;                         // raw input string, like existing forms
  resolvedAmount: number;                // for the "−193.050" hint
  onChange: (type: DiscountType, value: string) => void;
  error?: string;
  disabled?: boolean;
}
```

- **Layout:** segmented `% | IDR` toggle plus a number input. When type is `%`, a hint below shows `−IDR 193.050`.
- **Switching type** clears the value. We don't convert between % and IDR, which avoids surprise rounding.
- **Styling:** reuses the `IDR` prefix pattern and Tailwind tokens from `TaxServiceInput`.

### 8.2 Create page (`src/app/page.tsx`)

- **State:** `discountType`, `discountValue`.
- **OCR prefill:** when `result.discount_value > 0`, set both.
- **Totals:** the `useMemo` block calls `computeSessionTotals()` instead of its inline math. It returns `discountAmount`, `grandTotal`, `taxPct` and `servicePct`.
- **Layout:** place `<DiscountInput>` between the items list and the Service/Tax inputs. The summary `<dl>` adds a `Discount (15%)  −193.050` row, shown only when the amount is above 0.
- **Payload:** add `discount_type` and `discount_value`. The client-computed totals are still sent, but the server recomputes them.
- **Errors:** client validation with `validateDiscount` disables submit and shows an inline error.

### 8.3 Owner edit (`TaxServiceInput.tsx`)

- Add discount state that syncs from `session.discount_type` and `session.discount_value` in the existing `useEffect`, and add both to its dependency list.
- Compute the preview with `computeSessionTotals()`. The Tax and Service labels show the corrected %.
- Grid order: Subtotal | Discount, then Service | Tax, then Grand Total across the full width.
- `handleSave` sends only the input fields (`subtotal`, `tax_amount`, `service_amount`, `discount_type`, `discount_value`). Derived fields come back through realtime.

### 8.4 Displays

Rows follow the receipt order: **Subtotal → Discount → Service → Tax → Total**. The Discount row renders only when `discount_share > 0` (or `discount_amount > 0` at session level), shown as `−formatIDR(x)`.

| Location | Change |
|---|---|
| `BillSummary.tsx` per-participant card | Add discount row. |
| `BillSummary.handleCopyBill` | Add `  Discount: −…` line. |
| `bankTransferText.formatAllParticipantsText` | Add discount line per participant. |
| `ParticipantView.tsx` "My Bill" and `handleCopyBill` | Add discount row/line. |
| `ParticipantView.tsx` Receipt Summary | Add `Discount (15%)` row using `session.discount_*`. For the `amount` type the label is just "Discount". |

Put the label logic in a small helper: `formatDiscountLabel(session)` in `src/lib/format.ts` returns `"Discount (15%)"` or `"Discount"`.

### 8.5 `useBillCalculation`

No logic change. `isValid` compares Σ `b.total` against `session.grand_total`, and it passes once the calc module includes the discount. Keep the `< 0.01` tolerance: shares carry 2 decimals, so totals are floats.

## 9. Edge Cases

| Case | Behavior |
|---|---|
| No discount (legacy/new) | `discount_amount = 0`, no discount rows shown; totals and percentages equal today's. |
| 100% discount | `net = 0`; service/tax % fall back to 0 (divide-by-zero guard); totals are service + tax only. |
| Fixed discount > subtotal | Rejected with `INVALID_DISCOUNT` on client and server. |
| Owner lowers subtotal below a fixed discount | PATCH rejected; UI shows error; owner edits discount first. |
| Owner changes subtotal with % discount | `discount_amount` recomputed server-side; tax/service untouched (PRD decision 1). |
| Partial assignment | Discount/tax/service allocated across assigned subtotals only (same as today's tax/service); `isValid` stays false until complete. |
| Participant with 0 subtotal | Weight 0 → all shares 0. |
| `session.subtotal` ≠ Σ items (owner-edited) | Discount follows `session.subtotal` (the receipt); `isValid` flags the mismatch as today. |
| OCR returns negative/"−193.050" | Sanitised with `Math.abs`. |

## 10. Testing Plan (Vitest)

| File | Cases |
|---|---|
| `src/lib/calculations.test.ts` | `resolveDiscountAmount`: pct, amount, rounding (e.g. 15% of 1_287_001), clamp. `computeSessionTotals`: PRD fixture (grand total 1_287_580, 7.00% / 10.70%); fractional rate (7.5%) unchanged; 100% discount; zero discount. `allocateProportionally`: exact sum, ties, zero weights, empty. `calculateParticipantBills`: PRD 2-person fixture (643_790 each); 3-way equal split of odd amounts sums exactly; existing cases unchanged (2 decimals). |
| `src/lib/validation.test.ts` | `validateDiscount`: bad type, NaN, negative, pct 100.01, amount > subtotal, valid bounds. |
| `src/hooks/useBillCalculation.test.ts` | `isValid` true for fully assigned discounted fixture. |
| `src/app/api/sessions/route.test.ts` | POST ignores client `grand_total`/`discount_amount`; invalid discount → 400 `INVALID_DISCOUNT`. |
| `src/app/api/sessions/[id]/route.test.ts` (new) | PATCH whitelist drops `created_by`/`grand_total`; merge + recompute on subtotal change with % discount; rejects subtotal below fixed discount. |
| `src/components/BillSummary.test.tsx` | Discount row hidden at 0, shown when > 0; included in Copy and Copy All text. |
| `src/components/DiscountInput.test.tsx` (new) | Toggle clears value; hint shows resolved amount. |
| OCR | Unit-test the sanitiser (extract to `sanitiseDiscount()` and export it). |

Manual QA: scan the Yeok Jeon receipt and confirm the prefill and the 1.287.580 grand total. Then create the session, assign items across 3 people, and confirm the Copy All totals add up to the grand total.

## 11. Rollout

1. Apply migration `007` in Supabase. It's additive with defaults and safe to run before the deploy.
2. Deploy the app. Old clients (cached PWA) keep working: they don't send discount fields, the server defaults to 0, and the PATCH whitelist ignores the derived fields they send.
3. No feature flag. With no discount entered, the feature is invisible.
4. Rollback: revert the app. The columns can stay because old code ignores them.

## 12. Implementation Order

Each step can go out as its own commit:

1. Migration + types.
2. `calculations.ts` helpers + `calculateParticipantBills` + tests.
3. `validateDiscount` + tests.
4. `POST` / `PATCH` session routes + tests.
5. OCR prompt/schema/sanitiser + `useBillScan` type.
6. `DiscountInput` + create page.
7. `TaxServiceInput`.
8. `BillSummary`, `ParticipantView`, `bankTransferText`, `format.ts` + tests.
9. Manual QA with the reference receipt.

# Bill Discount — PRD & Tech Plan

## Context

Restaurant receipts often carry a bill-level discount (promo, member, bank card). Example — Yeok Jeon Grandma Beer, Gading Serpong:

| Line | Amount (IDR) | How it's derived |
|---|---|---|
| Subtotal | 1.287.000 | sum of line items |
| DISCOUNT 15% | −193.050 | 15% × subtotal |
| Service Charge | 76.577 | 7% × (subtotal − discount) = 7% × 1.093.950 |
| PB1 | 117.053 | 10% × (subtotal − discount + service) = 10% × 1.170.527 |
| **Grand Total** | **1.287.580** | 1.093.950 + 76.577 + 117.053 |

Today the app has no discount concept. `sessions` stores `subtotal`, `tax_amount`, `service_amount`, `grand_total`, and `calculateParticipantBills` computes `total = subtotal + tax_share + service_share`. On this receipt that yields 1.480.630 instead of 1.287.580 — everyone overpays by ~193k in aggregate, and `useBillCalculation.isValid` fails because the bills don't sum to `grand_total`.

The OCR prompt also ignores the discount line, and `TaxServiceInput` computes tax/service % against the gross subtotal, which understates them once a discount exists (5.9% service here instead of 7%).

## Goal

Let a session carry one bill-level discount, applied to the **subtotal before tax and service charge**, and distribute it fairly across participants so each person's total reflects the discount and all totals sum to the receipt's grand total.

## Requirements

1. **Discount input** — Session has an optional discount, entered either as:
   - a **percentage** of the subtotal (e.g. 15%), or
   - a **fixed amount** in IDR (e.g. 50.000).
   Default: no discount (0). Only one discount per session.
2. **Base** — Discount is always computed on the item subtotal, before tax and service:
   `discount_amount = type === 'percentage' ? round(subtotal × pct / 100) : fixed_amount`
3. **Clamp** — `0 ≤ discount_amount ≤ subtotal`; percentage `0–100`. Reject otherwise.
4. **Grand total** — `grand_total = subtotal − discount_amount + service_amount + tax_amount`.
5. **Tax/service stay absolute** — `tax_amount` and `service_amount` remain the amounts printed on the receipt (they are already computed by the restaurant on the discounted base). We do **not** recompute them from percentages.
6. **Percentage display** — The existing tax/service calculation is unchanged: each is `amount / base × 100`, rounded to 2 decimals, so fractional rates such as 7,5% stay exactly as entered. The only change is the base, which becomes the subtotal after discount:
   - service % = `service_amount / (subtotal − discount)`
   - tax % = `tax_amount / (subtotal − discount)`
   With no discount this is identical to today. Stored `tax_percentage` / `service_percentage` follow the same formulas. (For the reference receipt the tax label reads 10,7%, because the PB1 printed there is also charged on service; the amounts, not the labels, drive the split.)
7. **Per-participant split** — Discount is distributed proportionally to each participant's item subtotal (same rule already used for tax and service):
   - `discount_share_i = discount_amount × (subtotal_i / Σ subtotal)`
   - `total_i = subtotal_i − discount_share_i + service_share_i + tax_share_i`
   Σ `total_i` must equal `grand_total` (within rounding) when all items are assigned.
8. **Rounding** — Every share (subtotal, discount, service, tax, total) keeps 2 decimals, as today. Remainder cents are allocated (largest-remainder) so each column and the totals sum exactly to `grand_total`. (Also fixes the existing cent-level rounding drift.)
9. **OCR** — Receipt parser extracts the discount line when present, returning `discount_type` + `discount_value` (percentage if the line shows `%`, else amount). Pre-fills the create-session form; user can edit.
10. **Create-session form** (`src/app/page.tsx`) — New "Discount" row between Subtotal and Service: toggle `% | IDR` + number input. Summary shows `Discount (15%) −193.050` and the corrected grand total.
11. **Owner edit** (`TaxServiceInput`) — Same discount control; saving persists discount fields and recomputed `grand_total` / percentages.
12. **Bill displays** — Show a discount line (only when > 0) in:
    - `BillSummary` per-participant breakdown and copied text
    - `ParticipantView` "My Bill", copied text, and the session totals block
    Order: Subtotal → Discount → Service → Tax → Total (matches receipt).
13. **Realtime** — Discount changes on `sessions` propagate through the existing session realtime subscription; no new channel.
14. **Backward compatibility** — Existing sessions default to `discount_type = 'percentage'`, `discount_value = 0`, `discount_amount = 0`; their totals are unchanged.

## Non-Requirements (v1)

- Item-level discounts (e.g. "buy 1 get 1 on beer") — bill-level only.
- Multiple stacked discounts / promo codes.
- Discount applied after tax or on service charge.
- Excluding specific participants or items from the discount (decided: not planned).
- Recomputing tax/service from percentages when the discount changes (user edits those amounts manually if needed).

## Data Model

Migration `supabase/migrations/007_session_discount.sql`:

```sql
ALTER TABLE sessions
  ADD COLUMN discount_type   VARCHAR(10)   NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage', 'amount')),
  ADD COLUMN discount_value  DECIMAL(12,2) NOT NULL DEFAULT 0
    CHECK (discount_value >= 0),
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0),
  ADD CONSTRAINT discount_pct_range
    CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  ADD CONSTRAINT discount_le_subtotal
    CHECK (discount_amount <= subtotal);
```

- `discount_value` — what the user entered (15 or 50000). Kept so the UI can re-show "15%".
- `discount_amount` — resolved IDR amount (193050). Single source of truth for calculations; server recomputes it from `discount_type`/`discount_value`/`subtotal` on every write, never trusting the client value.

## Type Changes (`src/types/index.ts`)

```ts
export type DiscountType = 'percentage' | 'amount';

interface Session {
  // ...
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
}

interface ParticipantBill {
  // ...
  discount_share: number;
}

interface CreateSessionRequest {
  // ...
  discount_type?: DiscountType;
  discount_value?: number;
}
```

## Implementation Plan

1. **Pure calc helpers** (`src/lib/calculations.ts`)
   - `resolveDiscountAmount(subtotal, type, value): number` — rounds, clamps.
   - `calculateGrandTotal({ subtotal, discount_amount, service_amount, tax_amount })`.
   - Update `calculatePercentages` to take `discountAmount` and use the bases in Req 6.
   - Update `calculateParticipantBills`: add `discount_share`, new `total` formula, 2-decimal rounding with remainder allocation so columns sum exactly.
2. **Validation** (`src/lib/validation.ts`) — `validateDiscount(type, value, subtotal)`; error code `INVALID_DISCOUNT` added to `APIErrorCode`.
3. **Migration** — `007_session_discount.sql` as above.
4. **API**
   - `POST /api/sessions` — accept `discount_type`/`discount_value`, validate, compute `discount_amount` + `grand_total` server-side.
   - `PATCH /api/sessions/[id]` — same; if `subtotal` changes on a percentage discount, recompute `discount_amount`.
5. **OCR** (`src/app/api/ocr/route.ts`) — add `discount_type`/`discount_value` to prompt rules and response schema (optional, default 0); sanitise like tax/service. Prompt rule: *"discount is a bill-level reduction line (DISCOUNT, DISKON, PROMO). If it shows a %, return discount_type 'percentage' and the percent; otherwise 'amount' and the absolute value (positive number). Use 0 if absent."*
6. **UI**
   - `src/app/page.tsx` — discount control + summary line; include in create payload.
   - `TaxServiceInput.tsx` — discount control; correct % labels; save discount fields.
   - `BillSummary.tsx`, `ParticipantView.tsx` — discount line in breakdown and copy text.
7. **Tests** (Vitest)
   - `calculations.test.ts`: receipt fixture above → grand total 1.287.580; participant totals sum exactly to grand total; percentage vs amount; clamp at subtotal; zero-discount regression (existing tests unchanged).
   - `calculatePercentages`: receipt fixture → service 7.00%, tax 10.70%; no-discount fixtures unchanged (e.g. 7.5% stays 7.5%).
   - `validation.test.ts`: pct > 100, negative, amount > subtotal rejected.
   - `useBillCalculation.test.ts`: `isValid` true for the receipt fixture when fully assigned.
   - `BillSummary.test.tsx`: discount line rendered only when > 0 and included in copied text.
   - `sessions/route.test.ts`: server ignores client-sent `discount_amount` and recomputes.

## Worked Example (Acceptance)

Two participants from the receipt: A takes items worth 643.500, B takes 643.500.

| | A | B | Sum |
|---|---|---|---|
| Subtotal | 643.500 | 643.500 | 1.287.000 |
| Discount share | −96.525 | −96.525 | −193.050 |
| Service share | 38.288,50 | 38.288,50 | 76.577 |
| Tax share | 58.526,50 | 58.526,50 | 117.053 |
| **Total** | **643.790** | **643.790** | **1.287.580** |

(Shares are split to 2 decimals. Any leftover cent goes to the largest fractional share; ties → larger subtotal, then first participant.)

## Acceptance Criteria

- Scanning the example receipt pre-fills Discount 15%, Service 76.577, Tax 117.053, and the form shows Grand Total 1.287.580.
- Tax/service labels show 10.7% / 7.0% for the example; sessions without a discount show the same percentages as today.
- With all items assigned, participant totals sum exactly to `grand_total`, and `isValid` is true.
- Sessions created before the migration render identically (no discount line, same totals).
- Discount > subtotal or percentage > 100 is rejected by both client and API.

## Decisions

1. **Tax/service on discount change** — Manual. Changing the discount on an existing session does not auto-scale `tax_amount` or `service_amount`; the owner edits them by hand if needed (see Req 5).
2. **Excluding participants from the discount** — No. The discount always applies to every participant proportionally (see Req 7). Not planned.

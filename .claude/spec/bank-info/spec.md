# Bank Info & Paid Status — Tech Plan

## Context

Today the app stops at "here's what each person owes." There is no way to tell participants *where* to send the money, and no way for the session creator to see who has actually paid. This adds two related capabilities:

1. **Session creator declares a destination bank account** during session creation — bank chosen from a short curated list (BCA, Jago, GoPay) or free-text "Other", plus an account number (and account holder name).
2. **Participants see that bank info** on the session page (and embedded in their copied bill text / shared participant link copy) and can **mark themselves "Paid"** once they've transferred.

The creator can then glance at the session and see paid vs unpaid at a glance.

Curated banks ship with a logo asset; "Other" is a label-only entry with no logo.

## Requirements

1. Session schema carries `bank_name`, `bank_account_number`, `bank_account_holder` (all optional — banking is not required to create a session).
2. Curated bank list is hard-coded: `BCA`, `Jago`, `GoPay`, `Other` (Other expects a free-text bank name in `bank_name`).
3. Each curated bank has a logo asset shipped under `public/banks/` (BCA, Jago, GoPay). `Other` renders a neutral icon.
4. Create-session page gains a "Payment Destination" section with bank selector, account number, and account holder name. All three are optional but **must be saved together** (either all filled or all empty — partial state is rejected client-side).
5. Session page (owner view) shows the saved bank info as a read-only card with bank logo, account number, account holder.
6. Participant view shows the same bank-info card prominently above "My Bill".
7. Participant view gains a "Mark as Paid" toggle button. Toggling updates `participants.is_paid` + `participants.paid_at` server-side and reflects optimistically in the UI.
8. Owner view shows each participant's paid status next to their bill row (badge + timestamp on hover).
9. `BillSummary.handleCopyBill` and `ParticipantView.handleCopyBill` append bank info to the copied text when present.
10. `ShareModal` participant tab includes bank info next to / underneath each generated link (visible, copyable).
11. Realtime: paid-status changes propagate to all open clients via existing Supabase realtime channel (participants table is already subscribed — extend the row payload handler).
12. Validation: account number is a digit string (8–20 digits); account holder is 1–80 chars; custom bank name is 1–30 chars.

## Non-Requirements

- No payment processing, no integration with bank APIs, no real-time settlement verification — paid status is a self-reported flag.
- No "request payment" notifications (push, email, SMS).
- No reconciliation between the marked total and the actually transferred amount.
- No history of past banks per device / per user — user re-enters bank info each session (acceptable for v1; revisit if friction is real).
- No support for multi-bank (one bank account per session).
- No QRIS code generation for the bank account.
- No editing of bank info after session creation in v1 (read-only post-create). Can be added later if needed.

## Data Model

### New table: `session_bank_accounts`

Bank info lives in its own table from day one, with a foreign key to `sessions`. For v1 the relationship is **1 session → at most 1 bank account**, enforced by a `UNIQUE` constraint on `session_id`. When we later want 1-to-many (multiple destinations per session — e.g. split payments to two banks), the unblocking change is a single `DROP CONSTRAINT` migration; no app-side schema rewrite, no column moves.

```sql
CREATE TABLE session_bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  bank_name            TEXT NOT NULL,
  bank_account_number  TEXT NOT NULL,
  bank_account_holder  TEXT NOT NULL,
  display_order        SMALLINT NOT NULL DEFAULT 0,  -- reserved for future 1-to-many ordering
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bank_account_number_format CHECK (bank_account_number ~ '^[0-9]{8,20}$'),
  CONSTRAINT bank_name_length           CHECK (char_length(bank_name) BETWEEN 1 AND 30),
  CONSTRAINT bank_account_holder_length CHECK (char_length(bank_account_holder) BETWEEN 1 AND 80)
);

-- v1 single-bank lock. To enable multi-bank later: DROP CONSTRAINT session_bank_accounts_session_id_unique.
ALTER TABLE session_bank_accounts
  ADD CONSTRAINT session_bank_accounts_session_id_unique UNIQUE (session_id);

CREATE INDEX idx_session_bank_accounts_session_id ON session_bank_accounts(session_id);
```

**Why a separate table, not nullable columns on `sessions`:**
- All-or-nothing semantics fall out of "row exists / row doesn't exist" — no CHECK constraint juggling three nullable columns together.
- The future 1-to-many migration is one statement (drop the unique) — `sessions` schema never has to change.
- Reads stay cheap: one LEFT JOIN, or a separate query alongside the existing session fetch.
- `ON DELETE CASCADE` keeps bank rows tied to session lifecycle automatically.

### Participants table — add columns

```sql
ALTER TABLE participants
  ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN paid_at TIMESTAMPTZ;
```

Migration file: `supabase/migrations/005_bank_info_and_paid_status.sql` (contains both the new table and the participants alter).

### TypeScript types (`src/types/index.ts`)

```ts
export type BankCode = 'BCA' | 'Jago' | 'GoPay' | 'Other';

export interface SessionBankAccount {
  id: string;
  session_id: string;
  bank_name: string;          // 'BCA' | 'Jago' | 'GoPay' | free text for Other
  bank_account_number: string;
  bank_account_holder: string;
  display_order: number;
  created_at: string;
}

// Convenience shape used by forms and the read-only card.
export interface BankInfoInput {
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

interface Participant { /* + */
  is_paid: boolean;
  paid_at: string | null;
}

// SessionFull aggregate gains the (optional, v1: at-most-one) bank account.
export interface SessionFull {
  session: Session;
  participants: Participant[];
  items: ItemWithAssignments[];
  bank_account: SessionBankAccount | null; // v1: 0 or 1; future: switch to SessionBankAccount[]
}
```

For v1, code reads `bank_account` (singular, nullable) everywhere. The future multi-bank switch becomes a typed change in `SessionFull` plus the components that render it — all UI call sites already go through `BankInfoCard`, so the blast radius is small.

### Bank catalog (`src/lib/banks.ts` — new)

```ts
export interface BankOption {
  code: BankCode;           // 'BCA' | 'Jago' | 'GoPay' | 'Other'
  label: string;            // user-facing name
  logoSrc: string | null;   // /banks/bca.svg etc., null for Other
}

export const BANK_OPTIONS: BankOption[] = [...];
export function resolveBankLogo(bank_name: string): string | null { ... }
```

## API Changes

- `POST /api/sessions` — accept optional `bank_account: BankInfoInput | null` in body. If present, the handler creates the session row first, then inserts one row into `session_bank_accounts` with that session's id (transactional). All-or-nothing is enforced by the object's required-fields shape, not by nullable columns.
- `GET /api/sessions/[id]` — include `bank_account` (singular, nullable) in the response by LEFT JOIN-ing `session_bank_accounts`. When the v1 unique constraint is later dropped, this endpoint switches to returning an array; clients reading `bank_account` would then need updating, hence the typed singular field today.
- `PATCH /api/sessions/[id]/participants/[participantId]` — already exists; extend to accept `{ is_paid: boolean }`. Server stamps `paid_at = now()` on transition to true and `paid_at = null` on transition to false.
- No bank-edit endpoint in v1 (out of scope — see Non-Requirements).

## UI Changes

### Create-session page (`src/app/page.tsx`)
- New `<BankInfoForm>` section between "Tax & Service" and "Summary".
- Form state: `bankCode` (radio), `customBankName` (only when Other), `accountNumber`, `accountHolder`.
- Bank selector renders 4 tile-style buttons (logo + label); selected tile gets `bg-brand-primary-soft border-brand-primary`.
- Account number input is `inputMode="numeric"`, pattern enforced.
- `handleCreateSession` includes resolved bank info (or omits if empty) in the POST body.

### Session page (`src/app/session/[id]/page.tsx`)
- New `<BankInfoCard>` displayed:
  - Owner view: in the left column above "Receipt Summary".
  - Participant view: at the top, above "My Bill".
- Card shows bank logo (32×32), bank name, masked-then-revealed account number with a Copy button, and account holder name.
- Owner sees a "paid" pill on each participant row in `BillSummary`.

### Participant view (`src/components/ParticipantView.tsx`)
- New `<MarkAsPaidButton>` after "My Bill" section: large CTA "Mark as Paid" → switches to "Paid ✓ on <date>" + secondary "Undo" link.

### Components to add
- `src/components/BankInfoForm.tsx` — create-session input.
- `src/components/BankInfoCard.tsx` — read-only display.
- `src/components/MarkAsPaidButton.tsx` — paid toggle for participants.

### Hook changes
- `useSession` exposes `markPaid(participantId, paid: boolean)` — wraps the PATCH call, applies optimistic update, rolls back on failure (same pattern as `claimItem`).

### Copy / share enhancements
- `BillSummary.handleCopyBill` — when `bank_account` is non-null, append:
  ```
  ─────────────
  Transfer to:
    {bank_name} - {account_number}
    a/n {account_holder}
  ```
- `ParticipantView.handleCopyBill` — same append.
- `ShareModal` participants tab — under each participant link, show "Transfer to: <bank> <acct> — a/n <holder>" with its own Copy button.

## Asset Sourcing

- `public/banks/bca.svg`, `public/banks/jago.svg`, `public/banks/gopay.svg`.
- Source: official press/brand pages or Brandfetch (free for in-product use of bank/brand marks). License each before commit.
- Square aspect, ≤8 KB, monochrome-safe variant preferred to render well on the brand-cyan-soft tile.
- The `public/` directory does not exist yet — create it as part of T1.4.

## Plan

Staged so each step is independently shippable and visually verifiable.

**Stage 1 — Schema + types.** Land DB migration (`session_bank_accounts` table + UNIQUE(session_id) + participants alter), update TS types (`SessionBankAccount`, `SessionFull.bank_account: SessionBankAccount | null`), add bank catalog and assets. No UI yet.

**Stage 2 — Create-session bank entry.** Build `BankInfoForm`, wire into `page.tsx`, extend `POST /api/sessions` to transactionally insert the session and (if provided) the single `session_bank_accounts` row. End: a session can be saved with bank info, visible in DB. No display yet.

**Stage 3 — Session-page bank display.** Extend `GET /api/sessions/[id]` to return `bank_account`. Build `BankInfoCard`, render on both owner and participant views. Extend copy-bill text and `ShareModal` participants tab.

**Stage 4 — Paid status.** Extend participants PATCH endpoint, add `markPaid` hook method, build `MarkAsPaidButton`, surface status in `BillSummary` for the owner. Wire realtime so it updates across clients.

**Stage 5 — Polish & validate.** Validation messages, empty-state handling (no bank set → hide card / skip copy block), AA contrast, manual end-to-end test of golden path with two browser tabs.

## Task Breakdown

### Stage 1 — Schema + types
- [ ] **T1.1** Write `supabase/migrations/005_bank_info_and_paid_status.sql` containing: (a) `CREATE TABLE session_bank_accounts` with CHECK constraints, (b) `UNIQUE(session_id)` constraint, (c) `idx_session_bank_accounts_session_id`, (d) `ALTER TABLE participants ADD is_paid / paid_at`.
- [ ] **T1.2** Apply migration locally; verify with manual inserts: second row for same session_id is rejected by the unique constraint; CHECK constraints reject bad formats.
- [ ] **T1.3** Extend `src/types/index.ts`: new `BankCode`, `SessionBankAccount`, `BankInfoInput`; participant gains `is_paid` + `paid_at`; `SessionFull.bank_account: SessionBankAccount | null`.
- [ ] **T1.4** Create `public/banks/` and drop `bca.svg`, `jago.svg`, `gopay.svg`. Confirm licensing.
- [ ] **T1.5** Create `src/lib/banks.ts` with `BANK_OPTIONS` and `resolveBankLogo()`.

### Stage 2 — Create-session bank entry
- [ ] **T2.1** Build `src/components/BankInfoForm.tsx` — controlled component, emits `BankInfoInput | null` upward.
- [ ] **T2.2** Mount it in `src/app/page.tsx` between Tax & Service and Summary.
- [ ] **T2.3** Extend `handleCreateSession` to send `bank_account` (object or null) in the POST body.
- [ ] **T2.4** Extend `POST /api/sessions` (`src/app/api/sessions/route.ts`) to optionally insert a `session_bank_accounts` row in the same transaction as the session insert. Roll back both on failure.
- [ ] **T2.5** Manual verify: create a session with bank info, with Other, and without bank info — all three paths land cleanly; bank row exists only when expected.

### Stage 3 — Session-page bank display
- [ ] **T3.1** Extend `GET /api/sessions/[id]` to LEFT JOIN `session_bank_accounts` and return `bank_account: SessionBankAccount | null` on the response.
- [ ] **T3.2** Update `useSession` to surface `bankAccount` from the fetched payload.
- [ ] **T3.3** Build `src/components/BankInfoCard.tsx` — props: `bankAccount: SessionBankAccount | null`. Returns null when null.
- [ ] **T3.4** Render `BankInfoCard` in owner view of `src/app/session/[id]/page.tsx` (left column, above Receipt Summary).
- [ ] **T3.5** Render `BankInfoCard` in participant view of `ParticipantView.tsx` (above My Bill).
- [ ] **T3.6** Extend `BillSummary.handleCopyBill` to append the Transfer-to block when `bankAccount` is present.
- [ ] **T3.7** Extend `ParticipantView.handleCopyBill` to append the Transfer-to block.
- [ ] **T3.8** Extend `ShareModal` participants tab to show transfer-to text + per-link Copy button.
- [ ] **T3.9** When `bank_account` is null, all three render paths must gracefully omit the bank block.
- [ ] **T3.10** Manual verify.

### Stage 4 — Paid status
- [ ] **T4.1** Extend `PATCH /api/sessions/[id]/participants/[participantId]` to accept `{ is_paid: boolean }`; server stamps `paid_at`.
- [ ] **T4.2** Add `markPaid(participantId, paid)` to `useSession` hook with optimistic apply + rollback.
- [ ] **T4.3** Build `src/components/MarkAsPaidButton.tsx` — large CTA → confirmed state with timestamp + Undo.
- [ ] **T4.4** Mount in `ParticipantView` right after "My Bill".
- [ ] **T4.5** In `BillSummary` (owner view), render a "Paid ✓" pill (`status/success`) next to participants where `is_paid`, "Unpaid" muted chip otherwise. Show `paid_at` on hover/title.
- [ ] **T4.6** Extend realtime handler in `useSession` so participant row updates push `is_paid` / `paid_at` into local state.
- [ ] **T4.7** Manual verify two-tab flow: tab A (participant) marks paid → tab B (owner) sees pill flip without refresh.

### Stage 5 — Polish & validate
- [ ] **T5.1** Validation messages: account number digits-only, length 8–20, account holder 1–80, custom bank name 1–30.
- [ ] **T5.2** Empty bank-info handling on all surfaces (no card, no copy block, no share text).
- [ ] **T5.3** AA contrast on the new card surfaces and "Paid" pill.
- [ ] **T5.4** Add unit test for the `is_paid` PATCH server-side timestamp logic.
- [ ] **T5.5** Manual end-to-end on a fresh session: owner creates with bank → participant opens link → sees bank, marks paid → owner sees pill flip → copy-bill text contains the Transfer-to block.

## Acceptance

- A session created with bank info shows that bank's logo + account number + holder on the session page (both owner and participant views).
- A participant can mark themselves Paid and undo; the owner sees the change in real time.
- The copied bill text and the per-participant share link include the Transfer-to block when bank info exists.
- A session created without bank info works exactly as today — no empty cards, no "null" strings, no broken share text.
- Schema constraint blocks partial bank info at the DB level (`NOT NULL` columns on `session_bank_accounts` — if the session has no bank, the row simply doesn't exist).
- A second insert into `session_bank_accounts` with the same `session_id` is rejected by the unique constraint. Lifting the v1 single-bank lock later is a one-line migration (`DROP CONSTRAINT session_bank_accounts_session_id_unique`).

## Open Questions

- **Q1**: Do we want to persist the *owner's* last-used bank info in `localStorage` so it pre-fills the next session? (Likely yes — quick win, low risk. Defer to v1.1.)
- **Q2**: Should "Paid" be confirmable by the owner (two-step: participant claims paid → owner confirms received)? Simpler v1 is participant-only; revisit if false-positives become a problem.
- **Q3**: Should `Other` allow a logo upload? (Out of scope for v1 — neutral icon only.)

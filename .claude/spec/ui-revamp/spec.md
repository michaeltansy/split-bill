# UI Revamp — GoPay-Inspired Tech Plan

## Context

Split-bill app currently uses a generic Tailwind palette (gray-50 background, blue-600 buttons, mixed gray text, system Arial font). We want the visual language to feel like **GoPay** — Indonesia's dominant payment app — since our audience already associates "money / bill splitting" with that look.

Distilled GoPay identity (public sources):
- **Typeface**: Custom **Rupa** family by Tokotype (Sans for body / sub-headers, Serif for headlines). Friendly, modern, slightly organic. Not freely licensed → we substitute with **Plus Jakarta Sans** (free, Indonesian-origin, Rupa-adjacent).
- **Primary color**: GoPay cyan-blue ≈ **#00AED6** ("Iris Blue") — used on CTAs, links, highlights only.
- **Neutrals**: Near-black text (`#0A0A0A`) on white cards (`#FFFFFF`) over a light surface (`#F5F7FA`).
- **Style**: Flat white cards, soft shadows, rounded corners, generous spacing, high-contrast text. No gray-on-gray body copy.

## Requirements

1. Replace the page background, card surfaces, and CTA color tokens with the GoPay-aligned palette defined in §Design Tokens.
2. Replace the global font with **Plus Jakarta Sans** (loaded via `next/font/google`); remove the Arial fallback in `globals.css`.
3. All body, label, and heading text uses `text/primary` (`#0A0A0A`); `text/secondary` (`#4A4A4A`) is allowed only for low-priority metadata.
4. All primary CTAs (Create Session, primary action buttons) use `brand/primary` (`#00AED6`) with white text and `brand/primary-hover` on hover/active.
5. Focus rings switch from blue-600 to `brand/primary`.
6. Apply revamp to the two main user-facing pages and all components they render:
   - `src/app/page.tsx` (create session)
   - `src/app/session/[id]/page.tsx` (session detail)
   - Components: `ItemList`, `ItemCard`, `TaxServiceInput`, `BillSummary`, `ParticipantManager`, `ParticipantView`, `ShareModal`, `Toast`.
7. AA contrast preserved everywhere; cyan never used as a flood background behind text.
8. Existing functionality, layout structure, and component APIs unchanged — this is a presentation-layer change only.

## Non-Requirements

- No new logo, icon set, illustrations, or 3D assets.
- No dark mode (the existing dark-mode CSS variables stay but are not redesigned).
- No copy / localization changes.
- No component API or prop changes; no refactor of state, hooks, or data flow.
- No new dependencies beyond `next/font/google` (already used).
- Not licensing or shipping the real Rupa typeface.
- No animation / motion redesign beyond what already exists.

## Design Tokens

| Token | Value | Use |
|---|---|---|
| `brand/primary` | `#00AED6` | Primary CTA, links, focus ring, active states |
| `brand/primary-hover` | `#0098BC` | Hover / pressed CTA |
| `brand/primary-soft` | `#E5F7FB` | Tinted backgrounds, chips, selected rows |
| `text/primary` | `#0A0A0A` | All body and heading text |
| `text/secondary` | `#4A4A4A` | Captions, metadata only |
| `surface/bg` | `#F5F7FA` | Page background |
| `surface/card` | `#FFFFFF` | Card / section background |
| `border/subtle` | `#E5E7EB` | Card edges, dividers, input borders |
| `status/success` | `#1BAE6A` | Paid, confirmed |
| `status/danger` | `#E5484D` | Remove, error |

Tailwind exposure: extend `tailwind.config.ts` with a `brand`, `surface`, `text-` namespace (or use arbitrary values during migration if cheaper).

Typography rules:
- Font stack: `"Plus Jakarta Sans", system-ui, sans-serif`.
- Headings (`h1`, `h2`): `font-weight: 700`, `text/primary`.
- Body: `font-weight: 400`, `text/primary`.
- Labels/captions: `font-weight: 500`, size `xs–sm`, `text/primary` by default.

## Plan

The revamp is staged so each step is independently shippable and visually verifiable.

**Stage 1 — Foundations.** Wire tokens and fonts at the root: extend Tailwind, swap `Inter` → `Plus Jakarta Sans` in `layout.tsx`, update `globals.css` (focus ring color, body font, drop Arial). After this stage the app should *type-feel* like GoPay even before any component edits.

**Stage 2 — Create-session page.** Migrate `src/app/page.tsx` and its inline sections (Items, Tax & Service, Summary, CTA) to the new tokens. This page is already partially updated (text-black sweep done), so it's the cheapest win.

**Stage 3 — Session detail page + components.** Migrate `src/app/session/[id]/page.tsx` and every component it renders (`ItemList`, `ItemCard`, `TaxServiceInput`, `BillSummary`, `ParticipantManager`, `ParticipantView`, `ShareModal`). Same find-and-replace pattern as Stage 2.

**Stage 4 — Polish & sweep.** Audit `Toast`, focus rings, `themeColor` meta, and any remaining `blue-600` / `text-gray-*` strays. Verify AA contrast on each surface. No new design here — just consistency.

Each stage ends with a manual visual check in the browser (golden path: create a session → add items → open as participant → claim items).

## Task Breakdown

### Stage 1 — Foundations
- [ ] **T1.1** Extend `tailwind.config.ts` with `colors.brand`, `colors.surface`, `colors.text-primary/secondary`, `colors.border-subtle`, `colors.status` tokens from §Design Tokens.
- [ ] **T1.2** In `src/app/layout.tsx`, replace `Inter` import with `Plus_Jakarta_Sans` from `next/font/google` (weights `400, 500, 600, 700`). Apply via `className` on `<body>`.
- [ ] **T1.3** In `src/app/globals.css`: remove `Arial, Helvetica, sans-serif` fallback from `body`; change `*:focus-visible` outline color from `#2563eb` to `#00AED6`; keep the rest.
- [ ] **T1.4** In `src/app/layout.tsx`, update `viewport.themeColor` from `#2563eb` to `#00AED6`.

### Stage 2 — Create-session page (`src/app/page.tsx`)
- [ ] **T2.1** Page background: `bg-gray-50` → `bg-[surface/bg]` (`#F5F7FA`).
- [ ] **T2.2** Card sections (Items, Tax & Service, Summary): keep `bg-white`, bump radius to `rounded-2xl`, keep `shadow-sm`.
- [ ] **T2.3** Replace remaining `text-gray-*` / `text-black` with `text-text-primary` token (semantic alias).
- [ ] **T2.4** Inputs: `border` → `border-border-subtle`; focus ring `focus:ring-blue-500` → `focus:ring-brand-primary`.
- [ ] **T2.5** Primary CTA (`Create Session`): `bg-blue-600 hover:bg-blue-700` → `bg-brand-primary hover:bg-brand-primary-hover`, `rounded-lg` → `rounded-xl`.
- [ ] **T2.6** Secondary action `+ Add item`: text color uses `text-brand-primary`, weight `font-semibold`.
- [ ] **T2.7** Trash icon stays `status/danger`.
- [ ] **T2.8** Manual verify in browser.

### Stage 3 — Session detail (`src/app/session/[id]/page.tsx` + components)
- [ ] **T3.1** Apply same page-background / card / heading sweep to `session/[id]/page.tsx`.
- [ ] **T3.2** `ItemList.tsx`, `ItemCard.tsx` — surfaces, text, claim button color → `brand/primary`; selected/claimed-by-me row → `brand/primary-soft`.
- [ ] **T3.3** `TaxServiceInput.tsx` — input borders, focus ring, label text.
- [ ] **T3.4** `BillSummary.tsx` — totals use `text/primary`; grand total stays bold + larger size, *not* a lighter color.
- [ ] **T3.5** `ParticipantManager.tsx`, `ParticipantView.tsx` — chip / avatar / list row colors; active participant uses `brand/primary-soft`.
- [ ] **T3.6** `ShareModal.tsx` — primary CTA, link color, modal surface.
- [ ] **T3.7** Manual verify the full session flow in the browser.

### Stage 4 — Polish
- [ ] **T4.1** `Toast.tsx` — neutral toast on `surface/card` w/ `text/primary`; success uses `status/success`, error uses `status/danger`.
- [ ] **T4.2** Grep for stray `blue-600`, `blue-700`, `text-gray-500`, `text-gray-600`, `text-gray-700` in `src/`. Replace or justify each remaining occurrence.
- [ ] **T4.3** Verify AA contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text) on every surface using browser devtools.
- [ ] **T4.4** Take before/after screenshots of both pages for the PR.

## Acceptance

- Both pages render in **Plus Jakarta Sans**, not Arial / Inter.
- No `bg-blue-*` or `text-blue-*` remains as a brand surface; brand cyan only appears on CTAs, focus rings, links, and `primary-soft` accents.
- No `text-gray-500/600/700` remains in user-facing text; all body copy is `text/primary`.
- Golden-path session flow works visually and functionally identical to today, just restyled.
- All on-screen text passes AA contrast on its surface.

## Sources

- [Tokotype × GoPay — Rupa typeface](https://grafismasakini.com/project-review/tokotype-gets-festive-for-gopay-with-rupa/en)
- [Tokotype custom font page for GoPay](https://www.tokotype.com/custom-fonts/gopay)
- [Gojek Design System](https://gojek.design/)
- [GoPay brand assets — Brandfetch](https://brandfetch.com/gopay.co.id)
- [#00AED6 "Iris Blue" reference](https://www.htmlcsscolor.com/hex/00AED6)

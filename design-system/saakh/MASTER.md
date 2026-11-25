# Saakh design system (MASTER)

Direction: calm fintech console (Swiss minimal, enterprise banking). Reference feel: Stripe / Razorpay dashboards, Linear. Not a student project: no big rounded blobs, no cream-and-green slabs, no oversized text, no emoji, no gradients.

## Tokens (src/app/globals.css, Tailwind 4 theme)
- Surfaces: `bg-bg` #f6f7f9 page, `bg-surface` #fff cards, `bg-subtle` #f9fafb table heads/wells.
- Text: `text-ink` #0b1220 primary, `text-ink-2` #344054 secondary, `text-muted` #5b6475 tertiary.
- Lines: `border-line` #e4e7ec default, `border-line-strong` #d0d5dd inputs.
- Brand: `primary` #0e4d3a deep green (primary buttons, active nav, the one hero number accent), `primary-soft`. Accent `accent` #b7791f marigold only for tiny brand marks (logo seal), never large fills.
- Status: success, warn, danger, info each with `-soft`.
- Font: IBM Plex Sans + IBM Plex Sans Devanagari; IBM Plex Mono for para citations. Base 15px.

## Type scale
Page title 26/22px semibold tracking -0.01em. Card title 15px semibold. Body 14-15px. Meta 12-13px muted. Eyebrow 11px uppercase tracking 0.08em (`eyebrow`). All money and numbers use `num` (tabular) and `inr()` / `<Money>`.

## Primitives (src/components/ui.tsx), always use these
PageHeader, Card (title/description/actions header with border-b, body px-5 py-4, `flush` for tables), Badge (tones neutral/brand/success/warn/danger/info/accent, optional dot), Para (RBI citation chip "¶ 13(3)"), Money, Stat, Callout, EmptyState, Row, Spinner, cx, inr.
Utilities: `card`, `field`, `label`, `btn-primary`, `btn-ghost`, `btn-accent` (dark ink), `btn-danger`, `btn-lg`, `eyebrow`, `num`.

## Layout
- Desktop >= 1024px: fixed left sidebar 248px (brand lockup, nav, officer card at bottom), content `max-w-[1200px] px-8 py-8`.
- Mobile: top bar 56px white with bottom border; bottom tab bar (3 items) with safe-area padding; content px-4 py-5.
- Case page desktop: main column (stepper + step content) + right sticky summary rail 340px. Mobile: single column, summary collapses into a compact header strip.
- Radii: cards rounded-xl (12px), controls rounded-lg (8px), chips rounded-md. Shadows: `shadow-card` only; `shadow-pop` for menus.
- Spacing rhythm 4/8: gaps 12, 16, 24. Card stack gap-4 (mobile) / gap-5 (desktop).

## Data display
- Tables: header row `bg-subtle text-[12px] font-medium text-muted uppercase tracking-wide`, rows `border-t border-line`, numbers right aligned `num`. Mobile: tables become stacked rows (Row component).
- Status chips via Badge: draft neutral, computed info, approved success, edited_approved success, rejected danger.
- Checks/flags: error = danger Callout, warn = warn, info = neutral list row with icon. Each with Para chip.

## Interaction
- Icons: inline SVG stroke 1.75, 16-20px, Lucide style. `aria-hidden` when decorative; icon-only buttons need aria-label.
- Hover 150ms color transitions only. Focus ring visible (primary). Touch targets >= 40px desktop, 44px mobile.
- Loading: inline Spinner + elapsed seconds; skeletons for lists. Errors next to field. Never a dead end: retry + manual entry.

## Anti-patterns
Cream backgrounds, giant colored hero slabs, emoji, 18px+ body text, pill-shaped everything, centered long text, multiple accent colors, purple/AI gradients, decorative illustrations.

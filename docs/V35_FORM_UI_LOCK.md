# CoinBuddy V3.5 Forms & Modals — Locked UI Contract

Status: **LOCKED**

Reference: `CoinBuddy Dark Theme Form System.png`, approved 15 Aug 2026.

This document is the visual contract for CoinBuddy V3.5 money-entry forms and supporting forms. Future UI work should extend this system rather than introduce another modal/form style.

## Scope

Primary money surfaces:

- Add / Edit Transaction
- Add / Edit Account
- Pay / Pay Down
- Reconcile Account
- Wallet Summary
- Loan Rate Update

Supporting forms:

- Category / budget settings
- Goal
- Sharing → Add Person
- Future person-edit forms should use the same system

## Locked visual rules

- Dark navy sheet: `--cb-form-panel` / `--cb-form-panel-deep`.
- Input surface: `--cb-form-field` with `--cb-form-border`.
- Standard control height: `40px`.
- Standard control radius: `8px`.
- Sheet radius: `18px` on desktop; mobile is an 18px top-radius bottom sheet.
- Primary actions use the strong V3.5 blue action treatment.
- Pay / Pay Down uses the approved purple action treatment.
- Focus is always clearly visible in blue.
- Success stays green; validation/error stays red.
- Labels are compact and readable, not oversized all-caps headings.
- Mobile forms remain bottom anchored to the real viewport and preserve safe-area behavior.
- Desktop uses the same hierarchy in a centered dialog; it must not become a separate design system.

The canonical implementation tokens and scoped compatibility rules live in `src/v35.css`. Shared portal geometry lives in `src/components/ui/V35ModalFrame.tsx`.

## Financial behavior is not part of the visual lock

A visual migration must **not** simplify or reinterpret CoinBuddy's financial model. In particular:

- Recorder / organizer, payer, responsible person, and account owner remain separate concepts.
- Household total, personal economic cost, and tracked bank movement remain separate.
- Reimbursements remain settlements, never income.
- External family payments do not create fake transactions in tracked user accounts.
- People remain people, never accounts.
- Shared-loan full EMI amortization happens exactly once before responsibility/contribution allocation.
- Goal-linked non-liquid investments remain excluded from affordability liquid cash.
- Existing PIN hash compatibility and Android/PWA back-stack behavior are unrelated to this UI migration and must remain unchanged.

If a reference mockup omits an advanced CoinBuddy field that is required for correct financial behavior (for example SIP funding, loan amortization strategy, shared-loan allocation, recurring rules, or goal liquidity protection), keep the field and style it with this locked form system. Do not delete the behavior to make the screen visually simpler.

## Accessibility and testing contract

- Prefer semantic labels and roles.
- Playwright selectors should prefer `getByRole`, `getByLabel`, and established `data-testid` values.
- Core V3.5 shared form sheets expose `data-v35-form-system="locked"`.
- Mobile form sheets must stay within the viewport and remain bottom aligned.
- Form controls must preserve visible focus states and usable touch targets.
- UI regression tests must not be weakened to conceal a real behavior bug.

## Change control

Changes to these visual tokens or the shared form geometry should be treated as a deliberate design-system change. Feature components may add fields and finance-specific helper content, but they should not introduce a new control height, radius, modal shell, focus treatment, or unrelated color language.

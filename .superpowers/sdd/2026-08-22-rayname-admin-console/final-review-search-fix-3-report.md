# Final Review Search Fix Round 3 Report

## Scope

- Base commit: `b8bb631 fix: enforce admin mutation invariants`.
- Reset Member and Lead detail-local state and focus when a query transition replaces entity A with entity B without closing.
- Make every Campaign global-search activation consumable, including repeated activation of the exact same campaign.
- Preserve the selected Campaign row after its query is cleared.
- Preserve the native global-search modal and avoid analytics or authorization changes.

## Finding disposition and root cause

Both reviewer findings were accurate.

1. Member and Lead screens changed the entity prop on an already-mounted detail component. React therefore preserved local role/action selection, note drafts, status messages, tracked URLs, pending state, and the original focus lifecycle across entity identities.
2. Campaign focus depended on a query prop transition. Once a campaign query remained in the URL, selecting that exact result again could be an already-current navigation with no new transition and no focus effect.

## Approved design

- Key each Member and Lead detail by its entity id. React now tears down the old detail lifecycle and mounts a clean entity-specific detail, including fresh local state and focus capture.
- Store the selected Campaign id locally. When a non-null query activation is loaded, focus the selected row and consume the activation with `router.replace("/campaigns", { scroll: false })`. Clearing the prop does not clear local highlight state, while a later identical search creates a fresh null-to-id activation.

## TDD evidence

### RED

- Focused component run: 3 expected failures, 16 passes.
  - DomainNomad inherited Alex's `Builder` Member role selection.
  - DomainNomad inherited Alex's `send-offer` Lead action selection.
  - Clearing the Campaign query removed `aria-current` instead of retaining the selected row.
- The first component run stopped earlier on an unsupported asymmetric `toHaveValue` matcher even though the generated URLs were correct. Those expectations were corrected to hand-derived literal URLs before production changes, then the intended failures above were recorded.
- Focused Chromium run: all 3 campaign journeys failed because the URL remained `?campaign=<id>` rather than consuming the activation back to `/campaigns`.

### GREEN

- Member and Lead A-to-B transitions reset role/action selection, note draft, status, tracked URL, pending state, opener capture, and detail focus through entity-keyed remounts.
- The regression tests dirty record A, transition directly to record B, assert clean B-local state and focus, and verify the Member B record did not receive A's draft note.
- Campaign highlight is now independent of the transient query prop and remains visible after query consumption.
- Repeating the exact Transfer Week search twice from `/campaigns` consumes each query and refocuses the same highlighted row on both activations.

## Verification

- Final focused unit stability gate, twice: 4 files, 22 tests passed on each run.
- Final focused browser stability gate, twice: 3 tests passed on each run.
- `npm test`: 29 files, 209 tests passed.
- `npm run test:e2e`: 45 tests passed, including the new exact same-campaign repeat journey.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Files changed

- Entity lifecycle: `src/features/members/members-screen.tsx`, `src/features/leads/leads-screen.tsx`
- Campaign selection and activation consumption: `src/features/campaigns/campaigns-screen.tsx`
- Component regressions: Member, Lead, and Campaign test files
- Browser regression: `e2e/accessibility.spec.ts`

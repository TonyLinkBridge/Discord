# Final Review Search Fix Round 2 Report

## Scope

- Settled verification base: `d486117 fix: disclose modeled analytics data`.
- Synchronize query-selected Member and Lead details when App Router navigation changes the id without remounting the screen.
- Clear query-opened detail URLs with `router.replace`, preserving provider state, screen filters, scroll position, and focus restoration.
- Reopen the same Member or Lead after close from a subsequent same-route global search.
- Refocus and highlight Campaign rows when `initialSelectedCampaignId` changes on the existing Campaigns route.
- Preserve the native global-search modal, its focus containment/opener restoration, analytics, and mutation schemas.

## Finding disposition and root cause

The reviewer finding was accurate.

1. `MembersScreen` and `LeadsScreen` copied their query id props into local state only during initial mount. App Router same-route query navigation changed the props, but the selected detail state remained stale.
2. Closing a query-opened detail only cleared local selection. The query string remained current, so selecting that identical search result again could be an already-current navigation and could not reopen the detail.
3. `CampaignsScreen` rendered the new row highlight from its changed prop, but its focus effect depended only on initial provider loading. Later query changes therefore moved `aria-current` without moving focus.

## TDD evidence

### RED

- Focused component run: 3 expected failures, 16 passes.
  - Member and Lead prop transitions did not open the requested dialogs.
  - Campaign prop transition updated the selected row but left focus on the transition control.
- Focused Chromium run: all 3 new journeys failed.
  - Same-route Member and Lead searches changed the URL but did not open their dialogs.
  - Same-route Campaign search changed `aria-current` but did not focus the selected row.
- An initial direct `rerender` test replaced the provider wrapper and produced an invalid provider error. It was corrected to a stateful harness before production changes, leaving the final RED evidence isolated to the query synchronization defects.

### GREEN

- Member and Lead screens use React's guarded prop-change state adjustment so query ids become the active detail without remounting or clearing screen state.
- Closing a query-opened detail clears local selection immediately and calls App Router `replace` for `/members` or `/leads` with scrolling disabled.
- Repeating the same global search after close transitions the query prop again and reopens the selected detail.
- Campaign focus now depends on both loading and `initialSelectedCampaignId`, so each same-route selection focuses its newly highlighted row.
- Browser tests prove Member verification and Lead segment/intent filters survive navigation, detail close restores the pre-search filter focus, and the native global-search modal remains on its existing interaction path.

## Verification

- Final focused unit stability gate, twice: 4 files, 22 tests passed on each run.
- Final focused browser stability gate, twice: 3 tests passed on each run.
- `npm test`: 29 files, 193 tests passed.
- `npm run test:e2e`: 44 tests passed, including native search-modal focus containment/restoration and the three new same-route journeys.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Files changed

- Query synchronization and client-router cleanup: `src/features/members/members-screen.tsx`, `src/features/leads/leads-screen.tsx`
- Campaign query focus synchronization: `src/features/campaigns/campaigns-screen.tsx`
- Component regression coverage: Member, Lead, Lead Detail, and Campaign test files
- Browser coverage: `e2e/accessibility.spec.ts`

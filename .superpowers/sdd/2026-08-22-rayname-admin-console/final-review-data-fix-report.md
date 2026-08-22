# Final Review Reporting Data and Campaign Persistence Fix Report

## Scope

- Base commit: `a91be54 fix: complete global search workflows`.
- Made the command-bar reporting range an operable, keyboard-accessible shell control shared by Overview and Analytics.
- Reconciled Overview period KPIs with canonical dated trend and campaign-event facts.
- Made campaign creation and tracked-link creation one atomic provider operation with durable in-session association and audit history.
- Preserved the approved page geometry and left the authentication actor boundary unchanged.

## Confirmed root causes and reviewer disposition

1. **Global date range — confirmed.** The command-bar date control was a static button, Overview used a private hardcoded range, and Analytics owned separate local range state. The visible global control therefore could not change either route consistently.
2. **Overview KPI contradiction — confirmed.** The approved Aug 16–22 trend contains `9 + 11 + 15 + 17 + 12 + 20 + 84 = 168` registrations, while the KPI seed claimed 84. Campaign attribution and funnel data also reconcile to 168, so preserving 84 would violate the dated-fact invariant. The design-spec assertion was corrected to 168.
3. **Campaign tracked URL persistence — confirmed.** The form created a campaign through the provider but assembled the tracked URL only in component state. No tracked-link record, campaign association, or link audit event was persisted, so the URL disappeared on remount.
4. **Authentication actor boundary — deferred by scope.** The existing `local-ray` actor remains unchanged and is not represented as fixed by this work.

No data-integrity finding warranted pushback. The only assertion rejected was retaining the mock's registration value of 84 after canonical dated facts established 168.

## Architecture and data semantics

- `ReportingRangeProvider` is mounted once beside the admin data provider. The command bar, Overview, and Analytics consume the same selected option.
- Provider snapshots echo their requested range. Screens render a snapshot only when its echoed range matches the current selection, preventing an old result from being relabeled during a newer request.
- Registrations, transfers, and attributed revenue are flow metrics derived by summing the selected dated trend facts. Their comparisons use the immediately preceding equal-length period when facts exist.
- Campaign rows are derived from canonical dated campaign events inside both the selected reporting range and each campaign's active dates.
- Discord Members is an as-of stock: the latest available member snapshot on or before the selected end date. Verified Customers and Renewal Rate remain explicitly labeled latest-available snapshots because no deterministic daily series exists for them. No period-specific stock/rate precision was invented.
- Current priorities and high-intent leads remain operational current-state queues, not historical period facts.
- Existing Analytics funnel and distribution projections retain their deterministic baseline-ratio behavior; this change does not present them as newly observed daily facts.
- Campaign and tracked-link creation now validates/builds the URL before any mutation, then persists the linked records and both audit events as one provider command. Persistence is intentionally scoped to the lifetime of the local in-memory provider; a remount retains it, while a full application reload reconstructs the local seed.

## TDD evidence

### RED

- Initial focused run: 12 expected failures and 30 passes.
- Failures covered the 168-registration invariant, recent-range provider totals and campaign aggregates, shared command-bar selection across Overview and Analytics, stale-range suppression, atomic campaign/link persistence and audits, invalid-link rollback, and tracked-URL recovery after Campaigns remount.
- The first full browser run exposed one additional real regression: longer truthful KPI comparison text overflowed at 1440px. The existing responsive test failed before the annotation-only wrapping fix.

### GREEN

- Aug 16–22 Overview reports 168 registrations, 39 transfers, and $18,420 attributed revenue; each equals its selected trend sum.
- Aug 18–22 reports 148 registrations, 32 transfers, $14,460 attributed revenue, and `.com Transfer Week` aggregates of 2,504 visitors, 60 conversions, and $7,395 revenue.
- Command-bar selection works by keyboard, updates its displayed accessible label, and drives both Overview and Analytics through the same shell state.
- Old Overview and Analytics snapshots are hidden while a newly selected range is pending.
- A created campaign stores `trackedLinkId`, its tracked-link record, and both audit events; invalid tracking input produces no partial state; Campaigns renders the stored URL after unmount/remount.
- KPI comparison annotations wrap without changing the six-column desktop layout.

## Verification

- Focused stability gate, twice: 5 files and 44 tests passed on each independent run.
- `npm test`: 24 files and 133 tests passed.
- `npm run test:e2e`: 41 tests passed, including all approved routes/themes, the operator journey, and 1440/1180/1024 responsive checks.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; all 14 application pages generated successfully.
- `git diff --check`: run as the final whitespace gate before commit.

## Principal files changed

- Shared range state and shell control: `src/lib/reporting-range.tsx`, admin data provider wrapper, command bar, and shell styles.
- Provider invariants and atomic command: admin-data types, provider contract, local provider, seed, and provider tests.
- Range-aware consumers: Overview, Analytics, charts, KPI strip, funnel/campaign labels, and screen tests.
- Campaign persistence: campaign form, Campaigns screen, styles, and form/remount tests.
- Acceptance evidence: operator journey assertion and the approved design spec.

# Final Review Analytics Data Honesty Fix Report

## Scope

- Base commit: `5061ed9 fix: gate admin mutations with trusted actor`.
- Verified and corrected the review finding that ratio-derived Analytics panels were presented as selected-period facts.
- Kept exact dated trend facts and campaign-attribution events unchanged.
- Preserved the approved Aug 16–22 funnel values and comparison while making non-baseline funnel semantics honest.
- Did not modify authentication mutation schemas or global-search routes.

## Confirmed root cause

`analyticsForRange` correctly filters canonical dated trend rows and campaign events, but it has no dated facts for five other panel families. It therefore projects the seeded Aug 16–22 baseline as follows:

- funnel, conversion by segment, lead velocity, and offer performance use the selected-range registration-activity ratio;
- revenue by source uses the selected-range revenue ratio;
- retention remains the unchanged latest available provider snapshot.

The snapshot contract did not expose those distinctions. The UI called the page provider-backed reporting, placed selected-range labels beside the inferred panels, and described retention as a rate for the reporting period. Overview also displayed the seeded Aug 9–15 funnel deltas after operators selected a different range.

## Implemented semantics contract

| Panel | Provider basis | Visible disclosure |
| --- | --- | --- |
| Conversion trend | `exact-dated-facts` | Exact dated facts; observed daily facts inside the selected range |
| Campaign attribution | `exact-dated-facts` | Exact dated facts; summed dated campaign events inside the range and campaign dates |
| Conversion funnel | `modeled-estimate` | Modeled estimate; registration-activity-ratio method and comparison availability |
| Revenue by source | `modeled-estimate` | Modeled estimate; selected-range revenue-ratio method |
| Conversion by segment | `modeled-estimate` | Modeled estimate; selected-range registration-activity-ratio method |
| Lead velocity | `modeled-estimate` | Modeled estimate; selected-range registration-activity-ratio method |
| Offer performance | `modeled-estimate` | Modeled estimate; selected-range registration-activity-ratio method |
| Customer retention | `latest-snapshot` | Latest available snapshot; explicitly not a selected-period fact |

The metadata is provider-owned and returned with each `AnalyticsSnapshot`. Overview receives the same funnel metadata. `DataSemantics` is a discriminated union, and `AnalyticsSemantics` assigns exact, modeled, or snapshot subtypes to specific panels, preventing a panel basis from being paired with a contradictory standard label.

## Funnel comparison behavior

- Aug 16–22 remains the approved baseline: values stay `8,742`, `326`, and `168`; seeded deltas remain `-5.1`, `6.6`, and `11.3`; the provider identifies their comparison as `vs Aug 9–15`.
- Other ranges remain modeled from the selected registration-activity ratio, but their provider deltas are now `null`, comparison metadata is `null`, and both Analytics and Overview suppress the unavailable delta presentation.
- Analytics' tabular fallback says `Not available for modeled range` instead of exposing an unlabelled baseline delta.

## TDD evidence

### RED

- Initial semantics run: 5 expected failures and 34 passes.
  - Missing provider classification for every panel family.
  - Missing exact/modeled/snapshot visible disclosures.
  - Retention still claimed reporting-period precision.
  - Analytics and Overview still presented baseline funnel comparisons for the recent range.
- Follow-up provider-invariant run: 1 expected failure and 24 passes.
  - The recent-range provider still returned `[-5.1, 6.6, 11.3]` instead of `[null, null, null]`.

### GREEN

- Provider tests assert every panel's basis, standard label, derivation method, and absence of exact/observed language on modeled panels.
- UI tests verify visible copy for all eight Analytics panel families and Overview's range-aware funnel presentation.
- The toolbar now states that exact dated facts are separated from modeled estimates and latest snapshots.

## Verification

- Focused stability gate, twice: 3 files and 39 tests passed on each independent run.
- Full relevant provider/Analytics/Overview suite: 10 files and 91 tests passed.
- `npm test`: 29 files and 193 tests passed.
- `npm run test:e2e`: 44 tests passed, including Analytics accessibility in both themes and all responsive checks.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; all 14 application pages generated successfully.
- `git diff --check`: run as the final whitespace gate before commit.

## Files changed

- Provider semantics and range-aware comparison data: `src/lib/admin-data/types.ts`, `src/lib/admin-data/local-provider.ts`, and `src/lib/admin-data/local-provider.test.ts`.
- Analytics disclosures and tests: `src/features/analytics/analytics-screen.tsx`, its module CSS, and screen tests.
- Overview funnel disclosure and tests: `src/features/overview/conversion-funnel.tsx`, Overview screen/module CSS, and screen tests.
- Semantics documentation: `docs/superpowers/specs/2026-08-22-rayname-admin-console-design.md`.

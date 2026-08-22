# Final Review Auth Fix Round 2 Report

## Scope and finding disposition

- Settled base: `75a2abe fix: synchronize search query selections`.
- The review finding was correct: generic member patches could directly set `verified`, add the reserved `Verified` role, or assign `Verified customer` without using the atomic verification operation.
- Content mutation commands accepted zero or multiple CTAs even though `validateContentEntry` requires exactly one nonblank CTA.
- This fix does not change analytics semantics or query-route synchronization.

## Enforced invariants

### Verification transition

- `MemberPatch` no longer exposes `verified`, so the browser-facing and generic provider contracts cannot express a direct verification-flag mutation.
- The strict `update-member` command schema rejects the removed `verified` property and rejects the reserved `Verified` role and `Verified customer` status, including case variants after input trimming.
- The actor-aware local store repeats those checks before resolving or mutating a member. Failed attempts leave both member state and activity history unchanged.
- `verifyMember` remains the only operation that atomically sets the flag, customer status, and role.
- Role assignment now sends only the role being added. The local store merges it with existing roles, so an already-verified member retains `Verified` while receiving legitimate new roles without resubmitting the reserved role through the generic patch.

### Content CTA cardinality

- The strict content command schema accepts `ctas` only as an array of exactly one trimmed, nonblank string.
- The actor-aware local store independently rejects missing-cardinality, multi-CTA, blank, and non-array runtime values whenever the `ctas` property is present.
- This matches `validateContentEntry`; rejected patches do not mutate the content entry or create activity.

## TDD evidence

### RED

- Focused run after correcting the parameterized-array test harness: 11 expected failures and 61 passes.
- The failures proved all three member bypasses at the strict command and low-level store boundaries, zero/two CTA acceptance at the strict schema, and zero/two/blank CTA acceptance in the store.
- Valid one-CTA and normal member-patch controls were already green, isolating the failures to the missing invariants.

### GREEN

- Strict-schema tests cover spoofed `verified`, reserved role/status values, invalid CTA counts, blank CTA text, and valid member/content patches.
- Store tests prove rejected commands leave state and audit activity untouched, and prove an existing verified member can receive a normal role while retaining the verified role/status.
- The provider contract type test fixes the exact allowed `MemberPatch` keys and excludes `verified`.
- Member workflow tests prove `Verified` is not assignable from the generic role selector and that normal role assignment still persists.

## Verification

- Focused stability gate, twice: 7 files and 111 tests passed on each independent run.
- `npm test`: 29 files, 209 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; all 14 application pages generated successfully.
- `npm run test:e2e`: 44 tests passed.
- `git diff --check`: passed before report creation and is rerun as the final whitespace gate before commit.

## Files changed

- Generic contract: `src/lib/admin-data/types.ts`, `src/lib/admin-data/provider-contract.test.ts`.
- Strict server command boundary: `src/lib/admin-data/mutation-command.ts`, `src/lib/admin-data/mutation-command.test.ts`.
- Actor-aware store defenses: `src/lib/admin-data/local-provider.ts`, `src/lib/admin-data/local-provider.test.ts`.
- Verified-member-compatible role payload: `src/features/members/member-detail.tsx`.

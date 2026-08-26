# RayFox Trustworthy Beta and Card Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this user, use `superpowers:executing-plans` inline and do not dispatch subagents.

**Goal:** Prevent community members from seeing fixture commerce claims, retain fixture commerce for explicit internal testers, and add quota-free navigation from extension comparison back to the stored domain overview.

**Architecture:** Domain Intelligence computes an explicit presentation policy (`public-intelligence`, `fixture-commerce`, or `live-commerce`) from server-side configuration and the Discord caller. The service enforces comparison access and restores owned stored results; Discord renderers only format the resulting view. Component failures use a private follow-up without overwriting the current card.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 6, Discord Interactions/Webhooks API v10, Vitest 4, Drizzle SQL, Neon Postgres, Vercel Preview

**Spec:** `docs/superpowers/specs/2026-08-26-rayfox-trustworthy-beta-and-navigation-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before editing the Discord Route Handler.
- Do not dispatch subagents; execute this plan inline with review checkpoints.
- Fixture pricing, fixture availability, and fixture premium status must never be rendered for a non-tester.
- `No registry record found` must never be rewritten as `Available`.
- Fixture mode remains valid only for an internal Vercel Preview deployment.
- Provider failure never falls back to a guessed or fixture commercial answer in live mode.
- Only a new `/domain` command reserves daily usage; comparison, sorting, pagination, and overview restoration are reads.
- Preserve the existing member limit of 1 and Verified Customer limit of 3.
- Keep every Discord response ephemeral and every component bound to its original member.
- Do not change verification, VIP access, or production enablement.

---

## File Map

- `src/lib/domain-intelligence/config.ts`: validate and privately expose tester user/role allow-lists.
- `src/lib/domain-intelligence/runtime.ts`: pass presentation-policy configuration into the service.
- `src/lib/domain-intelligence/service.ts`: decide presentation, enforce comparison access, and restore owned results.
- `src/lib/domain-intelligence/repository.ts`: return accurate usage with an owned stored result without reserving quota.
- `src/lib/domain-intelligence/outbound-links.ts`: use a neutral `continue_on_site` action for public-intelligence cards.
- `src/lib/discord/domain-message.ts`: render public intelligence separately from commerce and add the overview control.
- `src/lib/discord/interactions.ts`: parse overview controls, pass caller context, and route safe failures.
- `src/lib/discord/interaction-client.ts`: send private follow-up errors after a deferred component acknowledgement.
- `src/app/api/discord/interactions/route.ts`: compose the expanded service and interaction client only; no policy logic.
- `.env.example` and `docs/operations.md`: document the tester role allow-list and the Preview-only test procedure.
- Matching `*.test.ts` files: lock every access, copy, navigation, quota, and failure rule before implementation.

---

### Task 1: Add Explicit Fixture Tester Configuration

**Files:**
- Modify: `src/lib/domain-intelligence/config.ts`
- Modify: `src/lib/domain-intelligence/config.test.ts`
- Modify: `src/lib/domain-intelligence/runtime.ts`
- Modify: `src/lib/domain-intelligence/runtime.test.ts`

**Interfaces:**
- Consumes: `RAYFOX_DOMAIN_TESTER_ROLE_IDS` and existing `ADMIN_DISCORD_USER_IDS` comma-separated Discord IDs.
- Produces: private `testerRoleIds: string[]` and `testerUserIds: string[]` on configured domain settings; service config fields with the same names.

- [ ] **Step 1: Write failing configuration tests**

Add tests that prove valid IDs are accepted, malformed IDs fail closed, secrets/user IDs are not serialized, and fixture mode may have no testers without exposing fixtures:

```ts
test("parses fixture tester roles and existing admin users without serializing users", () => {
  const result = getDomainIntelligenceConfig({
    ...validEnv,
    RAYFOX_DOMAIN_TESTER_ROLE_IDS: "1541478390924837005,1541478390924837006",
    ADMIN_DISCORD_USER_IDS: "223456789012345678",
  });

  expect(result).toMatchObject({ configured: true });
  if (!result.configured) throw new Error("Expected configured domain runtime");
  expect(result.testerRoleIds).toEqual([
    "1541478390924837005",
    "1541478390924837006",
  ]);
  expect(result.testerUserIds).toEqual(["223456789012345678"]);
  expect(JSON.stringify(result)).not.toContain("223456789012345678");
});

test.each([
  { RAYFOX_DOMAIN_TESTER_ROLE_IDS: "not-a-role" },
  { ADMIN_DISCORD_USER_IDS: "223456789012345678,broken" },
])("fails closed for malformed tester identity configuration %#", (override) => {
  expect(getDomainIntelligenceConfig({ ...validEnv, ...override }))
    .toMatchObject({ configured: false, mode: "disabled" });
});
```

Update the runtime test to expect the service to expose `overview` and the safe runtime config to expose counts, not user IDs:

```ts
expect(runtime).toMatchObject({
  ready: true,
  config: {
    testerRoleCount: 1,
    testerUserCount: 1,
  },
});
if (runtime.ready) expect(typeof runtime.service.overview).toBe("function");
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/lib/domain-intelligence/config.test.ts src/lib/domain-intelligence/runtime.test.ts
```

Expected: FAIL because tester allow-list fields and `overview` do not exist.

- [ ] **Step 3: Implement strict ID parsing and private fields**

Replace the beta-specific parser with a reusable parser and use it for all three lists:

```ts
function parseDiscordIds(raw: string | undefined): string[] | null {
  const values = [...new Set(
    (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  )];
  return values.every((value) => discordIdPattern.test(value)) ? values : null;
}
```

Add non-enumerable configured values:

```ts
readonly testerRoleIds: string[];
readonly testerUserIds: string[];
```

Parse `RAYFOX_DOMAIN_TESTER_ROLE_IDS` and `ADMIN_DISCORD_USER_IDS`; `null` is invalid, while an empty list is valid. Add only counts to `safe`:

```ts
safe: {
  // existing fields
  testerRoleCount: testerRoleIds.length,
  testerUserCount: testerUserIds.length,
}
```

Pass both lists into `createDomainIntelligenceService`. Do not read environment variables inside the service.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/lib/domain-intelligence/config.test.ts src/lib/domain-intelligence/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the configuration boundary**

```bash
git add src/lib/domain-intelligence/config.ts src/lib/domain-intelligence/config.test.ts src/lib/domain-intelligence/runtime.ts src/lib/domain-intelligence/runtime.test.ts
git commit -m "feat: configure RayFox fixture testers"
```

---

### Task 2: Restore Owned Results With Accurate Usage

**Files:**
- Modify: `src/lib/domain-intelligence/repository.ts`
- Modify: `src/lib/domain-intelligence/repository.test.ts`
- Modify: `src/lib/domain-intelligence/neon-repository.integration.test.ts`

**Interfaces:**
- Consumes: existing `getOwnedQuery({ requestId, discordUserId })`.
- Produces: `StoredOwnedDomainQuery` with `used: number`; performs no insert or update.

- [ ] **Step 1: Write failing repository tests**

Add a test whose database spy returns an owned result with `used: 2`:

```ts
test("reads an owned result and current usage without mutating allowance", async () => {
  database.execute.mockResolvedValueOnce({ rows: [{
    id: requestId,
    discordUserId,
    normalizedDomain: "example.com",
    tier: "verified",
    status: "succeeded",
    resultSnapshot: storedResult,
    completedAt: now,
    used: 2,
  }] });

  await expect(repository.getOwnedQuery({ requestId, discordUserId }))
    .resolves.toMatchObject({ id: requestId, used: 2 });
  expect(String(database.execute.mock.calls[0][0])).not.toMatch(/insert|update/i);
});
```

Extend the Neon integration test to create two successful requests for the same day, call `getOwnedQuery`, and assert `used === 2` while the row count in `domain_query_daily_usage` remains unchanged.

- [ ] **Step 2: Run the repository tests and verify RED**

Run:

```bash
npm test -- src/lib/domain-intelligence/repository.test.ts
```

Expected: FAIL because owned results do not expose usage.

- [ ] **Step 3: Add the owned-query read model and correlated count**

Add:

```ts
export type StoredOwnedDomainQuery = StoredDomainQuery & { used: number };
```

Change only `getOwnedQuery` to return this type and select an accurate successful-query count for the stored request's guild, user, and usage day:

```sql
SELECT
  owned.id,
  owned.discord_user_id AS "discordUserId",
  owned.normalized_domain AS "normalizedDomain",
  owned.tier,
  owned.status,
  owned.result_snapshot AS "resultSnapshot",
  owned.completed_at AS "completedAt",
  (
    SELECT count(*)::integer
    FROM domain_query_requests successful
    WHERE successful.guild_id = owned.guild_id
      AND successful.discord_user_id = owned.discord_user_id
      AND successful.usage_day = owned.usage_day
      AND successful.status = 'succeeded'
  ) AS used
FROM domain_query_requests owned
WHERE owned.id = ${input.requestId}
  AND owned.discord_user_id = ${input.discordUserId}
```

Clamp the mapped value to `1` for members and `3` for verified users. Do not alter `getQueryForOutbound`.

- [ ] **Step 4: Run repository tests and the gated integration test**

Run:

```bash
npm test -- src/lib/domain-intelligence/repository.test.ts
```

If `TEST_DATABASE_URL` is configured, also run:

```bash
npm test -- src/lib/domain-intelligence/neon-repository.integration.test.ts
```

Expected: unit tests PASS; integration test PASS or remains explicitly skipped when the test database is absent.

- [ ] **Step 5: Commit the read-only overview data path**

```bash
git add src/lib/domain-intelligence/repository.ts src/lib/domain-intelligence/repository.test.ts src/lib/domain-intelligence/neon-repository.integration.test.ts
git commit -m "feat: read owned RayFox result usage"
```

---

### Task 3: Enforce Presentation Policy in the Domain Service

**Files:**
- Modify: `src/lib/domain-intelligence/service.ts`
- Modify: `src/lib/domain-intelligence/service.test.ts`

**Interfaces:**
- Consumes: service config `testerRoleIds`, `testerUserIds`; caller `discordUserId`, `roleIds`.
- Produces: `DomainPresentation`, presentation on successful outcomes, role-aware `compare`, and `overview`.

- [ ] **Step 1: Write failing service tests for all three presentations**

Define the expected public types in the test imports and add:

```ts
test("hides fixture commerce from a community member", async () => {
  const setup = service({
    testData: true,
    betaRoleIds: [guildId],
    testerRoleIds: [testerRoleId],
  });

  await expect(setup.service.search(searchInput([]))).resolves.toMatchObject({
    status: "success",
    presentation: "public-intelligence",
  });
});

test("shows fixtures only to an explicit tester", async () => {
  const setup = service({ testData: true, testerRoleIds: [testerRoleId] });
  await expect(setup.service.search(searchInput([betaRoleId, testerRoleId])))
    .resolves.toMatchObject({
      status: "success",
      presentation: "fixture-commerce",
    });
});

test("marks configured RayName results as live commerce", async () => {
  await expect(service({}).service.search(searchInput()))
    .resolves.toMatchObject({
      status: "success",
      presentation: "live-commerce",
    });
});
```

Add comparison denial and overview restoration tests:

```ts
await expect(setup.service.compare({
  requestId,
  discordUserId,
  roleIds: [],
  sort: "registration",
  page: 1,
})).resolves.toEqual({
  status: "forbidden",
  safeMessage: "Test pricing is available only to RayFox internal testers",
});
expect(setup.external.commerce.listTldPrices).not.toHaveBeenCalled();

await expect(setup.service.overview({
  requestId,
  discordUserId,
  roleIds: [],
})).resolves.toMatchObject({
  status: "success",
  requestId,
  used: 1,
  limit: 1,
  restored: true,
  presentation: "public-intelligence",
});
expect(setup.data.begin).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the service tests and verify RED**

Run:

```bash
npm test -- src/lib/domain-intelligence/service.test.ts
```

Expected: FAIL because the policy, role-aware comparison, and overview operation do not exist.

- [ ] **Step 3: Add exact presentation and overview types**

Add:

```ts
export type DomainPresentation =
  | "public-intelligence"
  | "fixture-commerce"
  | "live-commerce";
```

Successful search outcomes gain:

```ts
presentation: DomainPresentation;
restored?: true;
```

Comparison input gains `roleIds: string[]`. Successful comparisons gain:

```ts
presentation: "fixture-commerce" | "live-commerce";
```

Comparison also gains:

```ts
| { status: "forbidden"; safeMessage: string }
```

Add:

```ts
export type DomainOverviewOutcome =
  | Extract<DomainSearchOutcome, { status: "success" }>
  | { status: "not-owned" | "unavailable" | "not-enabled"; safeMessage: string };

overview(input: {
  requestId: string;
  discordUserId: string;
  roleIds: string[];
}): Promise<DomainOverviewOutcome>;
```

- [ ] **Step 4: Implement one server-side presentation helper**

```ts
function presentationFor(
  config: Extract<DomainIntelligenceServiceConfig, { enabled: true }>,
  viewer: { discordUserId: string; roleIds: string[] },
): DomainPresentation {
  if (!config.testData) return "live-commerce";
  const tester = config.testerUserIds.includes(viewer.discordUserId) ||
    viewer.roleIds.some((roleId) => config.testerRoleIds.includes(roleId));
  return tester ? "fixture-commerce" : "public-intelligence";
}
```

Use it for fresh and replayed search results. In fixture mode, reject comparison before calling `getOwnedQuery` or `listTldPrices` when the result is `public-intelligence`. In live mode, allow owned comparison.

Implement `overview` as a read of `getOwnedQuery`; require `succeeded` plus a stored result, derive limit from stored tier, clamp `used`, set `replayed: false`, `restored: true`, and compute presentation from the current caller.

- [ ] **Step 5: Run service tests and verify GREEN**

Run:

```bash
npm test -- src/lib/domain-intelligence/service.test.ts
```

Expected: PASS, including proof that comparison and overview never call `begin`.

- [ ] **Step 6: Commit the service policy**

```bash
git add src/lib/domain-intelligence/service.ts src/lib/domain-intelligence/service.test.ts
git commit -m "feat: enforce RayFox commerce presentation policy"
```

---

### Task 4: Render Honest Public Intelligence and Reversible Cards

**Files:**
- Modify: `src/lib/discord/domain-message.ts`
- Modify: `src/lib/discord/domain-message.test.ts`
- Modify: `src/lib/domain-intelligence/outbound-links.ts`
- Modify: `src/lib/domain-intelligence/outbound-links.test.ts`

**Interfaces:**
- Consumes: `DomainPresentation` on successful overview/search/comparison outcomes.
- Produces: public-intelligence card, presentation-aware links, and `rayfox_domain:overview:<requestId>:<ownerId>`.

- [ ] **Step 1: Write failing public-card tests**

Create a success fixture with `presentation: "public-intelligence"`, real RDAP, DNS, and certificate facts, then assert:

```ts
const serialized = JSON.stringify(renderDomainOutcome(outcome, links));
expect(serialized).toContain("Live public-domain intelligence");
expect(serialized).toContain("Registry record found");
expect(serialized).toContain("Registry · RDAP");
expect(serialized).toContain("DNS · Live lookup");
expect(serialized).toContain("Certificate · Live TLS lookup");
expect(serialized).toContain("Check live price on RayName");
expect(serialized).not.toContain("USD 79.00");
expect(serialized).not.toContain("RayName pricing · checked");
expect(serialized).not.toContain("Premium domain");
expect(serialized).not.toContain("Compare extensions");
```

Add separate cases for `registration.state === "not-found"` and `registration === null`:

```ts
expect(description).toContain("No registry record found");
expect(description).not.toContain("Available");

expect(unavailableDescription).toContain("Registry status unavailable");
```

Update existing fixture/live tests to set `presentation` explicitly.

- [ ] **Step 2: Write failing comparison-back and link tests**

Assert every comparison card contains:

```ts
expect(customIds).toContain(
  `rayfox_domain:overview:${requestId}:${ownerId}`,
);
expect(customIds.every((id) => id.includes(`:${ownerId}`))).toBe(true);
```

Assert public intelligence uses a neutral signed outbound action:

```ts
expect(payload(links.primary!)).toMatchObject({
  action: "continue_on_site",
  requestId,
});
expect(links.fullIntelligence).toBeNull();
```

- [ ] **Step 3: Run message and link tests and verify RED**

Run:

```bash
npm test -- src/lib/discord/domain-message.test.ts src/lib/domain-intelligence/outbound-links.test.ts
```

Expected: FAIL because rendering is not presentation-aware and no overview button exists.

- [ ] **Step 4: Split public intelligence from commerce rendering**

Add pure helpers:

```ts
function publicRegistryCopy(result: DomainIntelligenceResult): string {
  if (result.registration?.state === "found") return "**Registry record found**";
  if (result.registration?.state === "not-found") {
    return "**No registry record found**\nThis is not a purchase guarantee.";
  }
  return "**Registry status unavailable**";
}

function showsCommerce(presentation: DomainPresentation) {
  return presentation !== "public-intelligence";
}
```

For public intelligence:

- do not call the commercial price/status field builder;
- label the registry section from `registration.source.kind` and include its checked time;
- show live DNS and certificate checked times;
- retain independently successful sections when another provider is absent;
- show one neutral `Check live price on RayName` link;
- omit `Compare extensions`.

For fixture and live commerce, retain current behaviour and warnings. Update footer suffix logic so a restored view does not claim `Fresh replay`.

- [ ] **Step 5: Add overview control and presentation-aware outbound action**

Append this button to every successful comparison row:

```ts
customButton(
  "← Domain overview",
  `rayfox_domain:overview:${outcome.requestId}:${ownerId}`,
  2,
)
```

In `createDomainOutcomeLinks`, when presentation is `public-intelligence`, generate only `continue_on_site`; do not inspect fixture availability to choose register versus transfer.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/lib/discord/domain-message.test.ts src/lib/domain-intelligence/outbound-links.test.ts
```

Expected: PASS and all messages remain within Discord limits.

- [ ] **Step 7: Commit the trustworthy card experience**

```bash
git add src/lib/discord/domain-message.ts src/lib/discord/domain-message.test.ts src/lib/domain-intelligence/outbound-links.ts src/lib/domain-intelligence/outbound-links.test.ts
git commit -m "feat: render trustworthy RayFox beta cards"
```

---

### Task 5: Route Overview Controls and Private Component Failures

**Files:**
- Modify: `src/lib/discord/interaction-client.ts`
- Modify: `src/lib/discord/interaction-client.test.ts`
- Modify: `src/lib/discord/interactions.ts`
- Modify: `src/lib/discord/interactions.test.ts`
- Modify: `src/app/api/discord/interactions/route.ts`

**Interfaces:**
- Consumes: service `search`, `compare`, `overview`; caller roles; component owner.
- Produces: `sendPrivateFollowup`, parsed overview control, restored original card, and safe failure follow-up.

- [ ] **Step 1: Write a failing private-follow-up client test**

```ts
await expect(client.sendPrivateFollowup({
  applicationId,
  interactionToken,
  content: "Test pricing is available only to RayFox internal testers.",
})).resolves.toEqual({ status: "sent" });

expect(fetchImpl).toHaveBeenCalledWith(
  `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`,
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({
      content: "Test pricing is available only to RayFox internal testers.",
      flags: 64,
    }),
  }),
);
```

Reuse the existing safe failure mapping; never include the interaction token or Discord response body in returned errors.

- [ ] **Step 2: Write failing interaction tests**

Extend the service mock with `overview`. Change comparison expectations to include `roleIds`.

Add:

```ts
test("restores the owner's stored overview without another search", async () => {
  const dispatch = await handleDiscordInteraction({
    id: componentInteractionId,
    token: "component-token",
    type: 3,
    guild_id: guildId,
    member: { user, roles: [testerRoleId] },
    data: { custom_id: `rayfox_domain:overview:${requestId}:${user.id}` },
  }, dependencies);

  expect(dispatch.response).toEqual({ type: 6 });
  await dispatch.background?.();
  expect(dependencies.domainService.overview).toHaveBeenCalledWith({
    requestId,
    discordUserId: user.id,
    roleIds: [testerRoleId],
  });
  expect(dependencies.domainService.search).not.toHaveBeenCalled();
  expect(dependencies.interactionClient.editOriginal).toHaveBeenCalled();
});
```

Add a forbidden comparison result and an expired overview result. Both must call `sendPrivateFollowup`; neither may call `editOriginal`, so the current card remains visible.

- [ ] **Step 3: Run client and interaction tests and verify RED**

Run:

```bash
npm test -- src/lib/discord/interaction-client.test.ts src/lib/discord/interactions.test.ts
```

Expected: FAIL because follow-up and overview routing do not exist.

- [ ] **Step 4: Implement safe private follow-ups**

Extend the interface:

```ts
export type DiscordInteractionFailure = Extract<
  DiscordInteractionEditResult,
  { status: "failed" }
>;

sendPrivateFollowup(input: {
  applicationId: string;
  interactionToken: string;
  content: string;
}): Promise<{ status: "sent" } | DiscordInteractionFailure>;
```

POST to `/webhooks/{applicationId}/{interactionToken}` with JSON `{ content, flags: 64 }`, `cache: "no-store"`, JSON content type, and the existing ten-second timeout.

- [ ] **Step 5: Parse and route the overview component**

Extend `DomainComponent` and `domainComponent`:

```ts
| { kind: "overview"; requestId: string; ownerId: string }
```

Accepted ID shape:

```text
rayfox_domain:overview:<requestId>:<ownerId>
```

Keep the existing owner check before any service call. Pass `user.roleIds` into comparison. For comparison or overview failure, acknowledge with deferred update, send a private follow-up in background, and leave the current card untouched.

For successful overview:

1. call `buildLinks` on the restored success;
2. call `renderDomainOutcome` with the original owner ID;
3. edit the original ephemeral card.

- [ ] **Step 6: Update Route Handler composition**

Read the required Next.js Route Handler guide. Keep `after(task)` and signature verification unchanged. Only update dependency types/composition needed by the expanded client and `overview`; do not put presentation policy in the route.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/lib/discord/interaction-client.test.ts src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit interaction navigation**

```bash
git add src/lib/discord/interaction-client.ts src/lib/discord/interaction-client.test.ts src/lib/discord/interactions.ts src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.ts
git commit -m "feat: restore RayFox domain overview"
```

---

### Task 6: Document, Verify, Deploy, and Test Both Audiences

**Files:**
- Modify: `.env.example`
- Modify: `docs/operations.md`
- Modify if required by assertions: `scripts/run-domain-intelligence-e2e.mjs`

**Interfaces:**
- Consumes: fixed Vercel Preview branch alias, Discord guild/channel, tester role ID.
- Produces: documented configuration, clean verification evidence, and real Discord member/tester results.

- [ ] **Step 1: Document the tester role and exact trust boundary**

Add to `.env.example`:

```dotenv
# Preview-only roles allowed to see fixture RayName prices and comparison
RAYFOX_DOMAIN_TESTER_ROLE_IDS=
```

Add an operations section stating:

- normal members see only RDAP/WHOIS, DNS, TLS, and the RayName link in fixture mode;
- tester roles see clearly labelled fixture commerce;
- `ADMIN_DISCORD_USER_IDS` are also testers;
- no-record registry output is not proof of availability;
- test mode is forbidden in Production;
- `Compare extensions`, sorting, pagination, and `Domain overview` do not consume quota.

- [ ] **Step 2: Run the complete automated verification sequentially**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run typecheck
git diff --check
```

Expected:

- all non-gated tests PASS;
- lint PASS;
- typecheck PASS before and after build;
- Next.js build PASS;
- no whitespace errors.

Do not run typecheck concurrently with `next build`, because `.next/types` is generated during the build.

- [ ] **Step 3: Review the branch diff for fixture leakage**

Run:

```bash
git diff HEAD~4 -- src/lib/domain-intelligence src/lib/discord src/app/api/discord/interactions .env.example docs/operations.md
rg -n "fixture|TEST DATA|RayName pricing|Available|Premium" src/lib/discord src/lib/domain-intelligence
```

Manually confirm every fixture-rendering path requires `fixture-commerce` and every non-tester comparison request fails before the fixture provider is called.

- [ ] **Step 4: Commit documentation and any final assertion-only changes**

```bash
git add .env.example docs/operations.md scripts/run-domain-intelligence-e2e.mjs
git commit -m "docs: operate trustworthy RayFox beta"
```

If the E2E script did not change, omit it from `git add`.

- [ ] **Step 5: Push the feature branch and wait for Preview Ready**

```bash
git push origin codex/rayfox-domain-intelligence
```

Confirm the fixed branch deployment `discord-git-codex-rayfox-domain-intelligence-juyu.vercel.app` is `Ready` and points at the new commit before opening a new Discord card.

- [ ] **Step 6: Configure and test a normal member**

Set `RAYFOX_DOMAIN_TESTER_ROLE_IDS` to a staff-only tester role in the Vercel Preview environment. With an account that has neither a tester role nor an admin user ID:

1. run `/domain example.com` in `🦊・rayfox-commands`;
2. confirm no price, `Available`, Premium claim, or comparison button is present;
3. confirm registry/DNS/TLS sections show only returned live facts and sources;
4. confirm `Check live price on RayName` opens RayName;
5. confirm the displayed remaining allowance changes by exactly one.

- [ ] **Step 7: Configure and test an internal tester**

With an account carrying the configured tester role:

1. run a newly generated `/domain rayfox-navigation-test.com`;
2. confirm the card says `Internal beta · Test data`;
3. click `Compare extensions`;
4. click `Next` and confirm page 2;
5. click `← Domain overview` and confirm the original result returns;
6. reopen comparison and sort by renewal;
7. confirm no navigation action changes the daily usage count.

Old Discord cards are not valid test evidence because their stored component IDs cannot be rewritten.

- [ ] **Step 8: Record final evidence**

Record in the handoff:

- final commit SHA and Vercel deployment status;
- automated test, lint, typecheck, and build totals;
- normal-member card contents and quota result;
- tester navigation sequence and unchanged quota result;
- explicit reminder that live RayName commerce remains disabled until the authenticated API contract is supplied.

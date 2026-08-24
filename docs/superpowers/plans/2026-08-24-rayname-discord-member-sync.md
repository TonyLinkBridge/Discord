# RayName Discord Member Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the real RayName Discord member directory and role state into Neon, run it daily or manually, and expose only provider-backed member facts in the admin console.

**Architecture:** A server-only member-sync service acquires a Neon-backed per-guild lease, fetches all Discord roles and paginated members, validates a complete snapshot, and applies it with one atomic PostgreSQL statement. Vercel Cron and an allowlisted Server Action share this service; server-rendered read models feed Members, Overview, and Community without enabling Marketing API-dependent data.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6.0.3, Neon Postgres, Drizzle ORM/Kit, Discord REST API v10, Zod 4.4.3, Vitest 4.1.11, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-24-rayname-discord-member-sync-design.md`

## Global Constraints

- Use the existing Next.js/Vercel application, Discord bot, Neon project, `DISCORD_GUILD_ID`, `DISCORD_VERIFIED_ROLE_ID`, `DISCORD_BOT_TOKEN`, and `CRON_SECRET`.
- Do not add Railway, a Gateway/WebSocket process, or a second bot service.
- Vercel Hobby runs the automatic member sync once per day; manual sync remains available to an allowlisted admin.
- The Discord application must have the `GUILD_MEMBERS` privileged intent enabled.
- Store no member email, messages, direct messages, presence, browsing activity, or message history.
- Never mark members left from a partial, malformed, or failed Discord fetch.
- Never clear historical `verifiedAt`; current verification is derived from the synchronized Verified Customer role ID.
- Keep registrations, transfers, renewals, revenue, leads, offers, channel activity, onboarding, paid conversion, and VIP-candidate automation unavailable until their real providers exist.
- Use checked-in migrations. Never run `drizzle-kit push` against production.
- Treat every Route Handler and Server Action as independently reachable and re-authorize inside it.
- Route Handlers use native `Request`/`Response`; GET is request-time and uncached because it reads the authorization header and external data.
- Server Actions return only safe discriminated results and call `revalidatePath` for read-your-own-writes.
- Preserve the existing untracked brand assets and all verification behavior.

---

## File Structure

### New files

- `drizzle/0001_discord_member_sync.sql` — schema migration for synchronized member fields, roles, run leases, and indexes.
- `src/lib/member-sync/types.ts` — Discord snapshot, repository, service, read-model, and safe-result contracts.
- `src/lib/member-sync/discord-client.ts` — server-only Discord roles and paginated-members client.
- `src/lib/member-sync/discord-client.test.ts` — pagination, validation, and safe-failure tests.
- `src/lib/member-sync/repository.ts` — Neon lease, atomic snapshot, run history, audit, and read queries.
- `src/lib/member-sync/repository.test.ts` — SQL/repository contract tests.
- `src/lib/member-sync/neon-repository.integration.test.ts` — disposable-branch atomicity and idempotency tests.
- `src/lib/member-sync/service.ts` — lease/fetch/validate/apply orchestration.
- `src/lib/member-sync/service.test.ts` — complete/partial/concurrent/failure service tests.
- `src/lib/member-sync/runtime.ts` — fail-closed production composition.
- `src/lib/member-sync/runtime.test.ts` — environment and runtime composition tests.
- `src/app/api/internal/discord-member-sync/route.ts` — protected Vercel Cron route.
- `src/app/api/internal/discord-member-sync/route.test.ts` — authorization and safe-response tests.
- `src/app/(admin)/member-sync-actions.ts` — allowlisted manual Server Action.
- `src/app/(admin)/member-sync-actions.test.ts` — actor binding and safe-result tests.
- `src/features/members/member-sync-status.tsx` — status summary and Sync now control.
- `src/features/members/member-sync-status.test.tsx` — loading, success, concurrent, and failure UI tests.
- `src/lib/member-sync/read-model.ts` — maps synchronized rows to truthful Members, Overview, and Community view models.
- `src/lib/member-sync/read-model.test.ts` — verified counts, role distribution, and no-fake-field tests.
- `e2e/member-sync.spec.ts` — authorized manual-sync and snapshot-change browser journey.

### Modified files

- `src/lib/database/schema.ts` and `src/lib/database/schema.test.ts` — typed tables/enums and migration assertions.
- `drizzle/meta/_journal.json` and generated snapshot metadata — migration history.
- `src/lib/admin-data/availability.ts` and tests — independent member-sync integration/read-members state.
- `src/lib/discord/rest-client.ts` and tests — share safe Discord status classification without changing verification behavior.
- `src/app/(admin)/members/page.tsx` — server-read directory, queue, and sync status.
- `src/features/members/members-screen.tsx`, tests, and CSS — truthful synchronized directory.
- `src/app/(admin)/page.tsx`, `src/features/overview/overview-screen.tsx`, `metric-strip.tsx`, unavailable state, tests, and CSS — two live Discord metrics with remaining panels unavailable.
- `src/app/(admin)/community/page.tsx`, `community-screen.tsx`, tests, and CSS — live member/role facts plus explicit unavailable activity/conversion panels.
- `src/app/(admin)/layout.tsx` and runtime availability tests — member-sync integration status.
- `scripts/discord-api-stub.mjs` and tests — deterministic roles/members snapshots and failures.
- `e2e/fixtures.ts` and Playwright configuration only where needed for the loopback stub.
- `vercel.json` — daily member-sync cron alongside retention.
- `.env.example` and `docs/operations.md` — intent, sync, migration, monitoring, and recovery runbook.

---

### Task 1: Member Sync Schema and Contracts

**Files:**
- Create: `drizzle/0001_discord_member_sync.sql`
- Create: `src/lib/member-sync/types.ts`
- Modify: `src/lib/database/schema.ts`
- Modify: `src/lib/database/schema.test.ts`
- Modify: `drizzle/meta/_journal.json`
- Create/Modify: generated `drizzle/meta/0001_snapshot.json`

**Interfaces:**
- Produces: `MemberSyncRepository`, `DiscordGuildSnapshotClient`, `DiscordMemberSnapshot`, `DiscordRoleSnapshot`, `MemberSyncRunResult`, `MemberDirectorySnapshot`, and the new Drizzle tables/enums.
- Consumes: existing `discordMembers`, `adminAuditEvents`, verification foreign keys, and `DISCORD_VERIFIED_ROLE_ID` semantics.

- [ ] **Step 1: Write failing schema and type-contract tests**

Add assertions to `src/lib/database/schema.test.ts`:

```ts
import {
  discordGuildRoles,
  discordMemberSyncRuns,
  discordMembers,
} from "./schema";

test("exports Discord member sync tables", () => {
  expect([discordMembers, discordGuildRoles, discordMemberSyncRuns]).toHaveLength(3);
});

test("member sync migration carries lease and membership guarantees", () => {
  const sql = readFileSync("drizzle/0001_discord_member_sync.sql", "utf8");
  expect(sql).toContain("discord_member_sync_runs_one_running_per_guild");
  expect(sql).toContain("WHERE status = 'running'");
  expect(sql).toContain("membership_status");
  expect(sql).toContain("role_ids");
  expect(sql).not.toContain("message_content");
  expect(sql).not.toContain("member_email");
});
```

Create the contract beginning in `src/lib/member-sync/types.ts` and test it through service/repository consumers in later tasks:

```ts
export type MembershipStatus = "active" | "left";
export type MemberSyncTrigger = "cron" | "manual";
export type MemberSyncStatus = "running" | "succeeded" | "failed";

export type DiscordRoleSnapshot = {
  guildId: string;
  roleId: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  permissions: string;
};

export type DiscordMemberSnapshot = {
  guildId: string;
  discordUserId: string;
  username: string;
  globalName: string | null;
  guildDisplayName: string;
  avatarHash: string | null;
  joinedAt: Date | null;
  roleIds: string[];
  isBot: boolean;
};

export type MemberSyncSafeFailure = {
  code:
    | "invalid_bot_token"
    | "members_intent_required"
    | "rate_limited"
    | "discord_unavailable"
    | "malformed_snapshot"
    | "database_unavailable";
  safeMessage: string;
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type MemberSyncRunResult =
  | { status: "succeeded"; runId: string; memberCount: number; activeMemberCount: number; botCount: number; completedAt: string }
  | { status: "already-running"; runId: string; startedAt: string }
  | { status: "failed"; runId: string | null; failure: MemberSyncSafeFailure };
```

- [ ] **Step 2: Run the schema test and confirm RED**

Run:

```bash
npm test -- src/lib/database/schema.test.ts
```

Expected: FAIL because the sync tables, migration, and exported types do not exist.

- [ ] **Step 3: Add enums, columns, and tables**

Add to `src/lib/database/schema.ts`:

```ts
import { boolean, primaryKey } from "drizzle-orm/pg-core";

export const discordMembershipStatus = pgEnum("discord_membership_status", [
  "active",
  "left",
]);
export const discordSyncTrigger = pgEnum("discord_sync_trigger", ["cron", "manual"]);
export const discordSyncStatus = pgEnum("discord_sync_status", [
  "running",
  "succeeded",
  "failed",
]);
```

Extend `discordMembers` with the exact columns from the spec, using `jsonb("role_ids").$type<string[]>().default([]).notNull()`, `boolean("is_bot").default(false).notNull()`, and timestamp fields with timezone.

Define:

```ts
export const discordGuildRoles = pgTable(
  "discord_guild_roles",
  {
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
    name: text("name").notNull(),
    color: integer("color").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    managed: boolean("managed").default(false).notNull(),
    permissions: text("permissions").default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.roleId] })],
);

export const discordMemberSyncRuns = pgTable(
  "discord_member_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    trigger: discordSyncTrigger("trigger").notNull(),
    status: discordSyncStatus("status").default("running").notNull(),
    requestedBy: text("requested_by"),
    memberCount: integer("member_count"),
    activeMemberCount: integer("active_member_count"),
    botCount: integer("bot_count"),
    safeErrorCode: text("safe_error_code"),
    safeErrorMessage: text("safe_error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("discord_member_sync_runs_one_running_per_guild")
      .on(table.guildId)
      .where(sql`${table.status} = 'running'`),
  ],
);
```

- [ ] **Step 4: Generate and inspect the migration**

Run:

```bash
npx drizzle-kit generate --name discord_member_sync
```

Rename only if Drizzle does not produce `drizzle/0001_discord_member_sync.sql`. Inspect the SQL and ensure it adds the enums, columns, role table, run table, primary key, and partial unique index without dropping verification data.

- [ ] **Step 5: Run focused checks**

Run:

```bash
npm test -- src/lib/database/schema.test.ts src/lib/verification/repository.test.ts
npm run typecheck
git diff --check
```

Expected: PASS; existing verification records remain compatible.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add drizzle src/lib/database/schema.ts src/lib/database/schema.test.ts src/lib/member-sync/types.ts
git commit -m "feat: add Discord member sync schema"
```

---

### Task 2: Discord Roles and Paginated Members Client

**Files:**
- Create: `src/lib/member-sync/discord-client.ts`
- Create: `src/lib/member-sync/discord-client.test.ts`
- Modify: `src/lib/discord/rest-client.ts`
- Modify: `src/lib/discord/rest-client.test.ts`

**Interfaces:**
- Consumes: `DiscordGuildSnapshotClient`, `DiscordMemberSnapshot`, `DiscordRoleSnapshot`, `MemberSyncSafeFailure` from Task 1.
- Produces: `createDiscordGuildSnapshotClient(config, fetchImpl)` and `DiscordMemberSyncError` with safe public failure data.

- [ ] **Step 1: Write failing pagination and failure tests**

Create `src/lib/member-sync/discord-client.test.ts` with a fetch stub that records URLs and returns two pages:

```ts
test("fetches every member page with limit 1000 and after", async () => {
  const requests: string[] = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => member(String(index + 1)));
  const secondPage = [member("1001")];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    const body = url.includes("after=1000") ? secondPage : firstPage;
    return Response.json(body);
  };
  const client = createDiscordGuildSnapshotClient(config, fetchImpl);

  const members = await client.listAllGuildMembers("guild-1");

  expect(members).toHaveLength(1001);
  expect(requests).toEqual([
    "https://discord.test/api/v10/guilds/guild-1/members?limit=1000",
    "https://discord.test/api/v10/guilds/guild-1/members?limit=1000&after=1000",
  ]);
});
```

Add tests for 0, 1, 999, and exactly 1,000 members; roles; nickname/global-name/display-name precedence; avatar hash; bot flag; joined timestamp; role IDs; 401; 403; 429 with numeric `retry_after`; 5xx; timeout; non-array JSON; missing user ID; and a page whose final ID does not advance.

Assert every thrown public failure omits the token and raw response body.

- [ ] **Step 2: Run the client tests and confirm RED**

```bash
npm test -- src/lib/member-sync/discord-client.test.ts
```

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the server-only client**

Use this public shape:

```ts
import "server-only";

export class DiscordMemberSyncError extends Error {
  constructor(readonly failure: MemberSyncSafeFailure) {
    super(failure.safeMessage);
  }
}

export function createDiscordGuildSnapshotClient(
  config: { apiBaseUrl: string; botToken: string },
  fetchImpl: typeof fetch = fetch,
): DiscordGuildSnapshotClient {
  const request = (path: string) =>
    fetchImpl(`${config.apiBaseUrl}${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bot ${config.botToken}` },
      signal: AbortSignal.timeout(10_000),
    });

  return {
    async listGuildRoles(guildId) {
      return fetchAndNormalizeRoles(request, guildId);
    },
    async listAllGuildMembers(guildId) {
      return fetchAndNormalizeEveryMemberPage(request, guildId);
    },
  };
}
```

Map 403 to `members_intent_required` with the safe message `Enable Server Members Intent for RayFox in the Discord Developer Portal`. For 429, return a retryable failure and clamp `retryAfterSeconds` to an integer from 1 through 300; do not sleep in the Vercel function.

Extract shared HTTP-status classification from `src/lib/discord/rest-client.ts` only if doing so preserves every existing verification role/DM test. Never expose authorization headers.

- [ ] **Step 4: Run focused Discord tests**

```bash
npm test -- src/lib/member-sync/discord-client.test.ts src/lib/discord/rest-client.test.ts src/lib/discord/interactions.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the Discord snapshot client**

```bash
git add src/lib/member-sync/discord-client.ts src/lib/member-sync/discord-client.test.ts src/lib/discord/rest-client.ts src/lib/discord/rest-client.test.ts
git commit -m "feat: fetch Discord member snapshots"
```

---

### Task 3: Neon Lease, Atomic Snapshot, and Read Repository

**Files:**
- Create: `src/lib/member-sync/repository.ts`
- Create: `src/lib/member-sync/repository.test.ts`
- Create: `src/lib/member-sync/neon-repository.integration.test.ts`
- Modify: `src/lib/member-sync/types.ts`

**Interfaces:**
- Consumes: Task 1 schema and snapshot types.
- Produces: `createNeonMemberSyncRepository(database)`, lease/apply/fail methods, `listMembers()`, `getLatestStatus()`, and `getDiscordFacts()`.

- [ ] **Step 1: Define the repository contract and write failing tests**

Add to `types.ts`:

```ts
export interface MemberSyncRepository {
  claimRun(input: {
    guildId: string;
    trigger: MemberSyncTrigger;
    requestedBy: string | null;
    now: Date;
    staleBefore: Date;
  }): Promise<
    | { status: "claimed"; runId: string }
    | { status: "already-running"; runId: string; startedAt: Date }
  >;
  applySuccessfulSnapshot(input: {
    runId: string;
    guildId: string;
    verifiedRoleId: string;
    roles: DiscordRoleSnapshot[];
    members: DiscordMemberSnapshot[];
    completedAt: Date;
  }): Promise<{ memberCount: number; activeMemberCount: number; botCount: number }>;
  failRun(input: { runId: string; failure: MemberSyncSafeFailure; completedAt: Date }): Promise<void>;
  listMembers(guildId: string): Promise<SyncedDiscordMember[]>;
  getLatestStatus(guildId: string): Promise<MemberSyncViewStatus>;
  getDiscordFacts(guildId: string, verifiedRoleId: string): Promise<DiscordFacts>;
}
```

Write repository tests that assert:

- a fresh run is claimed;
- a current running row returns `already-running`;
- a run older than 15 minutes is failed before a new run is inserted;
- role and member upserts occur in one atomic PostgreSQL statement;
- current snapshot members become active;
- missing members become left only in `applySuccessfulSnapshot`;
- `verifiedAt` uses `COALESCE(existing, completedAt)` when the role is present;
- member rows missing the current role keep historical `verifiedAt` but read as currently unverified;
- manual success/failure writes a safe `admin_audit_events` row;
- no SQL parameter contains a token, email, message body, or raw Discord response.

- [ ] **Step 2: Run repository tests and confirm RED**

```bash
npm test -- src/lib/member-sync/repository.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement lease acquisition**

Use one SQL statement that first closes stale rows, then inserts a running row with `ON CONFLICT` protection. If insertion returns no row, query the active run and return `already-running`. Never guess a run ID.

The stale cutoff passed by the service is exactly `new Date(now.getTime() - 15 * 60 * 1000)`.

- [ ] **Step 4: Implement atomic snapshot application**

The current Neon HTTP driver rejects callback transactions. Use one data-modifying CTE statement so PostgreSQL applies every write atomically. Inside that statement:

1. Upsert every role by `(guild_id, role_id)`.
2. Upsert every member by `discord_user_id` with current identity, roles, `active`, and `last_seen_at`.
3. Set `verified_at = COALESCE(discord_members.verified_at, EXCLUDED.verified_at)`.
4. Mark active members from the same guild left where `last_seen_at < completedAt`.
5. Update the matching running sync row to succeeded with counts.
6. Add a safe audit row for manual runs.

Use JSON parameters and `jsonb_to_recordset` or Drizzle batched inserts; never interpolate member values into SQL strings.

- [ ] **Step 5: Implement truthful reads**

`listMembers` returns active members first, then left members, with role names resolved from `discord_guild_roles`. `getDiscordFacts` returns:

```ts
export type DiscordFacts = {
  activeMembers: number;
  verifiedMembers: number;
  botMembers: number;
  roleDistribution: Array<{ roleId: string; label: string; value: number }>;
  lastSuccessfulSyncAt: string | null;
};
```

Verified count is `membership_status = 'active' AND role_ids ? verifiedRoleId`; it is not a count of historical `verified_at`.

- [ ] **Step 6: Run repository and disposable-Neon tests**

```bash
npm test -- src/lib/member-sync/repository.test.ts
VERIFICATION_TEST_DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" npm test -- src/lib/member-sync/neon-repository.integration.test.ts
npm run typecheck
git diff --check
```

Expected: unit tests pass. The integration test runs only when the disposable test URL is configured and must refuse the production branch using the existing fixture guard pattern.

- [ ] **Step 7: Commit the Neon repository**

```bash
git add src/lib/member-sync/repository.ts src/lib/member-sync/repository.test.ts src/lib/member-sync/neon-repository.integration.test.ts src/lib/member-sync/types.ts
git commit -m "feat: persist Discord member snapshots"
```

---

### Task 4: Sync Service and Fail-Closed Runtime

**Files:**
- Create: `src/lib/member-sync/service.ts`
- Create: `src/lib/member-sync/service.test.ts`
- Create: `src/lib/member-sync/runtime.ts`
- Create: `src/lib/member-sync/runtime.test.ts`
- Modify: `src/lib/member-sync/types.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `DiscordGuildSnapshotClient`, `MemberSyncRepository`, Discord runtime config, and `verifiedRoleId`.
- Produces: `createDiscordMemberSyncService(dependencies)` and `createMemberSyncRuntime(env, fetchImpl)`.

- [ ] **Step 1: Write failing orchestration tests**

Cover these exact cases with fake client/repository implementations:

```ts
test("applies a complete roles and members snapshot", async () => {
  const service = createDiscordMemberSyncService(dependencies);
  const result = await service.sync({ trigger: "manual", requestedBy: "admin-42" });
  expect(result).toMatchObject({ status: "succeeded", memberCount: 2, botCount: 1 });
  expect(repository.appliedSnapshots).toHaveLength(1);
});

test("does not fetch Discord when another run owns the lease", async () => {
  repository.claimResult = { status: "already-running", runId: "run-1", startedAt: now };
  const result = await createDiscordMemberSyncService(dependencies).sync({
    trigger: "manual",
    requestedBy: "admin-42",
  });
  expect(result.status).toBe("already-running");
  expect(discordClient.calls).toEqual([]);
});
```

Also test duplicate member IDs, a member role absent from the role list, malformed identity, Discord safe failures, unexpected exceptions, database apply failure, and the guarantee that `applySuccessfulSnapshot` is never called after a failed or invalid fetch.

- [ ] **Step 2: Run service/runtime tests and confirm RED**

```bash
npm test -- src/lib/member-sync/service.test.ts src/lib/member-sync/runtime.test.ts
```

Expected: FAIL because service and runtime modules do not exist.

- [ ] **Step 3: Implement normalization and complete-snapshot validation**

The service must:

```ts
export function createDiscordMemberSyncService(dependencies: {
  guildId: string;
  verifiedRoleId: string;
  client: DiscordGuildSnapshotClient;
  repository: MemberSyncRepository;
  now(): Date;
}) {
  return {
    async sync(input: {
      trigger: MemberSyncTrigger;
      requestedBy: string | null;
    }): Promise<MemberSyncRunResult> {
      return runMemberSync(dependencies, input);
    },
  };
}
```

After claiming the lease, fetch roles and members concurrently with `Promise.all`. Reject duplicate user IDs, role IDs not present in the fetched guild-role set except the guild's implicit everyone role representation, and any page-level validation failure. Call `failRun` with only a safe code/message.

- [ ] **Step 4: Implement production runtime composition**

`createMemberSyncRuntime` returns:

```ts
export type MemberSyncRuntime =
  | { ready: false; reason: string }
  | {
      ready: true;
      config: { guildId: string; verifiedRoleId: string };
      service: ReturnType<typeof createDiscordMemberSyncService>;
      repository: MemberSyncRepository;
    };
```

Reuse `getDiscordRuntimeConfig`, `createDatabase`, `createDiscordGuildSnapshotClient`, and `createNeonMemberSyncRepository`. Do not log or return the bot token, database URL, verification key, or cron secret.

Update `.env.example` comments to say Server Members Intent is required; add no new secret.

- [ ] **Step 5: Run focused and regression tests**

```bash
npm test -- src/lib/member-sync/service.test.ts src/lib/member-sync/runtime.test.ts src/lib/verification/runtime.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit the service/runtime**

```bash
git add src/lib/member-sync .env.example
git commit -m "feat: orchestrate Discord member sync"
```

---

### Task 5: Protected Daily Vercel Cron Route

**Files:**
- Create: `src/app/api/internal/discord-member-sync/route.ts`
- Create: `src/app/api/internal/discord-member-sync/route.test.ts`
- Modify: `vercel.json`
- Modify: `src/app/(admin)/action-routes.test.tsx`

**Interfaces:**
- Consumes: `createMemberSyncRuntime().service.sync({ trigger: "cron", requestedBy: null })`.
- Produces: `createDiscordMemberSyncGet(dependencies)` and deployed `GET /api/internal/discord-member-sync`.

- [ ] **Step 1: Write failing authorization and response tests**

Create tests for missing `CRON_SECRET` (503), missing/wrong authorization (401), success (200), already-running (409), safe service failure (503), and thrown failure (503). Assert JSON contains no member rows or secrets.

Use:

```ts
const GET = createDiscordMemberSyncGet({
  getSecret: () => "cron-secret",
  run: async () => ({
    status: "succeeded",
    runId: "run-1",
    memberCount: 42,
    activeMemberCount: 41,
    botCount: 1,
    completedAt: "2026-08-24T04:00:00.000Z",
  }),
});
```

- [ ] **Step 2: Run the route test and confirm RED**

```bash
npm test -- src/app/api/internal/discord-member-sync/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route factory and production binding**

Mirror the timing-safe authorization pattern from verification retention. The production `run` must create the runtime, fail closed if not ready, and call the shared service. Map only the three discriminated result states.

Do not cache the result. Read `request.headers.get("authorization")` from the native `Request`.

- [ ] **Step 4: Add the once-daily cron without changing retention**

Set `vercel.json` to:

```json
{
  "crons": [
    {
      "path": "/api/internal/verification-retention",
      "schedule": "17 3 * * *"
    },
    {
      "path": "/api/internal/discord-member-sync",
      "schedule": "47 3 * * *"
    }
  ]
}
```

- [ ] **Step 5: Run route and configuration gates**

```bash
npm test -- src/app/api/internal/discord-member-sync/route.test.ts src/app/api/internal/verification-retention/route.test.ts src/app/\(admin\)/action-routes.test.tsx
npm run typecheck
npm run build
```

Expected: PASS; build accepts the Hobby-compatible once-daily cron.

- [ ] **Step 6: Commit the daily route**

```bash
git add src/app/api/internal/discord-member-sync vercel.json src/app/\(admin\)/action-routes.test.tsx
git commit -m "feat: schedule Discord member sync"
```

---

### Task 6: Allowlisted Manual Sync and Status Control

**Files:**
- Create: `src/app/(admin)/member-sync-actions.ts`
- Create: `src/app/(admin)/member-sync-actions.test.ts`
- Create: `src/features/members/member-sync-status.tsx`
- Create: `src/features/members/member-sync-status.test.tsx`
- Modify: `src/features/members/members-screen.module.css`
- Modify: `src/app/(admin)/members/page.tsx`

**Interfaces:**
- Consumes: `requireAdminActor`, `createMemberSyncRuntime`, `MemberSyncRunResult`, repository `getLatestStatus`.
- Produces: `syncDiscordMembersNow(): Promise<MemberSyncActionResult>` and `MemberSyncStatus` UI.

- [ ] **Step 1: Write failing Server Action authorization tests**

Use dependency injection around an action core and assert:

- missing, revoked, or non-allowlisted actor cannot call the service;
- client input has no actor ID field;
- the authenticated actor ID becomes `requestedBy`;
- production ignores `DEV_OPERATOR_ID`;
- success calls `revalidatePath("/members")`;
- returned values contain safe counts/status only.

Define the action result:

```ts
export type MemberSyncActionResult =
  | { state: "idle" }
  | { state: "succeeded"; memberCount: number; completedAt: string }
  | { state: "already-running"; startedAt: string }
  | { state: "failed"; message: string; retryable: boolean };
```

- [ ] **Step 2: Write failing status-control UI tests**

Render the control with never-synced, succeeded, degraded-stale, running, and failed status props. Assert an accessible last-sync time, active-member/bot counts, a disabled loading button, success `role="status"`, failure `role="alert"`, keyboard activation, and no token/raw error content.

- [ ] **Step 3: Run action/UI tests and confirm RED**

```bash
npm test -- src/app/\(admin\)/member-sync-actions.test.ts src/features/members/member-sync-status.test.tsx
```

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement the Server Action**

Use a module-level `'use server'` directive. Authorize inside every call, create the runtime after authorization, call the shared service with `trigger: "manual"`, map the result, then call `revalidatePath("/members")` on success.

Do not accept `FormData` or an actor ID because the action has no user-controlled business input.

- [ ] **Step 5: Implement the client control with `useActionState`**

Use React's action state for sequential dispatch and pending state:

```tsx
const [result, action, pending] = useActionState(syncAction, { state: "idle" });

<form action={action}>
  <button disabled={pending || status.state === "running"} type="submit">
    {pending ? "Syncing…" : "Sync now"}
  </button>
</form>
```

Render server-provided status before the action result so a page refresh remains truthful.

- [ ] **Step 6: Place status above both queue and directory**

In `MembersPage`, read runtime status after `requireAdminActor`, then render `MemberSyncStatus`, the existing verification queue, and the member directory. A failed sync must not hide the verification queue.

- [ ] **Step 7: Run focused tests and commit**

```bash
npm test -- src/app/\(admin\)/member-sync-actions.test.ts src/features/members/member-sync-status.test.tsx src/features/members/verification-queue.test.tsx
npm run typecheck
npm run lint
git diff --check
git add src/app/\(admin\)/member-sync-actions.ts src/app/\(admin\)/member-sync-actions.test.ts src/app/\(admin\)/members/page.tsx src/features/members/member-sync-status.tsx src/features/members/member-sync-status.test.tsx src/features/members/members-screen.module.css
git commit -m "feat: add manual Discord member sync"
```

---

### Task 7: Truthful Live Members Directory

**Files:**
- Create: `src/lib/member-sync/read-model.ts`
- Create: `src/lib/member-sync/read-model.test.ts`
- Modify: `src/features/members/members-screen.tsx`
- Modify: `src/features/members/members-screen.test.tsx`
- Modify: `src/features/members/member-detail.tsx`
- Modify: `src/features/members/members-screen.module.css`
- Modify: `src/app/(admin)/members/page.tsx`
- Modify: `src/lib/admin-data/availability.ts`
- Modify: `src/lib/admin-data/availability.test.ts`
- Modify: `src/lib/verification/runtime.ts`
- Modify: `src/lib/verification/runtime.test.ts`
- Modify: `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: repository `listMembers`, `getLatestStatus`, synchronized role data.
- Produces: `toMemberDirectoryRows`, live `MembersScreen({ members, initialSelectedMemberId })`, and `read-members` availability when a snapshot exists.

- [ ] **Step 1: Write failing read-model truthfulness tests**

Define:

```ts
export type MemberDirectoryRow = {
  id: string;
  displayName: string;
  discordHandle: string;
  avatarUrl: string | null;
  membershipStatus: "active" | "left";
  verified: boolean;
  roles: string[];
  joinedAt: string | null;
  lastSeenAt: string;
  isBot: boolean;
};
```

Assert role names resolve from role IDs, current verified state uses the configured role ID, avatar URLs are derived only from safe Discord hashes, and serialized rows contain none of `segment`, `registrationSource`, `customerStatus`, `vipSignal`, `lastActivity`, `notes`, `email`, or `message`.

- [ ] **Step 2: Rewrite Members tests first**

Update the component tests to pass real synchronized rows and assert only these filters:

- active/left/all;
- verified/unverified/all;
- role;
- bot/member/all;
- name/handle search.

Assert the table columns are Discord identity, Membership, Verification, Roles, Joined, Last snapshot, and Open. Assert old fake columns and filters are absent.

- [ ] **Step 3: Run read-model and Members tests and confirm RED**

```bash
npm test -- src/lib/member-sync/read-model.test.ts src/features/members/members-screen.test.tsx
```

Expected: FAIL because the current screen reads the unavailable provider and expects seeded business fields.

- [ ] **Step 4: Implement server-backed rows and directory UI**

Make `MembersPage` load synchronized rows on the server and pass them to the client component. `MembersScreen` must not call `provider.getState()`.

Replace mutable fake detail controls with a read-only Discord detail showing identity, membership, roles, join time, last snapshot, and bot/member state. Keep verification review in the existing separate queue/dialog.

- [ ] **Step 5: Resolve member-sync availability**

Extend availability with:

```ts
discordMemberSync: {
  status: "connected" | "degraded" | "not-connected";
  detail: string;
}
```

Set `read-members` available after at least one successful snapshot. If the latest run failed but a prior successful snapshot exists, keep `read-members` available and mark the integration degraded. A never-synced runtime remains unavailable but still renders the Sync now status panel.

Keep `mutate-members` unavailable.

- [ ] **Step 6: Run Members, availability, auth, and regression tests**

```bash
npm test -- src/lib/member-sync/read-model.test.ts src/features/members/members-screen.test.tsx src/lib/admin-data/availability.test.ts src/lib/verification/runtime.test.ts src/app/\(admin\)/read-routes.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS; verification queue tests remain green.

- [ ] **Step 7: Commit the truthful directory**

```bash
git add src/lib/member-sync/read-model.ts src/lib/member-sync/read-model.test.ts src/features/members src/app/\(admin\)/members/page.tsx src/lib/admin-data/availability.ts src/lib/admin-data/availability.test.ts src/lib/verification/runtime.ts src/lib/verification/runtime.test.ts src/app/\(admin\)/layout.tsx
git commit -m "feat: show synchronized Discord members"
```

---

### Task 8: Partial-Live Overview and Community Facts

**Files:**
- Modify: `src/lib/member-sync/read-model.ts`
- Modify: `src/lib/member-sync/read-model.test.ts`
- Modify: `src/app/(admin)/page.tsx`
- Modify: `src/app/(admin)/page.test.tsx`
- Modify: `src/features/overview/overview-screen.tsx`
- Modify: `src/features/overview/overview-screen.test.tsx`
- Modify: `src/features/overview/metric-strip.tsx`
- Modify: `src/components/data-state/data-unavailable.tsx`
- Modify: `src/features/overview/overview-screen.module.css`
- Modify: `src/app/(admin)/community/page.tsx`
- Modify: `src/features/community/community-screen.tsx`
- Modify: `src/features/community/community-screen.test.tsx`
- Modify: `src/features/community/community-screen.module.css`

**Interfaces:**
- Consumes: repository `getDiscordFacts`, last successful sync timestamp, synchronized roles.
- Produces: `DiscordOverviewFacts`, `DiscordCommunityFacts`, partial-live Overview cards, and truthful Community role/membership panels.

- [ ] **Step 1: Write failing Overview/Community read-model tests**

Define:

```ts
export type DiscordOverviewFacts = {
  discordMembers: number;
  verifiedCustomers: number;
  asOf: string;
};

export type DiscordCommunityFacts = {
  activeMembers: number;
  leftMembers: number;
  botMembers: number;
  verifiedMembers: number;
  roleDistribution: Array<{ label: string; value: number }>;
  asOf: string;
};
```

Assert active counts exclude bots where the UI label says people, Verified Customers count only active members with the configured role, role distribution excludes `@everyone` and managed bot roles, and the models expose no channel activity, active-member engagement, onboarding, visitor, or paid-customer fields.

- [ ] **Step 2: Write failing Overview tests**

Assert a partial-live page renders real Discord Members and Verified Customers with `Latest Discord snapshot · <time>`, while Registrations, Transfers, Renewal Rate, and Attributed Revenue remain `—`. Assert conversion chart, priorities, funnel, leads, and campaign panels are replaced by one Marketing API unavailable state rather than empty/fake charts.

- [ ] **Step 3: Write failing Community tests**

Assert the page renders active, left, bot, and verified facts plus role distribution. Assert Channel activity and Conversion panels display explicit unavailable states and never show zero-based fake percentages.

- [ ] **Step 4: Run the focused tests and confirm RED**

```bash
npm test -- src/lib/member-sync/read-model.test.ts src/features/overview/overview-screen.test.tsx src/features/community/community-screen.test.tsx src/app/\(admin\)/page.test.tsx
```

Expected: FAIL because Overview is all-or-nothing and Community depends on the unavailable seeded provider.

- [ ] **Step 5: Implement server-provided partial-live facts**

Make Overview and Community pages async Server Components that obtain safe read models from the member-sync runtime. Pass serializable fact props to client presentation components.

The Overview metric strip accepts two live metrics plus four unavailable metrics. Do not create trend deltas from a single current snapshot.

The Community page renders membership facts and role distribution from synchronized rows, then explicit unavailable cards for channel activity, onboarding, and paid conversion.

Visible integration copy is exactly: `Discord data connected · RayName Marketing API pending`.

- [ ] **Step 6: Run focused accessibility and regression tests**

```bash
npm test -- src/lib/member-sync/read-model.test.ts src/features/overview src/features/community src/app/\(admin\)/page.test.tsx src/app/\(admin\)/community/page.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS in light/dark unit render paths with no fabricated values.

- [ ] **Step 7: Commit partial-live facts**

```bash
git add src/lib/member-sync/read-model.ts src/lib/member-sync/read-model.test.ts src/app/\(admin\)/page.tsx src/app/\(admin\)/page.test.tsx src/features/overview src/components/data-state/data-unavailable.tsx src/app/\(admin\)/community src/features/community
git commit -m "feat: expose live Discord community facts"
```

---

### Task 9: Browser Journey, Operations, and Final Gates

**Files:**
- Modify: `scripts/discord-api-stub.mjs`
- Modify: `scripts/discord-api-stub.test.ts`
- Create: `e2e/member-sync.spec.ts`
- Modify: `e2e/fixtures.ts`
- Modify: `scripts/run-verification-e2e.mjs`
- Modify: `scripts/run-verification-e2e.test.ts`
- Modify: `docs/operations.md`
- Modify: `design-qa.md` only if a fresh visual audit changes its status.

**Interfaces:**
- Consumes: deployed member-sync route/action/UI and existing disposable-Neon/loopback guard.
- Produces: a production-safe end-to-end proof and updated operations runbook.

- [ ] **Step 1: Extend the loopback Discord stub test-first**

Add deterministic endpoints for:

- `GET /api/v10/guilds/:guildId/roles`;
- paginated `GET /api/v10/guilds/:guildId/members?limit=1000&after=`;
- snapshot version 1 with active member/verified/admin/VIP roles;
- snapshot version 2 with a renamed member, changed roles, one join, and one leave;
- safe 403, 429, and 5xx modes.

The stub must bind loopback only and reject requests without the fixed test bot token.

- [ ] **Step 2: Write the browser journey and confirm RED**

The test must:

1. start with the guarded disposable Neon branch;
2. visit `/members` as the development test operator;
3. run Sync now;
4. observe version-1 real members and counts;
5. refresh and prove persistence;
6. switch the loopback stub to version 2;
7. run Sync now again;
8. observe role/name/join/leave changes;
9. visit Overview and Community and see only synchronized facts;
10. assert zero browser console/page errors and run axe on all three pages.

Run:

```bash
VERIFICATION_TEST_DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" \
VERIFICATION_TEST_BRANCH_ID="$VERIFICATION_TEST_BRANCH_ID" \
VERIFICATION_PRODUCTION_BRANCH_ID="$VERIFICATION_PRODUCTION_BRANCH_ID" \
npx playwright test e2e/member-sync.spec.ts
```

Expected: FAIL before the stub/runner supports member snapshots.

- [ ] **Step 3: Wire the guarded test runner**

Reuse the existing production-branch identity checks. Cleanup only member-sync fixture rows created with fixed test guild/user IDs. Never point the stub or cleanup at production Discord, and never remove production member rows.

- [ ] **Step 4: Update operations documentation**

Document:

- enabling Server Members Intent;
- disposable-branch migration and test order;
- production migration command;
- manual first sync and count comparison;
- Vercel daily Cron verification;
- safe 401/403/429/5xx recovery;
- stale data behavior;
- disabling the cron without deleting data;
- no Railway requirement;
- Marketing API limitations.

- [ ] **Step 5: Run final focused tests twice**

```bash
npm test -- src/lib/member-sync src/app/api/internal/discord-member-sync src/app/\(admin\)/member-sync-actions.test.ts src/features/members src/features/overview src/features/community
npm test -- src/lib/member-sync src/app/api/internal/discord-member-sync src/app/\(admin\)/member-sync-actions.test.ts src/features/members src/features/overview src/features/community
```

Expected: both runs PASS.

- [ ] **Step 6: Run all quality gates**

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all commands exit 0. Only the three pre-existing untracked brand PNG files may remain outside the scoped commit.

- [ ] **Step 7: Review security and production truthfulness**

Search the production dependency graph and built output for test adapters, Discord fixture payloads, tokens, raw authorization headers, emails, message fields, seeded members, and Marketing API claims. Verify cron and manual routes re-authorize independently.

- [ ] **Step 8: Commit the journey and runbook**

```bash
git add scripts/discord-api-stub.mjs scripts/discord-api-stub.test.ts scripts/run-verification-e2e.mjs scripts/run-verification-e2e.test.ts e2e/member-sync.spec.ts e2e/fixtures.ts docs/operations.md design-qa.md
git commit -m "test: prove Discord member sync journey"
```

- [ ] **Step 9: Prepare deployment handoff**

Report the migration filename, final commit range, exact test counts, intent requirement, first manual-sync procedure, cron schedule, rollback path, and the fact that Marketing API-dependent data remains unavailable.

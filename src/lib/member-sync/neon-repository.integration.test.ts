// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import * as schema from "@/lib/database/schema";

import { createNeonMemberSyncRepository } from "./repository";
import type {
  DiscordMemberSnapshot,
  DiscordRoleSnapshot,
  MemberSyncSafeFailure,
} from "./types";

const guildId = "1540610722281824336";
const verifiedRoleId = "1540611679023276114";
const everyoneRoleId = guildId;
const adminId = "323456789012345678";

const roles: DiscordRoleSnapshot[] = [
  {
    guildId,
    roleId: everyoneRoleId,
    name: "@everyone",
    color: 0,
    position: 0,
    managed: false,
    permissions: "0",
  },
  {
    guildId,
    roleId: verifiedRoleId,
    name: "Verified Customer",
    color: 5_797_262,
    position: 4,
    managed: false,
    permissions: "0",
  },
];

function member(
  discordUserId: string,
  input: Partial<DiscordMemberSnapshot> = {},
): DiscordMemberSnapshot {
  return {
    guildId,
    discordUserId,
    username: `member-${discordUserId}`,
    globalName: `Member ${discordUserId}`,
    guildDisplayName: `Member ${discordUserId}`,
    avatarHash: `user:avatar-${discordUserId}`,
    joinedAt: new Date("2026-08-20T00:00:00.000Z"),
    roleIds: [],
    isBot: false,
    ...input,
  };
}

describe("Neon-compatible Discord member sync repository", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client, { schema }), { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  function repository() {
    return createNeonMemberSyncRepository(drizzle(client, { schema }));
  }

  async function claim(
    now: Date,
    trigger: "manual" | "cron" = "manual",
  ) {
    return repository().claimRun({
      guildId,
      trigger,
      requestedBy: trigger === "manual" ? adminId : null,
      now,
      staleBefore: new Date(now.getTime() - 15 * 60 * 1_000),
    });
  }

  test("claims one current run and returns that exact lease to a competitor", async () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    const first = await claim(now);
    const second = await claim(new Date("2026-08-24T00:01:00.000Z"));

    expect(first.status).toBe("claimed");
    if (first.status !== "claimed") throw new Error("Expected a claimed run");
    expect(second).toEqual({
      status: "already-running",
      runId: first.runId,
      startedAt: now,
    });
  });

  test("fails an abandoned lease before claiming a new run", async () => {
    const first = await claim(new Date("2026-08-24T00:00:00.000Z"));
    const second = await claim(new Date("2026-08-24T00:16:00.000Z"));

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("claimed");
    if (first.status !== "claimed") throw new Error("Expected first run");
    const result = await client.query<{
      id: string;
      status: string;
      safe_error_code: string | null;
    }>("select id, status, safe_error_code from discord_member_sync_runs order by started_at");
    expect(result.rows).toEqual([
      {
        id: first.runId,
        status: "failed",
        safe_error_code: "stale_run_recovered",
      },
      expect.objectContaining({ status: "running" }),
    ]);
  });

  test("atomically applies members, roles, counts, and a safe manual audit", async () => {
    const completedAt = new Date("2026-08-24T01:00:00.000Z");
    const run = await claim(new Date("2026-08-24T00:59:00.000Z"));
    if (run.status !== "claimed") throw new Error("Expected run");

    await expect(
      repository().applySuccessfulSnapshot({
        runId: run.runId,
        guildId,
        verifiedRoleId,
        roles,
        members: [
          member("user-1", { roleIds: [verifiedRoleId] }),
          member("bot-1", { isBot: true }),
        ],
        completedAt,
      }),
    ).resolves.toEqual({ memberCount: 2, activeMemberCount: 2, botCount: 1 });

    const members = await repository().listMembers(guildId);
    expect(members).toHaveLength(2);
    expect(members.find(({ discordUserId }) => discordUserId === "user-1")).toMatchObject({
      membershipStatus: "active",
      roleIds: [verifiedRoleId],
      roleNames: ["Verified Customer"],
      verifiedAt: completedAt.toISOString(),
    });
    expect(await repository().getDiscordFacts(guildId, verifiedRoleId)).toEqual({
      activeMembers: 2,
      verifiedMembers: 1,
      botMembers: 1,
      roleDistribution: [
        { roleId: verifiedRoleId, label: "Verified Customer", value: 1 },
      ],
      lastSuccessfulSyncAt: completedAt.toISOString(),
    });

    const audit = await client.query<{
      actor_id: string;
      action: string;
      outcome: string;
      metadata: Record<string, unknown>;
    }>("select actor_id, action, outcome, metadata from admin_audit_events");
    expect(audit.rows).toEqual([
      {
        actor_id: adminId,
        action: "discord_member_sync",
        outcome: "succeeded",
        metadata: { activeMemberCount: 2, botCount: 1, memberCount: 2 },
      },
    ]);
  });

  test("marks only missing members left and keeps historical verification separate from current role state", async () => {
    const firstRun = await claim(new Date("2026-08-24T01:00:00.000Z"));
    if (firstRun.status !== "claimed") throw new Error("Expected first run");
    await repository().applySuccessfulSnapshot({
      runId: firstRun.runId,
      guildId,
      verifiedRoleId,
      roles,
      members: [
        member("user-1", { roleIds: [verifiedRoleId] }),
        member("user-2"),
      ],
      completedAt: new Date("2026-08-24T01:01:00.000Z"),
    });

    const secondRun = await claim(new Date("2026-08-25T01:00:00.000Z"));
    if (secondRun.status !== "claimed") throw new Error("Expected second run");
    await repository().applySuccessfulSnapshot({
      runId: secondRun.runId,
      guildId,
      verifiedRoleId,
      roles,
      members: [member("user-1", { roleIds: [] })],
      completedAt: new Date("2026-08-25T01:01:00.000Z"),
    });

    const members = await repository().listMembers(guildId);
    expect(members.map(({ discordUserId, membershipStatus }) => ({ discordUserId, membershipStatus })))
      .toEqual([
        { discordUserId: "user-1", membershipStatus: "active" },
        { discordUserId: "user-2", membershipStatus: "left" },
      ]);
    expect(members[0]).toMatchObject({
      roleIds: [],
      verifiedAt: "2026-08-24T01:01:00.000Z",
      leftAt: null,
    });
    expect(members[1].leftAt).toBe("2026-08-25T01:01:00.000Z");
    expect((await repository().getDiscordFacts(guildId, verifiedRoleId)).verifiedMembers).toBe(0);
  });

  test("records only a safe failure and leaves the previous snapshot available", async () => {
    const run = await claim(new Date("2026-08-24T02:00:00.000Z"));
    if (run.status !== "claimed") throw new Error("Expected run");
    const failure: MemberSyncSafeFailure = {
      code: "rate_limited",
      safeMessage: "Discord is rate limiting member synchronization",
      retryable: true,
      retryAfterSeconds: 30,
    };

    await repository().failRun({
      runId: run.runId,
      failure,
      completedAt: new Date("2026-08-24T02:01:00.000Z"),
    });

    const status = await repository().getLatestStatus(guildId);
    expect(status).toMatchObject({
      state: "degraded",
      lastRunId: run.runId,
      safeErrorCode: "rate_limited",
      safeErrorMessage: failure.safeMessage,
    });
    const audit = await client.query<{ metadata: Record<string, unknown> }>(
      "select metadata from admin_audit_events",
    );
    expect(JSON.stringify(audit.rows)).toContain("rate_limited");
    expect(JSON.stringify(audit.rows)).not.toContain("raw");
  });

  test("rolls back the complete snapshot when one member write is invalid", async () => {
    const run = await claim(new Date("2026-08-24T03:00:00.000Z"));
    if (run.status !== "claimed") throw new Error("Expected run");

    await expect(
      repository().applySuccessfulSnapshot({
        runId: run.runId,
        guildId,
        verifiedRoleId,
        roles,
        members: [member("duplicate"), member("duplicate")],
        completedAt: new Date("2026-08-24T03:01:00.000Z"),
      }),
    ).rejects.toThrow();

    const memberRows = await client.query("select * from discord_members");
    const roleRows = await client.query("select * from discord_guild_roles");
    const runRows = await client.query<{ status: string }>(
      "select status from discord_member_sync_runs where id = $1",
      [run.runId],
    );
    expect(memberRows.rows).toHaveLength(0);
    expect(roleRows.rows).toHaveLength(0);
    expect(runRows.rows[0].status).toBe("running");
  });
});

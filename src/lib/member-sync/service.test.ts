import { describe, expect, test, vi } from "vitest";

import { DiscordMemberSyncError } from "./discord-client";
import { createDiscordMemberSyncService } from "./service";
import type {
  DiscordGuildSnapshotClient,
  DiscordMemberSnapshot,
  DiscordRoleSnapshot,
  MemberSyncRepository,
  MemberSyncSafeFailure,
} from "./types";

const now = new Date("2026-08-24T04:00:00.000Z");
const guildId = "1540610722281824336";
const verifiedRoleId = "1540611679023276114";

const roles: DiscordRoleSnapshot[] = [
  {
    guildId,
    roleId: guildId,
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
    color: 1,
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
    globalName: null,
    guildDisplayName: `Member ${discordUserId}`,
    avatarHash: null,
    joinedAt: null,
    roleIds: [],
    isBot: false,
    ...input,
  };
}

function createHarness() {
  const client: DiscordGuildSnapshotClient = {
    listGuildRoles: vi.fn().mockResolvedValue(roles),
    listAllGuildMembers: vi.fn().mockResolvedValue([
      member("user-1", { roleIds: [verifiedRoleId] }),
      member("bot-1", { isBot: true }),
    ]),
  };
  const repository: MemberSyncRepository = {
    claimRun: vi.fn().mockResolvedValue({ status: "claimed", runId: "run-1" }),
    applySuccessfulSnapshot: vi.fn().mockResolvedValue({
      memberCount: 2,
      activeMemberCount: 2,
      botCount: 1,
    }),
    failRun: vi.fn().mockResolvedValue(undefined),
    listMembers: vi.fn().mockResolvedValue([]),
    getLatestStatus: vi.fn(),
    getDiscordFacts: vi.fn(),
  };
  const service = createDiscordMemberSyncService({
    guildId,
    verifiedRoleId,
    client,
    repository,
    now: () => now,
  });
  return { client, repository, service };
}

describe("Discord member sync service", () => {
  test("applies a complete roles and members snapshot", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.sync({ trigger: "manual", requestedBy: "admin-42" }),
    ).resolves.toEqual({
      status: "succeeded",
      runId: "run-1",
      memberCount: 2,
      activeMemberCount: 2,
      botCount: 1,
      completedAt: now.toISOString(),
    });
    expect(repository.claimRun).toHaveBeenCalledWith({
      guildId,
      trigger: "manual",
      requestedBy: "admin-42",
      now,
      staleBefore: new Date("2026-08-24T03:45:00.000Z"),
    });
    expect(repository.applySuccessfulSnapshot).toHaveBeenCalledTimes(1);
  });

  test("does not fetch Discord when another run owns the lease", async () => {
    const { client, repository, service } = createHarness();
    vi.mocked(repository.claimRun).mockResolvedValue({
      status: "already-running",
      runId: "run-live",
      startedAt: now,
    });

    await expect(
      service.sync({ trigger: "manual", requestedBy: "admin-42" }),
    ).resolves.toEqual({
      status: "already-running",
      runId: "run-live",
      startedAt: now.toISOString(),
    });
    expect(client.listGuildRoles).not.toHaveBeenCalled();
    expect(client.listAllGuildMembers).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "duplicate member IDs",
      members: [member("duplicate"), member("duplicate")],
      roleSet: roles,
    },
    {
      name: "a role absent from the guild role snapshot",
      members: [member("user-1", { roleIds: ["unknown-role"] })],
      roleSet: roles,
    },
    {
      name: "an empty username",
      members: [member("user-1", { username: "" })],
      roleSet: roles,
    },
    {
      name: "a duplicate role ID",
      members: [member("user-1")],
      roleSet: [roles[0], roles[0]],
    },
  ])("rejects $name before applying anything", async ({ members, roleSet }) => {
    const { client, repository, service } = createHarness();
    vi.mocked(client.listGuildRoles).mockResolvedValue(roleSet);
    vi.mocked(client.listAllGuildMembers).mockResolvedValue(members);

    const result = await service.sync({ trigger: "cron", requestedBy: null });

    expect(result).toEqual({
      status: "failed",
      runId: "run-1",
      failure: {
        code: "malformed_snapshot",
        safeMessage: "Discord returned an invalid member snapshot",
        retryable: false,
      },
    });
    expect(repository.applySuccessfulSnapshot).not.toHaveBeenCalled();
    expect(repository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      failure: expect.objectContaining({ code: "malformed_snapshot" }),
      completedAt: now,
    });
  });

  test("preserves a safe Discord failure and never applies the snapshot", async () => {
    const { client, repository, service } = createHarness();
    const failure: MemberSyncSafeFailure = {
      code: "rate_limited",
      safeMessage: "Discord is rate limiting member synchronization",
      retryable: true,
      retryAfterSeconds: 30,
    };
    vi.mocked(client.listAllGuildMembers).mockRejectedValue(
      new DiscordMemberSyncError(failure),
    );

    await expect(
      service.sync({ trigger: "cron", requestedBy: null }),
    ).resolves.toEqual({ status: "failed", runId: "run-1", failure });
    expect(repository.applySuccessfulSnapshot).not.toHaveBeenCalled();
    expect(repository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      failure,
      completedAt: now,
    });
  });

  test("maps an unexpected Discord exception to a safe unavailable result", async () => {
    const { client, repository, service } = createHarness();
    vi.mocked(client.listGuildRoles).mockRejectedValue(
      new Error("raw Discord response with bot-token"),
    );

    const result = await service.sync({ trigger: "cron", requestedBy: null });

    expect(result).toEqual({
      status: "failed",
      runId: "run-1",
      failure: {
        code: "discord_unavailable",
        safeMessage: "Discord is temporarily unavailable",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("bot-token");
    expect(repository.applySuccessfulSnapshot).not.toHaveBeenCalled();
  });

  test("marks the run failed when the atomic database apply fails", async () => {
    const { repository, service } = createHarness();
    vi.mocked(repository.applySuccessfulSnapshot).mockRejectedValue(
      new Error("postgres secret diagnostic"),
    );

    const result = await service.sync({ trigger: "manual", requestedBy: "admin-42" });

    expect(result).toEqual({
      status: "failed",
      runId: "run-1",
      failure: {
        code: "database_unavailable",
        safeMessage: "Member synchronization storage is temporarily unavailable",
        retryable: true,
      },
    });
    expect(repository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      failure: expect.objectContaining({ code: "database_unavailable" }),
      completedAt: now,
    });
  });

  test("fails closed when the lease database is unavailable", async () => {
    const { repository, service } = createHarness();
    vi.mocked(repository.claimRun).mockRejectedValue(new Error("database URL"));

    const result = await service.sync({ trigger: "cron", requestedBy: null });

    expect(result).toEqual({
      status: "failed",
      runId: null,
      failure: {
        code: "database_unavailable",
        safeMessage: "Member synchronization storage is temporarily unavailable",
        retryable: true,
      },
    });
  });
});

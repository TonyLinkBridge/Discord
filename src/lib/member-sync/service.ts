import "server-only";

import { DiscordMemberSyncError } from "./discord-client";
import type {
  DiscordGuildSnapshotClient,
  DiscordMemberSnapshot,
  DiscordRoleSnapshot,
  MemberSyncRepository,
  MemberSyncRunResult,
  MemberSyncSafeFailure,
  MemberSyncTrigger,
} from "./types";

type MemberSyncServiceDependencies = {
  guildId: string;
  verifiedRoleId: string;
  client: DiscordGuildSnapshotClient;
  repository: MemberSyncRepository;
  now(): Date;
};

const malformedFailure: MemberSyncSafeFailure = {
  code: "malformed_snapshot",
  safeMessage: "Discord returned an invalid member snapshot",
  retryable: false,
};

const discordUnavailableFailure: MemberSyncSafeFailure = {
  code: "discord_unavailable",
  safeMessage: "Discord is temporarily unavailable",
  retryable: true,
};

const databaseUnavailableFailure: MemberSyncSafeFailure = {
  code: "database_unavailable",
  safeMessage: "Member synchronization storage is temporarily unavailable",
  retryable: true,
};

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isCompleteSnapshot(
  guildId: string,
  roles: DiscordRoleSnapshot[],
  members: DiscordMemberSnapshot[],
): boolean {
  const roleIds = new Set<string>();
  for (const role of roles) {
    if (
      role.guildId !== guildId ||
      !isNonEmpty(role.roleId) ||
      !isNonEmpty(role.name) ||
      roleIds.has(role.roleId)
    ) {
      return false;
    }
    roleIds.add(role.roleId);
  }

  const memberIds = new Set<string>();
  for (const member of members) {
    if (
      member.guildId !== guildId ||
      !isNonEmpty(member.discordUserId) ||
      !isNonEmpty(member.username) ||
      !isNonEmpty(member.guildDisplayName) ||
      memberIds.has(member.discordUserId) ||
      new Set(member.roleIds).size !== member.roleIds.length
    ) {
      return false;
    }
    if (
      member.roleIds.some(
        (roleId) =>
          !isNonEmpty(roleId) ||
          (roleId !== guildId && !roleIds.has(roleId)),
      )
    ) {
      return false;
    }
    memberIds.add(member.discordUserId);
  }
  return true;
}

export function createDiscordMemberSyncService(
  dependencies: MemberSyncServiceDependencies,
) {
  const { guildId, verifiedRoleId, client, repository, now } = dependencies;

  async function failedRun(
    runId: string,
    failure: MemberSyncSafeFailure,
  ): Promise<MemberSyncRunResult> {
    try {
      await repository.failRun({ runId, failure, completedAt: now() });
      return { status: "failed", runId, failure };
    } catch {
      return {
        status: "failed",
        runId,
        failure: databaseUnavailableFailure,
      };
    }
  }

  return {
    async sync(input: {
      trigger: MemberSyncTrigger;
      requestedBy: string | null;
    }): Promise<MemberSyncRunResult> {
      const startedAt = now();
      let claim: Awaited<ReturnType<MemberSyncRepository["claimRun"]>>;
      try {
        claim = await repository.claimRun({
          guildId,
          trigger: input.trigger,
          requestedBy: input.requestedBy,
          now: startedAt,
          staleBefore: new Date(startedAt.getTime() - 15 * 60 * 1_000),
        });
      } catch {
        return {
          status: "failed",
          runId: null,
          failure: databaseUnavailableFailure,
        };
      }

      if (claim.status === "already-running") {
        return {
          status: "already-running",
          runId: claim.runId,
          startedAt: claim.startedAt.toISOString(),
        };
      }

      let roles: DiscordRoleSnapshot[];
      let members: DiscordMemberSnapshot[];
      try {
        [roles, members] = await Promise.all([
          client.listGuildRoles(guildId),
          client.listAllGuildMembers(guildId),
        ]);
      } catch (error) {
        const failure =
          error instanceof DiscordMemberSyncError
            ? error.failure
            : discordUnavailableFailure;
        return failedRun(claim.runId, failure);
      }

      if (!isCompleteSnapshot(guildId, roles, members)) {
        return failedRun(claim.runId, malformedFailure);
      }

      const completedAt = now();
      try {
        const counts = await repository.applySuccessfulSnapshot({
          runId: claim.runId,
          guildId,
          verifiedRoleId,
          roles,
          members,
          completedAt,
        });
        return {
          status: "succeeded",
          runId: claim.runId,
          ...counts,
          completedAt: completedAt.toISOString(),
        };
      } catch {
        return failedRun(claim.runId, databaseUnavailableFailure);
      }
    },
  };
}

export type DiscordMemberSyncService = ReturnType<
  typeof createDiscordMemberSyncService
>;

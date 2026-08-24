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

export type DiscordGuildSnapshotClient = {
  listGuildRoles(guildId: string): Promise<DiscordRoleSnapshot[]>;
  listAllGuildMembers(guildId: string): Promise<DiscordMemberSnapshot[]>;
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
  | {
      status: "succeeded";
      runId: string;
      memberCount: number;
      activeMemberCount: number;
      botCount: number;
      completedAt: string;
    }
  | { status: "already-running"; runId: string; startedAt: string }
  | {
      status: "failed";
      runId: string | null;
      failure: MemberSyncSafeFailure;
    };

export type SyncedDiscordMember = {
  discordUserId: string;
  username: string;
  globalName: string | null;
  guildDisplayName: string;
  avatarHash: string | null;
  joinedAt: string | null;
  roleIds: string[];
  roleNames: string[];
  isBot: boolean;
  membershipStatus: MembershipStatus;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  leftAt: string | null;
};

export type MemberSyncViewStatus = {
  state: "never" | "running" | "ready" | "degraded";
  lastRunId: string | null;
  lastRunStatus: MemberSyncStatus | null;
  lastRunTrigger: MemberSyncTrigger | null;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  safeErrorCode: string | null;
  safeErrorMessage: string | null;
};

export type DiscordFacts = {
  activeMembers: number;
  verifiedMembers: number;
  botMembers: number;
  roleDistribution: Array<{ roleId: string; label: string; value: number }>;
  lastSuccessfulSyncAt: string | null;
};

export type MemberDirectorySnapshot = {
  members: SyncedDiscordMember[];
  status: MemberSyncViewStatus;
};

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
  }): Promise<{
    memberCount: number;
    activeMemberCount: number;
    botCount: number;
  }>;
  failRun(input: {
    runId: string;
    failure: MemberSyncSafeFailure;
    completedAt: Date;
  }): Promise<void>;
  listMembers(guildId: string): Promise<SyncedDiscordMember[]>;
  getLatestStatus(guildId: string): Promise<MemberSyncViewStatus>;
  getDiscordFacts(
    guildId: string,
    verifiedRoleId: string,
  ): Promise<DiscordFacts>;
}

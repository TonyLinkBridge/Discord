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

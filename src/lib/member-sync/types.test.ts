import { expectTypeOf, test } from "vitest";

import type {
  DiscordMemberSnapshot,
  DiscordRoleSnapshot,
  MemberSyncRunResult,
  MemberSyncSafeFailure,
  MemberSyncStatus,
  MemberSyncTrigger,
  MembershipStatus,
} from "./types";

test("defines the approved Discord member snapshot contract", () => {
  expectTypeOf<MembershipStatus>().toEqualTypeOf<"active" | "left">();
  expectTypeOf<MemberSyncTrigger>().toEqualTypeOf<"cron" | "manual">();
  expectTypeOf<MemberSyncStatus>().toEqualTypeOf<
    "running" | "succeeded" | "failed"
  >();

  expectTypeOf<DiscordMemberSnapshot>().toEqualTypeOf<{
    guildId: string;
    discordUserId: string;
    username: string;
    globalName: string | null;
    guildDisplayName: string;
    avatarHash: string | null;
    joinedAt: Date | null;
    roleIds: string[];
    isBot: boolean;
  }>();

  expectTypeOf<DiscordRoleSnapshot>().toEqualTypeOf<{
    guildId: string;
    roleId: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
    permissions: string;
  }>();
});

test("keeps member sync results safe to return to an administrator", () => {
  expectTypeOf<MemberSyncSafeFailure["code"]>().toEqualTypeOf<
    | "invalid_bot_token"
    | "members_intent_required"
    | "rate_limited"
    | "discord_unavailable"
    | "malformed_snapshot"
    | "database_unavailable"
  >();

  expectTypeOf<MemberSyncRunResult>().toMatchTypeOf<
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
      }
  >();
});

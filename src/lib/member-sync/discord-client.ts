import "server-only";

import type {
  DiscordGuildSnapshotClient,
  DiscordMemberSnapshot,
  DiscordRoleSnapshot,
  MemberSyncSafeFailure,
} from "./types";

type DiscordSnapshotClientConfig = {
  apiBaseUrl: string;
  botToken: string;
};

const pageSize = 1_000;

export class DiscordMemberSyncError extends Error {
  constructor(readonly failure: MemberSyncSafeFailure) {
    super(failure.safeMessage);
    this.name = "DiscordMemberSyncError";
  }
}

function malformedSnapshot(): DiscordMemberSyncError {
  return new DiscordMemberSyncError({
    code: "malformed_snapshot",
    safeMessage: "Discord returned an invalid member snapshot",
    retryable: false,
  });
}

function unavailable(): DiscordMemberSyncError {
  return new DiscordMemberSyncError({
    code: "discord_unavailable",
    safeMessage: "Discord is temporarily unavailable",
    retryable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw malformedSnapshot();
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw malformedSnapshot();
  return value;
}

function normalizeRole(value: unknown, guildId: string): DiscordRoleSnapshot {
  if (!isRecord(value)) throw malformedSnapshot();
  if (
    typeof value.color !== "number" ||
    !Number.isInteger(value.color) ||
    typeof value.position !== "number" ||
    !Number.isInteger(value.position) ||
    typeof value.managed !== "boolean"
  ) {
    throw malformedSnapshot();
  }

  return {
    guildId,
    roleId: requiredString(value.id),
    name: requiredString(value.name),
    color: value.color,
    position: value.position,
    managed: value.managed,
    permissions: requiredString(value.permissions),
  };
}

function normalizeMember(
  value: unknown,
  guildId: string,
): DiscordMemberSnapshot {
  if (!isRecord(value) || !isRecord(value.user) || !Array.isArray(value.roles)) {
    throw malformedSnapshot();
  }
  if (!value.roles.every((roleId) => typeof roleId === "string")) {
    throw malformedSnapshot();
  }

  const user = value.user;
  const discordUserId = requiredString(user.id);
  const username = requiredString(user.username);
  const globalName = nullableString(user.global_name);
  const nick = nullableString(value.nick);
  const memberAvatar = nullableString(value.avatar);
  const userAvatar = nullableString(user.avatar);
  const bot = user.bot;
  if (bot !== undefined && typeof bot !== "boolean") throw malformedSnapshot();

  let joinedAt: Date | null = null;
  if (value.joined_at !== null && value.joined_at !== undefined) {
    const joinedAtValue = requiredString(value.joined_at);
    joinedAt = new Date(joinedAtValue);
    if (Number.isNaN(joinedAt.getTime())) throw malformedSnapshot();
  }

  return {
    guildId,
    discordUserId,
    username,
    globalName,
    guildDisplayName: nick ?? globalName ?? username,
    avatarHash: memberAvatar
      ? `guild:${memberAvatar}`
      : userAvatar
        ? `user:${userAvatar}`
        : null,
    joinedAt,
    roleIds: [...value.roles],
    isBot: bot ?? false,
  };
}

async function retryAfterSeconds(response: Response): Promise<number> {
  let retryAfter: unknown;
  try {
    const value: unknown = await response.json();
    retryAfter = isRecord(value) ? value.retry_after : undefined;
  } catch {
    retryAfter = undefined;
  }
  const seconds = typeof retryAfter === "number" ? Math.floor(retryAfter) : 1;
  return Math.min(300, Math.max(1, Number.isFinite(seconds) ? seconds : 1));
}

async function failureForResponse(response: Response): Promise<DiscordMemberSyncError> {
  if (response.status === 401) {
    return new DiscordMemberSyncError({
      code: "invalid_bot_token",
      safeMessage: "Discord bot authorization failed",
      retryable: false,
    });
  }
  if (response.status === 403) {
    return new DiscordMemberSyncError({
      code: "members_intent_required",
      safeMessage:
        "Enable Server Members Intent for RayFox in the Discord Developer Portal",
      retryable: false,
    });
  }
  if (response.status === 429) {
    return new DiscordMemberSyncError({
      code: "rate_limited",
      safeMessage: "Discord is rate limiting member synchronization",
      retryable: true,
      retryAfterSeconds: await retryAfterSeconds(response),
    });
  }
  return unavailable();
}

export function createDiscordGuildSnapshotClient(
  config: DiscordSnapshotClientConfig,
  fetchImpl: typeof fetch = fetch,
): DiscordGuildSnapshotClient {
  const apiBaseUrl = config.apiBaseUrl.replace(/\/$/, "");
  const request = async (path: string): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(`${apiBaseUrl}${path}`, {
        cache: "no-store",
        headers: { Authorization: `Bot ${config.botToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw unavailable();
    }
    if (!response.ok) throw await failureForResponse(response);
    return response;
  };

  const readArray = async (path: string): Promise<unknown[]> => {
    const response = await request(path);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw malformedSnapshot();
    }
    if (!Array.isArray(value)) throw malformedSnapshot();
    return value;
  };

  return {
    async listGuildRoles(guildId) {
      const values = await readArray(
        `/guilds/${encodeURIComponent(guildId)}/roles`,
      );
      return values.map((value) => normalizeRole(value, guildId));
    },

    async listAllGuildMembers(guildId) {
      const members: DiscordMemberSnapshot[] = [];
      let after: string | null = null;

      while (true) {
        const query = new URLSearchParams({ limit: String(pageSize) });
        if (after) query.set("after", after);
        const values = await readArray(
          `/guilds/${encodeURIComponent(guildId)}/members?${query.toString()}`,
        );
        const page = values.map((value) => normalizeMember(value, guildId));
        members.push(...page);
        if (page.length < pageSize) return members;

        const nextAfter = page.at(-1)?.discordUserId;
        if (!nextAfter || nextAfter === after) throw malformedSnapshot();
        after = nextAfter;
      }
    },
  };
}

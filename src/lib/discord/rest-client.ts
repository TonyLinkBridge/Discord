import "server-only";

import type { DiscordRoleClient } from "@/lib/verification/types";

type DiscordRestConfig = {
  apiBaseUrl: string;
  botToken: string;
};

type Fetch = typeof fetch;

type SafeFailure = Extract<
  Awaited<ReturnType<DiscordRoleClient["ensureRole"]>>,
  { status: "failed" }
>;

function failureForStatus(status: number): SafeFailure {
  if (status === 401) {
    return {
      status: "failed",
      code: "invalid_bot_token",
      safeMessage: "Discord bot authorization failed",
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      status: "failed",
      code: "missing_permissions",
      safeMessage: "Move the bot role above Verified Customer",
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      status: "failed",
      code: "member_or_role_not_found",
      safeMessage: "Discord member or Verified Customer role was not found",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      status: "failed",
      code: "rate_limited",
      safeMessage: "Discord is rate limiting role updates",
      retryable: true,
    };
  }
  return {
    status: "failed",
    code: "discord_unavailable",
    safeMessage: "Discord is temporarily unavailable",
    retryable: true,
  };
}

export function createDiscordRoleClient(
  config: DiscordRestConfig,
  fetchImpl: Fetch = fetch,
): DiscordRoleClient {
  const headers = { Authorization: `Bot ${config.botToken}` };
  const request = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${config.apiBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });

  return {
    async ensureRole({ discordUserId, guildId, roleId }) {
      try {
        const memberResponse = await request(
          `/guilds/${guildId}/members/${discordUserId}`,
        );
        if (!memberResponse.ok) return failureForStatus(memberResponse.status);
        const member = (await memberResponse.json()) as { roles?: unknown };
        if (!Array.isArray(member.roles)) return failureForStatus(502);
        if (member.roles.includes(roleId)) return { status: "already-present" };

        const response = await request(
          `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
          { method: "PUT" },
        );
        return response.status === 204
          ? { status: "assigned" }
          : failureForStatus(response.status);
      } catch {
        return failureForStatus(503);
      }
    },

    async notifyReviewOutcome({ discordUserId, outcome, safeReason }) {
      try {
        const channelResponse = await request("/users/@me/channels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipient_id: discordUserId }),
        });
        if (!channelResponse.ok) {
          return {
            status: "failed",
            code: "dm_unavailable",
            safeMessage: "Could not open a private Discord message",
          };
        }
        const channel = (await channelResponse.json()) as { id?: unknown };
        if (typeof channel.id !== "string") {
          return {
            status: "failed",
            code: "dm_unavailable",
            safeMessage: "Could not open a private Discord message",
          };
        }
        const content =
          outcome === "approved"
            ? [
                "## ✅ Verification approved",
                "**Your RayName account is verified.** The **Verified Customer** role is now active.",
                "",
                "Explore what’s next at [RayName](https://www.rayname.com/).",
              ].join("\n")
            : [
                "## ⚠️ Verification update",
                "**We couldn’t approve your verification request.**",
                ...(safeReason ? [`Reason: ${safeReason}`] : []),
                "",
                "Need help? Visit [RayName](https://www.rayname.com/).",
              ].join("\n");
        const messageResponse = await request(`/channels/${channel.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        });
        return messageResponse.ok
          ? { status: "sent" }
          : {
              status: "failed",
              code: "dm_unavailable",
              safeMessage: "Could not send a private Discord message",
            };
      } catch {
        return {
          status: "failed",
          code: "dm_unavailable",
          safeMessage: "Could not send a private Discord message",
        };
      }
    },
  };
}

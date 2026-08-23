import { describe, expect, test, vi } from "vitest";

import { createDiscordRoleClient } from "./rest-client";

const config = {
  apiBaseUrl: "https://discord.com/api/v10",
  botToken: "test-bot-token-never-use-in-production",
};
const guildId = "1540610722281824336";
const discordUserId = "223456789012345678";
const roleId = "1540611679023276114";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Discord REST role client", () => {
  test("returns already-present without adding the role again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user: { id: discordUserId }, roles: [roleId] }),
    );
    const client = createDiscordRoleClient(config, fetchMock);

    await expect(
      client.ensureRole({ discordUserId, guildId, roleId }),
    ).resolves.toEqual({ status: "already-present" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("adds a missing role with a server-only bot authorization header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: discordUserId }, roles: [] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createDiscordRoleClient(config, fetchMock);

    await expect(
      client.ensureRole({ discordUserId, guildId, roleId }),
    ).resolves.toEqual({ status: "assigned" });

    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      expect.objectContaining({
        method: "PUT",
        cache: "no-store",
        headers: { Authorization: `Bot ${config.botToken}` },
      }),
    );
  });

  test.each([
    {
      status: 403,
      code: "missing_permissions",
      safeMessage: "Move the bot role above Verified Customer",
      retryable: false,
    },
    {
      status: 404,
      code: "member_or_role_not_found",
      safeMessage: "Discord member or Verified Customer role was not found",
      retryable: false,
    },
    {
      status: 429,
      code: "rate_limited",
      safeMessage: "Discord is rate limiting role updates",
      retryable: true,
    },
    {
      status: 500,
      code: "discord_unavailable",
      safeMessage: "Discord is temporarily unavailable",
      retryable: true,
    },
  ])("maps Discord $status without storing its raw body", async (expected) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("secret Discord diagnostic body", { status: expected.status }),
    );
    const client = createDiscordRoleClient(config, fetchMock);

    await expect(
      client.ensureRole({ discordUserId, guildId, roleId }),
    ).resolves.toEqual({
      status: "failed",
      code: expected.code,
      safeMessage: expected.safeMessage,
      retryable: expected.retryable,
    });
  });

  test("sends a private outcome without applicant email or domain data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "623456789012345678" }))
      .mockResolvedValueOnce(jsonResponse({ id: "723456789012345678" }));
    const client = createDiscordRoleClient(config, fetchMock);

    await expect(
      client.notifyReviewOutcome({ discordUserId, outcome: "approved" }),
    ).resolves.toEqual({ status: "sent" });

    const serializedCalls = JSON.stringify(fetchMock.mock.calls);
    expect(serializedCalls).toContain("Your RayName customer verification was approved");
    expect(serializedCalls).not.toContain("@example.com");
    expect(serializedCalls).not.toContain("example.com");
  });
});

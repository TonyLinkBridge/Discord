import { describe, expect, test, vi } from "vitest";

import {
  createDiscordGuildSnapshotClient,
  DiscordMemberSyncError,
} from "./discord-client";

const config = {
  apiBaseUrl: "https://discord.test/api/v10",
  botToken: "secret-bot-token-that-must-never-leak",
};

function member(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    avatar: null,
    joined_at: "2026-08-20T10:30:00.000Z",
    nick: null,
    roles: ["role-customer"],
    user: {
      avatar: `avatar-${id}`,
      bot: false,
      global_name: `Global ${id}`,
      id,
      username: `member-${id}`,
    },
    ...overrides,
  };
}

function role(id: string): Record<string, unknown> {
  return {
    id,
    name: `Role ${id}`,
    color: 5_797_262,
    position: 3,
    managed: false,
    permissions: "1024",
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function fetchStub(
  implementation: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    implementation(String(input), init),
  ) as unknown as typeof fetch;
}

describe("Discord guild snapshot client", () => {
  test("fetches every member page with limit 1000 and an advancing after cursor", async () => {
    const requests: string[] = [];
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      member(String(index + 1)),
    );
    const secondPage = [member("1001")];
    const fetchImpl = fetchStub(async (url) => {
      requests.push(url);
      return jsonResponse(url.includes("after=1000") ? secondPage : firstPage);
    });
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const members = await client.listAllGuildMembers("guild-1");

    expect(members).toHaveLength(1_001);
    expect(requests).toEqual([
      "https://discord.test/api/v10/guilds/guild-1/members?limit=1000",
      "https://discord.test/api/v10/guilds/guild-1/members?limit=1000&after=1000",
    ]);
  });

  test.each([
    { count: 0, requests: 1 },
    { count: 1, requests: 1 },
    { count: 999, requests: 1 },
    { count: 1_000, requests: 2 },
  ])("finishes a $count-member snapshot in $requests request(s)", async ({ count, requests }) => {
    const pages = [
      Array.from({ length: count }, (_, index) => member(String(index + 1))),
      [],
    ];
    const fetchImpl = fetchStub(async () => jsonResponse(pages.shift() ?? []));
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    await expect(client.listAllGuildMembers("guild-1")).resolves.toHaveLength(count);
    expect(fetchImpl).toHaveBeenCalledTimes(requests);
  });

  test("normalizes safe guild role metadata", async () => {
    const fetchImpl = fetchStub(async () => jsonResponse([role("role-1")]));
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    await expect(client.listGuildRoles("guild-1")).resolves.toEqual([
      {
        guildId: "guild-1",
        roleId: "role-1",
        name: "Role role-1",
        color: 5_797_262,
        position: 3,
        managed: false,
        permissions: "1024",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://discord.test/api/v10/guilds/guild-1/roles",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: `Bot ${config.botToken}` },
      }),
    );
  });

  test.each([
    { nick: "Guild Nick", globalName: "Global Name", username: "user", expected: "Guild Nick" },
    { nick: null, globalName: "Global Name", username: "user", expected: "Global Name" },
    { nick: null, globalName: null, username: "user", expected: "user" },
  ])("uses Discord display-name precedence for $expected", async ({ nick, globalName, username, expected }) => {
    const fetchImpl = fetchStub(async () =>
      jsonResponse([
        member("42", {
          nick,
          user: {
            avatar: "user-avatar",
            bot: true,
            global_name: globalName,
            id: "42",
            username,
          },
        }),
      ]),
    );
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    await expect(client.listAllGuildMembers("guild-1")).resolves.toEqual([
      {
        guildId: "guild-1",
        discordUserId: "42",
        username,
        globalName,
        guildDisplayName: expected,
        avatarHash: "user:user-avatar",
        joinedAt: new Date("2026-08-20T10:30:00.000Z"),
        roleIds: ["role-customer"],
        isBot: true,
      },
    ]);
  });

  test("prefers a guild avatar reference and accepts a null join time", async () => {
    const fetchImpl = fetchStub(async () =>
      jsonResponse([
        member("42", {
          avatar: "guild-avatar",
          joined_at: null,
        }),
      ]),
    );
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const [snapshot] = await client.listAllGuildMembers("guild-1");

    expect(snapshot.avatarHash).toBe("guild:guild-avatar");
    expect(snapshot.joinedAt).toBeNull();
  });

  test.each([
    {
      status: 401,
      code: "invalid_bot_token",
      safeMessage: "Discord bot authorization failed",
      retryable: false,
    },
    {
      status: 403,
      code: "members_intent_required",
      safeMessage: "Enable Server Members Intent for RayFox in the Discord Developer Portal",
      retryable: false,
    },
    {
      status: 500,
      code: "discord_unavailable",
      safeMessage: "Discord is temporarily unavailable",
      retryable: true,
    },
  ])("maps Discord $status to a safe failure", async (expected) => {
    const fetchImpl = fetchStub(async () =>
      new Response("raw secret Discord diagnostic", { status: expected.status }),
    );
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listAllGuildMembers("guild-1").catch((value) => value);

    expect(error).toBeInstanceOf(DiscordMemberSyncError);
    expect(error.failure).toEqual({
      code: expected.code,
      safeMessage: expected.safeMessage,
      retryable: expected.retryable,
    });
    expect(JSON.stringify(error)).not.toContain(config.botToken);
    expect(JSON.stringify(error)).not.toContain("raw secret Discord diagnostic");
  });

  test.each([
    { retryAfter: 0, expected: 1 },
    { retryAfter: 2.9, expected: 2 },
    { retryAfter: 999, expected: 300 },
    { retryAfter: "not-a-number", expected: 1 },
  ])("clamps a Discord rate-limit delay to $expected seconds", async ({ retryAfter, expected }) => {
    const fetchImpl = fetchStub(async () =>
      jsonResponse({ retry_after: retryAfter, message: "secret" }, 429),
    );
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listGuildRoles("guild-1").catch((value) => value);

    expect(error.failure).toEqual({
      code: "rate_limited",
      safeMessage: "Discord is rate limiting member synchronization",
      retryable: true,
      retryAfterSeconds: expected,
    });
  });

  test("maps a timeout or network exception without leaking its message", async () => {
    const fetchImpl = fetchStub(async () => {
      throw new Error(`network failed with ${config.botToken}`);
    });
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listGuildRoles("guild-1").catch((value) => value);

    expect(error.failure).toEqual({
      code: "discord_unavailable",
      safeMessage: "Discord is temporarily unavailable",
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain(config.botToken);
  });

  test.each([
    { name: "non-array body", body: { members: [] } },
    { name: "missing user ID", body: [member("42", { user: { username: "no-id" } })] },
    { name: "invalid role list", body: [member("42", { roles: "role-customer" })] },
    { name: "invalid joined timestamp", body: [member("42", { joined_at: "not-a-date" })] },
  ])("rejects a malformed member snapshot: $name", async ({ body }) => {
    const fetchImpl = fetchStub(async () => jsonResponse(body));
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listAllGuildMembers("guild-1").catch((value) => value);

    expect(error.failure).toEqual({
      code: "malformed_snapshot",
      safeMessage: "Discord returned an invalid member snapshot",
      retryable: false,
    });
  });

  test("rejects a full page whose final member ID does not advance", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      member(String(index + 1)),
    );
    const stuckPage = Array.from({ length: 1_000 }, (_, index) =>
      member(index === 999 ? "1000" : String(index + 1_001)),
    );
    const pages = [firstPage, stuckPage];
    const fetchImpl = fetchStub(async () => jsonResponse(pages.shift() ?? []));
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listAllGuildMembers("guild-1").catch((value) => value);

    expect(error.failure.code).toBe("malformed_snapshot");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("rejects malformed role metadata", async () => {
    const fetchImpl = fetchStub(async () => jsonResponse([{ id: "role-1" }]));
    const client = createDiscordGuildSnapshotClient(config, fetchImpl);

    const error = await client.listGuildRoles("guild-1").catch((value) => value);

    expect(error.failure.code).toBe("malformed_snapshot");
  });
});

// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  createDiscordApiStub,
  discordStubFixture,
} from "./discord-api-stub.mjs";

function request(path: string, method = "GET") {
  return new Request(`http://127.0.0.1:3114${path}`, {
    method,
    headers: { authorization: "Bot local-e2e-dummy-token-never-production" },
  });
}

function control(path: string, body: unknown) {
  return new Request(`http://127.0.0.1:3114${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function webhook(token = "private-interaction-token") {
  return new Request(
    `http://127.0.0.1:3114/webhooks/900000000000000099/${token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: [{ title: "lucidgrid.ai", description: "**Available**" }],
      }),
    },
  );
}

describe("Discord REST loopback stub", () => {
  test("records one durable success without retaining credentials", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    const memberPath = `/guilds/${discordStubFixture.guildId}/members/${discordStubFixture.successUserId}`;
    const rolePath = `${memberPath}/roles/${discordStubFixture.roleId}`;

    expect(await (await stub.handle(request(memberPath))).json()).toEqual({ roles: [] });
    expect((await stub.handle(request(rolePath, "PUT"))).status).toBe(204);
    expect(await (await stub.handle(request(memberPath))).json()).toEqual({
      roles: [discordStubFixture.roleId],
    });
    expect(JSON.stringify(stub.calls())).not.toContain("dummy-token");
  });

  test("returns deterministic permission and retry outcomes for test-only members", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    const forbidden = `/guilds/${discordStubFixture.guildId}/members/${discordStubFixture.forbiddenUserId}/roles/${discordStubFixture.roleId}`;
    const retry = `/guilds/${discordStubFixture.guildId}/members/${discordStubFixture.retryUserId}/roles/${discordStubFixture.roleId}`;

    expect((await stub.handle(request(forbidden, "PUT"))).status).toBe(403);
    expect((await stub.handle(request(retry, "PUT"))).status).toBe(429);
    expect((await stub.handle(request(retry, "PUT"))).status).toBe(204);
  });

  test("rejects every guild, member, and role outside the fixed fixture", async () => {
    const stub = createDiscordApiStub(discordStubFixture);

    expect(
      (
        await stub.handle(
          request("/guilds/811111111111111111/members/822222222222222222"),
        )
      ).status,
    ).toBe(404);
  });

  test("offers loopback-only call inspection and reset without exposing auth", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    const memberPath = `/guilds/${discordStubFixture.guildId}/members/${discordStubFixture.successUserId}`;
    await stub.handle(request(memberPath));

    const calls = await stub.handle(
      new Request("http://127.0.0.1:3114/__test/calls"),
    );
    expect(await calls.json()).toMatchObject({ calls: [{ path: memberPath }] });
    const reset = await stub.handle(
      new Request("http://127.0.0.1:3114/__test/reset", { method: "POST" }),
    );
    expect(reset.status).toBe(204);
    expect(stub.calls()).toEqual([]);
  });

  test("serves deterministic roles and paginated member snapshot version 1", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    const roles = await stub.handle(
      request(`/guilds/${discordStubFixture.guildId}/roles`),
    );
    const firstPage = await stub.handle(
      request(`/guilds/${discordStubFixture.guildId}/members?limit=2`),
    );
    const firstMembers = await firstPage.json() as Array<{ user: { id: string } }>;
    const secondPage = await stub.handle(
      request(
        `/guilds/${discordStubFixture.guildId}/members?limit=2&after=${firstMembers[1]!.user.id}`,
      ),
    );

    expect(await roles.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: discordStubFixture.roleId, name: "Verified Customer" }),
      expect.objectContaining({ id: discordStubFixture.adminRoleId, name: "Admin" }),
    ]));
    expect(firstMembers.map((member) => member.user.id)).toEqual([
      discordStubFixture.memberAlphaId,
      discordStubFixture.memberBetaId,
    ]);
    expect((await secondPage.json()) as Array<{ user: { id: string } }>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user: expect.objectContaining({ id: discordStubFixture.botUserId }) }),
      ]),
    );
  });

  test("switches to version 2 with rename, join, role change, and leave", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    expect((await stub.handle(
      control("/__test/member-sync/version", { version: 2 }),
    )).status).toBe(204);

    const response = await stub.handle(
      request(`/guilds/${discordStubFixture.guildId}/members?limit=1000`),
    );
    const members = await response.json() as Array<{
      nick: string | null;
      roles: string[];
      user: { id: string; username: string };
    }>;

    expect(members).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nick: "Alpha Renamed",
        roles: expect.arrayContaining([discordStubFixture.adminRoleId]),
        user: expect.objectContaining({ id: discordStubFixture.memberAlphaId }),
      }),
      expect.objectContaining({
        user: expect.objectContaining({ id: discordStubFixture.memberGammaId }),
      }),
    ]));
    expect(members.some((member) => member.user.id === discordStubFixture.memberBetaId))
      .toBe(false);
  });

  test.each([
    ["unauthorized", 401],
    ["forbidden", 403],
    ["rate-limited", 429],
    ["unavailable", 503],
  ] as const)("serves the safe %s member-sync failure", async (mode, status) => {
    const stub = createDiscordApiStub(discordStubFixture);
    expect((await stub.handle(
      control("/__test/member-sync/mode", { mode }),
    )).status).toBe(204);

    expect((await stub.handle(
      request(`/guilds/${discordStubFixture.guildId}/members?limit=1000`),
    )).status).toBe(status);
  });

  test("requires the exact fixed test bot token", async () => {
    const stub = createDiscordApiStub(discordStubFixture);
    const path = `/guilds/${discordStubFixture.guildId}/roles`;

    expect((await stub.handle(new Request(`http://127.0.0.1:3114${path}`))).status)
      .toBe(401);
    expect((await stub.handle(new Request(`http://127.0.0.1:3114${path}`, {
      headers: { authorization: "Bot wrong-token" },
    }))).status).toBe(401);
  });

  test("records webhook edits without bot authorization or interaction tokens", async () => {
    const stub = createDiscordApiStub(discordStubFixture);

    expect((await stub.handle(webhook())).status).toBe(200);
    expect(stub.webhookEdits()).toEqual([
      {
        interactionAlias: "interaction-1",
        applicationId: "900000000000000099",
        message: {
          embeds: [{
            title: "lucidgrid.ai",
            description: "**Available**",
          }],
        },
        status: 200,
      },
    ]);
    expect(JSON.stringify(stub.calls())).not.toContain(
      "private-interaction-token",
    );
    expect(JSON.stringify(stub.webhookEdits())).not.toContain(
      "private-interaction-token",
    );
  });

  test.each([
    ["rate-limited", 429],
    ["unavailable", 503],
  ] as const)("serves the controlled %s webhook failure", async (mode, status) => {
    const stub = createDiscordApiStub(discordStubFixture);
    expect((await stub.handle(
      control("/__test/webhook-mode", { mode }),
    )).status).toBe(204);

    expect((await stub.handle(webhook())).status).toBe(status);
    expect(stub.webhookEdits()).toEqual([
      expect.objectContaining({
        interactionAlias: "interaction-1",
        status,
      }),
    ]);
  });
});

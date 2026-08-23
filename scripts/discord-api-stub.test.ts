// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  createDiscordApiStub,
  discordStubFixture,
} from "./discord-api-stub.mjs";

function request(path: string, method = "GET") {
  return new Request(`http://127.0.0.1:3114${path}`, {
    method,
    headers: { authorization: "Bot local-e2e-dummy-token" },
  });
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
});

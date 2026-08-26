import nacl from "tweetnacl";
import { describe, expect, test, vi } from "vitest";

import { createDiscordInteractionsPost } from "./route";

const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(13));
const publicKey = Buffer.from(keyPair.publicKey).toString("hex");
const configured = {
  configured: true as const,
  publicKey,
};

function signedRequest(body: string) {
  const timestamp = "1787500000";
  const signature = Buffer.from(
    nacl.sign.detached(
      Uint8Array.from(Buffer.from(timestamp + body)),
      keyPair.secretKey,
    ),
  ).toString("hex");
  return new Request("http://localhost/api/discord/interactions", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
  });
}

describe("Discord interactions route", () => {
  test("rejects an unsigned request before parsing or business handling", async () => {
    const handle = vi.fn();
    const schedule = vi.fn();
    const post = createDiscordInteractionsPost({
      getConfig: () => configured,
      handle,
      schedule,
    });

    const response = await post(
      new Request("http://localhost/api/discord/interactions", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  test("returns 400 for signed malformed JSON without echoing input", async () => {
    const handle = vi.fn();
    const schedule = vi.fn();
    const post = createDiscordInteractionsPost({
      getConfig: () => configured,
      handle,
      schedule,
    });

    const response = await post(signedRequest("secret-not-json"));

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("secret-not-json");
    expect(handle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  test("passes a verified interaction to the handler", async () => {
    const interaction = { id: "123456789012345678", type: 1 };
    const handle = vi.fn().mockResolvedValue({ response: { type: 1 } });
    const schedule = vi.fn();
    const post = createDiscordInteractionsPost({
      getConfig: () => configured,
      handle,
      schedule,
    });

    const response = await post(signedRequest(JSON.stringify(interaction)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 1 });
    expect(handle).toHaveBeenCalledWith(interaction, configured);
    expect(schedule).not.toHaveBeenCalled();
  });

  test("schedules deferred work after returning the Discord response", async () => {
    const background = vi.fn().mockResolvedValue(undefined);
    const handle = vi.fn().mockResolvedValue({
      response: { type: 5, data: { flags: 64 } },
      background,
    });
    const schedule = vi.fn();
    const post = createDiscordInteractionsPost({
      getConfig: () => configured,
      handle,
      schedule,
    });

    const interaction = { id: "123456789012345678", type: 2 };
    const response = await post(signedRequest(JSON.stringify(interaction)));

    await expect(response.json()).resolves.toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(schedule).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledWith(background);
    expect(background).not.toHaveBeenCalled();
  });

  test("returns a safe unavailable response when runtime config is missing", async () => {
    const handle = vi.fn();
    const schedule = vi.fn();
    const post = createDiscordInteractionsPost({
      getConfig: () => ({ configured: false as const, reason: "secret detail" }),
      handle,
      schedule,
    });

    const response = await post(
      new Request("http://localhost/api/discord/interactions", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret detail");
    expect(handle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});

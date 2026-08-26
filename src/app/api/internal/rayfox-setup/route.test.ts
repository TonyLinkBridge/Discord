import { describe, expect, test, vi } from "vitest";

import {
  createRayfoxSetupPost,
  getRayfoxSetupConfig,
  runRayfoxSetup,
  updateDiscordInteractionEndpoint,
} from "./route";

const previewHost = "discord-preview-juyu.vercel.app";
const bypassSecret = "b".repeat(32);
const setupSecret = "s".repeat(32);
const setupUrl =
  `https://${previewHost}/api/internal/rayfox-setup` +
  `?x-vercel-protection-bypass=${bypassSecret}`;

function request(authorization = `Bearer ${setupSecret}`): Request {
  return new Request(setupUrl, {
    method: "POST",
    headers: { authorization },
  });
}

describe("RayFox preview setup route", () => {
  test("uses the stable Vercel branch URL for the Discord callback", () => {
    expect(getRayfoxSetupConfig({
      VERCEL_ENV: "preview",
      VERCEL_URL: "discord-deployment-juyu.vercel.app",
      VERCEL_BRANCH_URL: "discord-git-domain-preview-juyu.vercel.app",
      RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
      RAYFOX_DOMAIN_TEST_DATA: "enabled",
      RAYFOX_SETUP_KEY: setupSecret,
    })).toEqual({
      configured: true,
      setupSecret,
      previewHost: "discord-git-domain-preview-juyu.vercel.app",
    });
  });

  test("fails closed outside an internal Vercel Preview", async () => {
    const run = vi.fn();
    const post = createRayfoxSetupPost({
      getConfig: () => ({ configured: false, reason: "not preview" }),
      run,
    });

    const response = await post(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "RayFox setup is unavailable",
    });
    expect(run).not.toHaveBeenCalled();
  });

  test.each([undefined, "Bearer wrong", setupSecret])(
    "rejects an unauthorized setup header %s",
    async (authorization) => {
      const run = vi.fn();
      const post = createRayfoxSetupPost({
        getConfig: () => ({
          configured: true,
          setupSecret,
          previewHost,
        }),
        run,
      });

      const response = await post(
        new Request(setupUrl, {
          method: "POST",
          headers: authorization ? { authorization } : undefined,
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(run).not.toHaveBeenCalled();
    },
  );

  test.each([
    `https://${previewHost}/api/internal/rayfox-setup`,
    `https://${previewHost}/api/internal/rayfox-setup?x-vercel-protection-bypass=short`,
  ])("rejects a missing or malformed Vercel bypass secret", async (url) => {
    const run = vi.fn();
    const post = createRayfoxSetupPost({
      getConfig: () => ({ configured: true, setupSecret, previewHost }),
      run,
    });

    const response = await post(
      new Request(url, {
        method: "POST",
        headers: { authorization: `Bearer ${setupSecret}` },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid setup request",
    });
    expect(run).not.toHaveBeenCalled();
  });

  test("derives the Discord callback from the trusted Preview host", async () => {
    const run = vi.fn().mockResolvedValue({
      migrations: "applied",
      commands: ["verify", "domain"],
      interactionEndpointHost: previewHost,
    });
    const post = createRayfoxSetupPost({
      getConfig: () => ({ configured: true, setupSecret, previewHost }),
      run,
    });

    const response = await post(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      migrations: "applied",
      commands: ["verify", "domain"],
      interactionEndpointHost: previewHost,
    });
    expect(run).toHaveBeenCalledWith({
      interactionEndpointUrl:
        `https://${previewHost}/api/discord/interactions` +
        `?x-vercel-protection-bypass=${bypassSecret}`,
    });
  });

  test("does not expose setup failures or credentials", async () => {
    const post = createRayfoxSetupPost({
      getConfig: () => ({ configured: true, setupSecret, previewHost }),
      run: vi.fn().mockRejectedValue(new Error(`Bot ${setupSecret}`)),
    });

    const response = await post(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "RayFox setup failed" });
    expect(JSON.stringify(body)).not.toContain(setupSecret);
  });
});

describe("RayFox setup workflow", () => {
  test("migrates before registering commands and updating the endpoint", async () => {
    const order: string[] = [];
    const result = await runRayfoxSetup(
      {
        interactionEndpointUrl:
          `https://${previewHost}/api/discord/interactions` +
          `?x-vercel-protection-bypass=${bypassSecret}`,
      },
      {
        migrate: vi.fn(async () => {
          order.push("migrate");
        }),
        registerCommands: vi.fn(async () => {
          order.push("register");
          return { registered: ["verify", "domain"] };
        }),
        updateInteractionEndpoint: vi.fn(async () => {
          order.push("endpoint");
        }),
      },
    );

    expect(order).toEqual(["migrate", "register", "endpoint"]);
    expect(result).toEqual({
      migrations: "applied",
      commands: ["verify", "domain"],
      interactionEndpointHost: previewHost,
    });
  });

  test("updates only the Discord interaction endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "1540610000000000000" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const interactionEndpointUrl =
      `https://${previewHost}/api/discord/interactions` +
      `?x-vercel-protection-bypass=${bypassSecret}`;

    await updateDiscordInteractionEndpoint(
      {
        apiBaseUrl: "https://discord.com/api/v10",
        botToken: "test-bot-token",
        interactionEndpointUrl,
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://discord.com/api/v10/applications/@me",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Authorization: "Bot test-bot-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          interactions_endpoint_url: interactionEndpointUrl,
        }),
      }),
    );
  });
});

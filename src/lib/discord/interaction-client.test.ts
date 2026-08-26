// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { DiscordWebhookMessage } from "./domain-message";
import { createDiscordInteractionClient } from "./interaction-client";

const applicationId = "1541013436098682942";
const interactionToken = "private-interaction-token-never-log-this";
const message: DiscordWebhookMessage = {
  embeds: [{ title: "lucidgrid.ai", description: "**Available**" }],
};

describe("Discord original-response client", () => {
  test("edits the original interaction response without bot authorization", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createDiscordInteractionClient(
      { apiBaseUrl: "https://discord.com/api/v10" },
      fetchImpl,
    );

    await expect(client.editOriginal({ applicationId, interactionToken, message }))
      .resolves.toEqual({ status: "edited" });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: "PATCH",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        signal: expect.any(AbortSignal),
      },
    );
    const headers = vi.mocked(fetchImpl).mock.calls[0][1]?.headers;
    expect(JSON.stringify(headers)).not.toContain("Authorization");
  });

  test.each([
    [401, "invalid_interaction", false],
    [404, "invalid_interaction", false],
    [429, "rate_limited", true],
    [500, "discord_unavailable", true],
  ])("maps HTTP %s to a safe failure", async (status, code, retryable) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("secret Discord response body", { status }),
    );
    const client = createDiscordInteractionClient(
      { apiBaseUrl: "https://discord.com/api/v10" },
      fetchImpl,
    );

    const result = await client.editOriginal({ applicationId, interactionToken, message });
    expect(result).toMatchObject({ status: "failed", code, retryable });
    expect(JSON.stringify(result)).not.toContain(interactionToken);
    expect(JSON.stringify(result)).not.toContain("secret Discord response body");
    expect(JSON.stringify(result)).not.toContain("lucidgrid.ai");
  });

  test("maps an abort timeout without exposing the interaction token", async () => {
    const error = new DOMException("request included private token", "TimeoutError");
    const client = createDiscordInteractionClient(
      { apiBaseUrl: "https://discord.com/api/v10" },
      vi.fn().mockRejectedValue(error),
    );

    const result = await client.editOriginal({ applicationId, interactionToken, message });
    expect(result).toEqual({
      status: "failed",
      code: "timeout",
      safeMessage: "Discord response update timed out",
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain(interactionToken);
  });
});

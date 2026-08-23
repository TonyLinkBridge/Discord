import { describe, expect, test, vi } from "vitest";

import { handleDiscordInteraction } from "./interactions";

const user = {
  id: "223456789012345678",
  username: "ray.user",
  global_name: "Ray User",
};

function createDependencies(
  state: "none" | "pending" | "processing" | "role_failed" | "verified" = "none",
) {
  return {
    guildId: "1540610722281824336",
    claimInteraction: vi.fn().mockResolvedValue("claimed"),
    getMemberVerificationState: vi.fn().mockResolvedValue({ status: state }),
    submit: vi.fn().mockResolvedValue({
      status: "created",
      requestId: "72345678-1234-4234-8234-123456789012",
      requestStatus: "pending",
    }),
  };
}

describe("handleDiscordInteraction", () => {
  test("returns Discord PONG without touching business state", async () => {
    const dependencies = createDependencies();

    await expect(
      handleDiscordInteraction({ id: "1", type: 1 }, dependencies),
    ).resolves.toEqual({ type: 1 });
    expect(dependencies.claimInteraction).not.toHaveBeenCalled();
  });

  test("opens the verification modal for a member with no current request", async () => {
    const response = await handleDiscordInteraction(
      {
        id: "123456789012345678",
        type: 2,
        guild_id: "1540610722281824336",
        member: { user },
        data: { name: "verify" },
      },
      createDependencies(),
    );

    expect(response).toMatchObject({
      type: 9,
      data: {
        custom_id: "rayname_verify:v1",
        title: "Verify your RayName account",
      },
    });
    if (response.type !== 9) throw new Error("Expected verification modal");
    expect(response.data.components).toEqual([
      {
        type: 1,
        components: [
          expect.objectContaining({
            type: 4,
            custom_id: "rayname_email",
            required: true,
            max_length: 254,
          }),
        ],
      },
      {
        type: 1,
        components: [
          expect.objectContaining({
            type: 4,
            custom_id: "rayname_domain",
            required: false,
            max_length: 253,
          }),
        ],
      },
    ]);
  });

  test.each(["pending", "processing", "role_failed", "verified"] as const)(
    "returns a private honest status instead of another modal for %s",
    async (state) => {
      const response = await handleDiscordInteraction(
        {
          id: "123456789012345678",
          type: 2,
          guild_id: "1540610722281824336",
          member: { user },
          data: { name: "verify" },
        },
        createDependencies(state),
      );

      expect(response).toMatchObject({ type: 4, data: { flags: 64 } });
      expect(response.type).not.toBe(9);
    },
  );

  test("submits normalized modal fields and reports only pending review", async () => {
    const dependencies = createDependencies();
    const response = await handleDiscordInteraction(
      {
        id: "123456789012345679",
        type: 5,
        guild_id: "1540610722281824336",
        member: { user },
        data: {
          custom_id: "rayname_verify:v1",
          components: [
            {
              components: [
                { custom_id: "rayname_email", value: " USER@Example.COM " },
              ],
            },
            {
              components: [
                { custom_id: "rayname_domain", value: " Example.COM. " },
              ],
            },
          ],
        },
      },
      dependencies,
    );

    expect(dependencies.submit).toHaveBeenCalledWith({
      discordUserId: user.id,
      guildId: "1540610722281824336",
      displayName: "Ray User",
      discordHandle: "ray.user",
      email: "user@example.com",
      domain: "example.com",
    });
    expect(response).toEqual({
      type: 4,
      data: {
        flags: 64,
        content: "Your verification request is pending admin review.",
      },
    });
  });

  test("handles a duplicate delivery without repeating submission", async () => {
    const dependencies = createDependencies();
    dependencies.claimInteraction.mockResolvedValue("duplicate");

    const response = await handleDiscordInteraction(
      {
        id: "123456789012345679",
        type: 5,
        guild_id: "1540610722281824336",
        member: { user },
        data: { custom_id: "rayname_verify:v1", components: [] },
      },
      dependencies,
    );

    expect(response).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(dependencies.submit).not.toHaveBeenCalled();
  });

  test.each([
    { guild_id: "999999999999999999", data: { name: "verify" } },
    { guild_id: "1540610722281824336", data: { name: "unknown" } },
  ])("rejects unsupported command context privately %#", async (override) => {
    const response = await handleDiscordInteraction(
      {
        id: "123456789012345678",
        type: 2,
        member: { user },
        ...override,
      },
      createDependencies(),
    );

    expect(response).toMatchObject({ type: 4, data: { flags: 64 } });
  });
});

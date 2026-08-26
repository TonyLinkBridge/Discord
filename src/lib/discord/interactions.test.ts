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
    applicationId: "1541013436098682942",
    claimInteraction: vi.fn().mockResolvedValue("claimed"),
    getMemberVerificationState: vi.fn().mockResolvedValue({ status: state }),
    submit: vi.fn().mockResolvedValue({
      status: "created",
      requestId: "72345678-1234-4234-8234-123456789012",
      requestStatus: "pending",
    }),
    domainService: {
      search: vi.fn().mockResolvedValue({
        status: "success",
        requestId: "72345678-1234-4234-8234-123456789012",
        result: {
          domain: {
            ascii: "lucidgrid.ai",
            unicode: "lucidgrid.ai",
            label: "lucidgrid",
            tld: "ai",
          },
          commercial: {
            availability: "available",
            premium: false,
            premiumRenewal: null,
            registrationPrice: { amount: "79.00", currency: "USD" },
            renewalPrice: { amount: "89.00", currency: "USD" },
            transferPrice: { amount: "74.00", currency: "USD" },
            transferEligible: null,
            destination: "https://www.rayname.com/domain/search?domain=lucidgrid.ai",
            checkedAt: "2026-08-26T00:00:00.000Z",
          },
          registration: null,
          dns: null,
          certificate: null,
          checkedAt: "2026-08-26T00:00:00.000Z",
        },
        replayed: false,
        used: 1,
        limit: 3,
        presentation: "live-commerce",
      }),
      compare: vi.fn().mockResolvedValue({
        status: "success",
        requestId: "72345678-1234-4234-8234-123456789012",
        sort: "registration",
        page: 1,
        pageCount: 1,
        rows: [],
        presentation: "live-commerce",
      }),
      overview: vi.fn().mockResolvedValue({
        status: "success",
        requestId: "72345678-1234-4234-8234-123456789012",
        result: {
          domain: {
            ascii: "lucidgrid.ai",
            unicode: "lucidgrid.ai",
            label: "lucidgrid",
            tld: "ai",
          },
          commercial: {
            availability: "available",
            premium: false,
            premiumRenewal: null,
            registrationPrice: { amount: "79.00", currency: "USD" },
            renewalPrice: { amount: "89.00", currency: "USD" },
            transferPrice: { amount: "74.00", currency: "USD" },
            transferEligible: null,
            destination: "https://www.rayname.com/domain/search?domain=lucidgrid.ai",
            checkedAt: "2026-08-26T00:00:00.000Z",
          },
          registration: null,
          dns: null,
          certificate: null,
          checkedAt: "2026-08-26T00:00:00.000Z",
        },
        replayed: false,
        restored: true,
        used: 1,
        limit: 3,
        presentation: "live-commerce",
      }),
    },
    interactionClient: {
      editOriginal: vi.fn().mockResolvedValue({ status: "edited" }),
      sendPrivateFollowup: vi.fn().mockResolvedValue({ status: "sent" }),
    },
    buildLinks: vi.fn().mockReturnValue({
      primary: "https://rayname.local/outbound/register",
      fullIntelligence: null,
    }),
  };
}

describe("handleDiscordInteraction", () => {
  test("returns Discord PONG without touching business state", async () => {
    const dependencies = createDependencies();

    await expect(
      handleDiscordInteraction({ id: "1", type: 1 }, dependencies),
    ).resolves.toEqual({ response: { type: 1 } });
    expect(dependencies.claimInteraction).not.toHaveBeenCalled();
  });

  test("opens the verification modal for a member with no current request", async () => {
    const { response } = await handleDiscordInteraction(
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
      const { response } = await handleDiscordInteraction(
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
    const { response } = await handleDiscordInteraction(
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

    const { response } = await handleDiscordInteraction(
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
    const { response } = await handleDiscordInteraction(
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

  test("defers a valid domain command privately and edits the original response", async () => {
    const dependencies = createDependencies();
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345680",
        application_id: dependencies.applicationId,
        token: "private-interaction-token",
        type: 2,
        guild_id: dependencies.guildId,
        member: { user, roles: ["1541478390924837005", "1540611679023276114"] },
        data: {
          name: "domain",
          options: [{ type: 3, name: "domain", value: " LucidGrid.AI. " }],
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({ type: 5, data: { flags: 64 } });
    expect(dispatch.background).toEqual(expect.any(Function));
    await dispatch.background?.();
    expect(dependencies.domainService.search).toHaveBeenCalledWith({
      interactionId: "123456789012345680",
      guildId: dependencies.guildId,
      discordUserId: user.id,
      roleIds: ["1541478390924837005", "1540611679023276114"],
      rawDomain: "lucidgrid.ai",
    });
    expect(dependencies.interactionClient.editOriginal).toHaveBeenCalledWith({
      applicationId: dependencies.applicationId,
      interactionToken: "private-interaction-token",
      message: expect.objectContaining({
        embeds: [expect.objectContaining({ title: "lucidgrid.ai" })],
      }),
    });
  });

  test.each([
    { options: [] },
    { options: [{ type: 3, name: "domain", value: "https://example.com" }] },
    { options: [{ type: 3, name: "different", value: "example.com" }] },
  ])("rejects a malformed domain option privately without background work %#", async (data) => {
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345681",
        application_id: "1541013436098682942",
        token: "private-interaction-token",
        type: 2,
        guild_id: "1540610722281824336",
        member: { user, roles: [] },
        data: { name: "domain", ...data },
      },
      createDependencies(),
    );

    expect(dispatch.response).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(dispatch.background).toBeUndefined();
  });

  test("defers an owned comparison and updates the same private message", async () => {
    const dependencies = createDependencies();
    const requestId = "72345678-1234-4234-8234-123456789012";
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345682",
        application_id: dependencies.applicationId,
        token: "component-interaction-token",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          custom_id: `rayfox_domain:compare:${requestId}:${user.id}:renewal:2`,
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({ type: 6 });
    await dispatch.background?.();
    expect(dependencies.domainService.compare).toHaveBeenCalledWith({
      requestId,
      discordUserId: user.id,
      roleIds: [],
      sort: "renewal",
      page: 2,
    });
    expect(dependencies.interactionClient.editOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ interactionToken: "component-interaction-token" }),
    );
  });

  test("denies another member's component without calling domain providers", async () => {
    const dependencies = createDependencies();
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345683",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          custom_id:
            "rayfox_domain:compare:72345678-1234-4234-8234-123456789012:" +
            "999999999999999999:registration:1",
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({
      type: 4,
      data: {
        flags: 64,
        content: "That control belongs to another member.",
      },
    });
    expect(dependencies.domainService.compare).not.toHaveBeenCalled();
  });

  test("restores the owner's stored overview without another search", async () => {
    const dependencies = createDependencies();
    const requestId = "72345678-1234-4234-8234-123456789012";
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345686",
        token: "component-token",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: ["1541478390924837005"] },
        data: {
          custom_id: `rayfox_domain:overview:${requestId}:${user.id}`,
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({ type: 6 });
    await dispatch.background?.();
    expect(dependencies.domainService.overview).toHaveBeenCalledWith({
      requestId,
      discordUserId: user.id,
      roleIds: ["1541478390924837005"],
    });
    expect(dependencies.domainService.search).not.toHaveBeenCalled();
    expect(dependencies.interactionClient.editOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionToken: "component-token",
        message: expect.objectContaining({
          embeds: [expect.objectContaining({ title: "lucidgrid.ai" })],
        }),
      }),
    );
  });

  test("keeps the comparison card when a member requests fixture prices", async () => {
    const dependencies = createDependencies();
    dependencies.domainService.compare.mockResolvedValue({
      status: "forbidden",
      safeMessage: "Test pricing is available only to RayFox internal testers",
    });
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345687",
        token: "component-token",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          custom_id:
            `rayfox_domain:compare:72345678-1234-4234-8234-123456789012:${user.id}:registration:1`,
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({ type: 6 });
    await dispatch.background?.();
    expect(dependencies.interactionClient.sendPrivateFollowup).toHaveBeenCalledWith({
      applicationId: dependencies.applicationId,
      interactionToken: "component-token",
      content: "Test pricing is available only to RayFox internal testers",
    });
    expect(dependencies.interactionClient.editOriginal).not.toHaveBeenCalled();
  });

  test("keeps the comparison card when its overview has expired", async () => {
    const dependencies = createDependencies();
    dependencies.domainService.overview.mockResolvedValue({
      status: "not-owned",
      safeMessage: "This result belongs to another member or has expired",
    });
    const requestId = "72345678-1234-4234-8234-123456789012";
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345688",
        token: "component-token",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          custom_id: `rayfox_domain:overview:${requestId}:${user.id}`,
        },
      },
      dependencies,
    );

    expect(dispatch.response).toEqual({ type: 6 });
    await dispatch.background?.();
    expect(dependencies.interactionClient.sendPrivateFollowup).toHaveBeenCalledWith({
      applicationId: dependencies.applicationId,
      interactionToken: "component-token",
      content: "This result belongs to another member or has expired",
    });
    expect(dependencies.interactionClient.editOriginal).not.toHaveBeenCalled();
  });

  test("opens the existing verification modal from an owned exhausted card", async () => {
    const dependencies = createDependencies();
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345684",
        type: 3,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          custom_id:
            `rayfox_domain:verify:72345678-1234-4234-8234-123456789012:${user.id}`,
        },
      },
      dependencies,
    );

    expect(dispatch.response).toMatchObject({
      type: 9,
      data: { custom_id: "rayname_verify:v1" },
    });
  });

  test("converts a background exception into a best-effort safe edit", async () => {
    const dependencies = createDependencies();
    dependencies.domainService.search.mockRejectedValue(new Error("secret provider failure"));
    const dispatch = await handleDiscordInteraction(
      {
        id: "123456789012345685",
        application_id: dependencies.applicationId,
        token: "private-interaction-token",
        type: 2,
        guild_id: dependencies.guildId,
        member: { user, roles: [] },
        data: {
          name: "domain",
          options: [{ type: 3, name: "domain", value: "example.com" }],
        },
      },
      dependencies,
    );

    await expect(dispatch.background?.()).resolves.toBeUndefined();
    const edit = dependencies.interactionClient.editOriginal.mock.calls[0][0];
    expect(JSON.stringify(edit.message)).toContain(
      "RayName pricing is temporarily unavailable",
    );
    expect(JSON.stringify(edit.message)).not.toContain("secret provider failure");
  });
});

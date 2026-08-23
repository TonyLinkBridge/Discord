import { describe, expect, test } from "vitest";
import {
  adminCapabilities,
  createVerificationAvailability,
  createUnavailableAvailability,
  resolveRuntimeDataMode,
} from "./availability";

describe("createUnavailableAvailability", () => {
  test("fails every business capability closed with a reason", () => {
    const availability = createUnavailableAvailability({
      discordOAuthConfigured: true,
      rayNameApiConfigured: false,
    });

    expect(availability.dataMode).toBe("unavailable");
    expect(Object.keys(availability.capabilities)).toEqual(adminCapabilities);
    for (const capability of adminCapabilities) {
      expect(availability.capabilities[capability]).toEqual({
        available: false,
        reason: expect.any(String),
      });
    }
    expect(availability.integrations.discordOAuth.status).toBe("connected");
    expect(availability.integrations.discordBot.status).toBe("not-connected");
    expect(availability.integrations.database.status).toBe("not-connected");
    expect(availability.integrations.rayNameMarketingApi.status).toBe("awaiting-access");
    expect(availability.integrations.deploymentMonitoring.status).toBe("unknown");
  });

  test.each([undefined, "", "local", "demo", "live", "unexpected"])(
    "fails requested mode %s closed while no live provider exists",
    (requestedMode) => {
      expect(resolveRuntimeDataMode(requestedMode)).toBe("unavailable");
    },
  );
});

describe("createVerificationAvailability", () => {
  test("enables only the live verification queue when Discord and Neon are ready", () => {
    const availability = createVerificationAvailability({
      discordOAuthConfigured: true,
      rayNameApiConfigured: false,
      discordBotConfigured: true,
      databaseStatus: "connected",
    });

    expect(availability.dataMode).toBe("partial-live");
    expect(availability.capabilities["review-verifications"]).toEqual({
      available: true,
      reason: null,
    });
    expect(availability.capabilities["read-members"].available).toBe(false);
    expect(availability.integrations.discordBot.status).toBe("connected");
    expect(availability.integrations.database.status).toBe("connected");
    expect(availability.integrations.rayNameMarketingApi.status).toBe(
      "awaiting-access",
    );
  });

  test("reports a failed database ping as degraded without enabling review", () => {
    const availability = createVerificationAvailability({
      discordOAuthConfigured: true,
      rayNameApiConfigured: false,
      discordBotConfigured: true,
      databaseStatus: "degraded",
    });

    expect(availability.dataMode).toBe("unavailable");
    expect(availability.integrations.database.status).toBe("degraded");
    expect(availability.capabilities["review-verifications"].available).toBe(
      false,
    );
  });
});

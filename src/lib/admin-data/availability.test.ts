import { describe, expect, test } from "vitest";
import {
  adminCapabilities,
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

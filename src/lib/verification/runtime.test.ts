import { describe, expect, test, vi } from "vitest";

import { resolveVerificationRuntimeAvailability } from "./runtime";

const base = {
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
};
const configuredEnv = {
  DATABASE_URL: "postgresql://rayname:secret@example.neon.tech/neondb",
  DISCORD_APPLICATION_ID: "1541013436098682942",
  DISCORD_PUBLIC_KEY: "ab".repeat(32),
  DISCORD_GUILD_ID: "1540610722281824336",
  DISCORD_VERIFIED_ROLE_ID: "1540611679023276114",
  DISCORD_BOT_TOKEN: "discord-bot-token-value-for-tests",
  VERIFICATION_DATA_KEY: Buffer.alloc(32, 4).toString("base64"),
};

describe("verification runtime availability", () => {
  test("stays unavailable and skips database access when config is missing", async () => {
    const ping = vi.fn();

    const availability = await resolveVerificationRuntimeAvailability(
      {},
      base,
      { ping },
    );

    expect(availability.dataMode).toBe("unavailable");
    expect(availability.integrations.discordBot.status).toBe("not-connected");
    expect(availability.integrations.database.status).toBe("not-connected");
    expect(ping).not.toHaveBeenCalled();
  });

  test("enables verification only after a real database ping", async () => {
    const ping = vi.fn().mockResolvedValue(undefined);

    const availability = await resolveVerificationRuntimeAvailability(
      configuredEnv,
      base,
      { ping },
    );

    expect(availability.dataMode).toBe("partial-live");
    expect(availability.capabilities["review-verifications"].available).toBe(true);
    expect(ping).toHaveBeenCalledWith(configuredEnv.DATABASE_URL);
  });

  test("reports degraded and keeps review disabled after ping failure", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("database unavailable"));

    const availability = await resolveVerificationRuntimeAvailability(
      configuredEnv,
      base,
      { ping },
    );

    expect(availability.dataMode).toBe("unavailable");
    expect(availability.integrations.database.status).toBe("degraded");
    expect(availability.capabilities["review-verifications"].available).toBe(false);
  });
});

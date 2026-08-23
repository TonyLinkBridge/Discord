import { describe, expect, test } from "vitest";

import { getDiscordRuntimeConfig } from "./config";

const validEnv = {
  DATABASE_URL: "postgresql://rayname:secret@example.neon.tech/neondb",
  DISCORD_APPLICATION_ID: "1541013436098682942",
  DISCORD_PUBLIC_KEY: "ab".repeat(32),
  DISCORD_GUILD_ID: "1540610722281824336",
  DISCORD_VERIFIED_ROLE_ID: "1540611679023276114",
  DISCORD_BOT_TOKEN: "discord-bot-token-value-for-tests",
  VERIFICATION_DATA_KEY: Buffer.alloc(32, 4).toString("base64"),
};

describe("getDiscordRuntimeConfig", () => {
  test("fails closed until every verification dependency exists", () => {
    for (const key of Object.keys(validEnv)) {
      expect(
        getDiscordRuntimeConfig({ ...validEnv, [key]: undefined }),
      ).toMatchObject({ configured: false });
    }
  });

  test("returns safe integration details without serializing secrets", () => {
    const result = getDiscordRuntimeConfig(validEnv);

    expect(result).toMatchObject({
      configured: true,
      safe: {
        applicationId: "1541013436098682942",
        guildId: "1540610722281824336",
        roleId: "1540611679023276114",
        databaseHost: "example.neon.tech",
      },
    });
    expect(JSON.stringify(result)).not.toContain("discord-bot-token");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain(validEnv.VERIFICATION_DATA_KEY);
  });

  test.each([
    { DISCORD_PUBLIC_KEY: "not-hex" },
    { DISCORD_GUILD_ID: "guild" },
    { DISCORD_VERIFIED_ROLE_ID: "role" },
    { VERIFICATION_DATA_KEY: Buffer.alloc(31, 4).toString("base64") },
    { DATABASE_URL: "https://example.com" },
  ])("rejects invalid verification configuration %#", (override) => {
    expect(getDiscordRuntimeConfig({ ...validEnv, ...override })).toMatchObject({
      configured: false,
    });
  });
});

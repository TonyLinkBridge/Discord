import { describe, expect, test } from "vitest";

import { getDomainIntelligenceConfig } from "./config";

const validEnv = {
  NODE_ENV: "production",
  RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
  RAYFOX_DOMAIN_BETA_ROLE_IDS: "1540611679023276114,1540611679023276115",
  RAYNAME_COMMERCE_API_BASE_URL: "https://api.rayname.com",
  RAYNAME_COMMERCE_API_TOKEN: "test-token-at-least-20-characters",
  RAYNAME_DOMAIN_PAGE_BASE_URL: "https://www.rayname.com/domain/search",
  RAYFOX_PUBLIC_BASE_URL: "https://bot.rayname.com",
  RAYFOX_LINK_SIGNING_KEY: Buffer.alloc(32, 9).toString("base64"),
};

describe("getDomainIntelligenceConfig", () => {
  test("parses fixture tester roles and admin users without serializing user IDs", () => {
    const result = getDomainIntelligenceConfig({
      ...validEnv,
      RAYFOX_DOMAIN_TESTER_ROLE_IDS:
        "1541478390924837005,1541478390924837006,1541478390924837005",
      ADMIN_DISCORD_USER_IDS: "223456789012345678",
    });

    expect(result).toMatchObject({
      configured: true,
      safe: { testerRoleCount: 2, testerUserCount: 1 },
    });
    if (!result.configured) throw new Error("Expected configured domain runtime");
    expect(result.testerRoleIds).toEqual([
      "1541478390924837005",
      "1541478390924837006",
    ]);
    expect(result.testerUserIds).toEqual(["223456789012345678"]);
    expect(JSON.stringify(result)).not.toContain("223456789012345678");
  });

  test.each([
    { RAYFOX_DOMAIN_TESTER_ROLE_IDS: "not-a-role" },
    { ADMIN_DISCORD_USER_IDS: "223456789012345678,broken" },
  ])("fails closed for malformed tester identity configuration %#", (override) => {
    expect(getDomainIntelligenceConfig({ ...validEnv, ...override }))
      .toMatchObject({ configured: false, mode: "disabled" });
  });

  test("returns safe integration details without serializing secrets", () => {
    const result = getDomainIntelligenceConfig(validEnv);

    expect(result).toMatchObject({
      configured: true,
      mode: "internal",
      betaRoleIds: ["1540611679023276114", "1540611679023276115"],
      safe: {
        mode: "internal",
        commerceHost: "api.rayname.com",
        domainPageHost: "www.rayname.com",
        publicHost: "bot.rayname.com",
        testerRoleCount: 0,
        testerUserCount: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain("test-token");
    expect(JSON.stringify(result)).not.toContain(validEnv.RAYFOX_LINK_SIGNING_KEY);
  });

  test("keeps the feature disabled without requiring provider secrets", () => {
    expect(
      getDomainIntelligenceConfig({
        RAYFOX_DOMAIN_INTELLIGENCE_MODE: "disabled",
      }),
    ).toEqual({
      configured: false,
      mode: "disabled",
      reason: "RayFox domain intelligence is disabled",
    });
  });

  test("requires at least one beta role in internal mode", () => {
    expect(
      getDomainIntelligenceConfig({
        ...validEnv,
        RAYFOX_DOMAIN_BETA_ROLE_IDS: "",
      }),
    ).toMatchObject({ configured: false, mode: "disabled" });
  });

  test.each([
    { RAYFOX_DOMAIN_INTELLIGENCE_MODE: "preview" },
    { RAYNAME_COMMERCE_API_BASE_URL: "http://api.rayname.com" },
    { RAYNAME_COMMERCE_API_BASE_URL: "https://example.com" },
    { RAYNAME_COMMERCE_API_BASE_URL: "https://api.rayname.com/v1" },
    { RAYNAME_DOMAIN_PAGE_BASE_URL: "https://example.com/domain/search" },
    { RAYNAME_DOMAIN_PAGE_BASE_URL: "http://www.rayname.com/domain/search" },
    { RAYFOX_PUBLIC_BASE_URL: "https://example.com" },
    { RAYFOX_PUBLIC_BASE_URL: "https://bot.rayname.com/path" },
    { RAYNAME_COMMERCE_API_TOKEN: "short" },
    { RAYFOX_LINK_SIGNING_KEY: Buffer.alloc(31, 9).toString("base64") },
  ])("fails closed for invalid production configuration %#", (override) => {
    expect(getDomainIntelligenceConfig({ ...validEnv, ...override })).toMatchObject({
      configured: false,
      mode: "disabled",
    });
  });

  test("accepts an HTTP loopback commerce stub only outside production", () => {
    const result = getDomainIntelligenceConfig({
      ...validEnv,
      NODE_ENV: "development",
      RAYNAME_COMMERCE_API_BASE_URL: "http://127.0.0.1:3115",
      RAYFOX_PUBLIC_BASE_URL: "http://127.0.0.1:3000",
    });

    expect(result).toMatchObject({
      configured: true,
      safe: { commerceHost: "127.0.0.1", publicHost: "127.0.0.1" },
    });
  });

  test("accepts explicit test data only on the matching Vercel preview", () => {
    const result = getDomainIntelligenceConfig({
      ...validEnv,
      VERCEL_ENV: "preview",
      VERCEL_URL: "discord-preview-juyu.vercel.app",
      RAYFOX_DOMAIN_TEST_DATA: "enabled",
      RAYNAME_COMMERCE_API_BASE_URL: undefined,
      RAYNAME_COMMERCE_API_TOKEN: undefined,
      RAYFOX_PUBLIC_BASE_URL: undefined,
    });

    expect(result).toMatchObject({
      configured: true,
      mode: "internal",
      testData: true,
      safe: {
        commerceHost: "internal-test-data",
        publicHost: "discord-preview-juyu.vercel.app",
      },
    });
  });

  test.each([
    { VERCEL_ENV: "production" },
    { RAYFOX_DOMAIN_INTELLIGENCE_MODE: "public" },
    { RAYFOX_PUBLIC_BASE_URL: "https://attacker.example" },
  ])("rejects test data outside its exact internal Preview boundary %#", (override) => {
    expect(getDomainIntelligenceConfig({
      ...validEnv,
      VERCEL_ENV: "preview",
      VERCEL_URL: "discord-preview-juyu.vercel.app",
      RAYFOX_DOMAIN_TEST_DATA: "enabled",
      RAYNAME_COMMERCE_API_BASE_URL: undefined,
      RAYNAME_COMMERCE_API_TOKEN: undefined,
      RAYFOX_PUBLIC_BASE_URL: undefined,
      ...override,
    })).toMatchObject({ configured: false, mode: "disabled" });
  });

  test.each([
    "http://localhost:3115",
    "http://0.0.0.0:3115",
    "https://127.0.0.1:3115",
    "http://127.0.0.1:3115/api",
  ])("rejects unsafe development commerce URL %s", (commerceApiBaseUrl) => {
    expect(
      getDomainIntelligenceConfig({
        ...validEnv,
        NODE_ENV: "development",
        RAYNAME_COMMERCE_API_BASE_URL: commerceApiBaseUrl,
      }),
    ).toMatchObject({ configured: false, mode: "disabled" });
  });
});

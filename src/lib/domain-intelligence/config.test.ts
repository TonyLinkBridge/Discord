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

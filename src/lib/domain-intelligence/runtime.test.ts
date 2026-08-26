// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import { createVerificationRuntime } from "@/lib/verification/runtime";

import { createDomainIntelligenceRuntime } from "./runtime";

const discordEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://rayname:secret@example.neon.tech/neondb",
  DISCORD_APPLICATION_ID: "1541013436098682942",
  DISCORD_PUBLIC_KEY: "ab".repeat(32),
  DISCORD_GUILD_ID: "1540610722281824336",
  DISCORD_VERIFIED_ROLE_ID: "1540611679023276114",
  DISCORD_BOT_TOKEN: "discord-bot-token-value-for-tests",
  VERIFICATION_DATA_KEY: Buffer.alloc(32, 4).toString("base64"),
};

const domainEnv = {
  ...discordEnv,
  RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
  RAYFOX_DOMAIN_BETA_ROLE_IDS: "1541478390924837005",
  RAYNAME_COMMERCE_API_BASE_URL: "http://127.0.0.1:3115",
  RAYNAME_COMMERCE_API_TOKEN: "test-token-at-least-20-characters",
  RAYNAME_DOMAIN_PAGE_BASE_URL: "https://www.rayname.com/domain/search",
  RAYFOX_PUBLIC_BASE_URL: "http://127.0.0.1:3000",
  RAYFOX_LINK_SIGNING_KEY: Buffer.alloc(32, 9).toString("base64"),
};

describe("domain intelligence runtime", () => {
  test("keeps only domain intelligence unavailable when RayName is disabled", () => {
    const domain = createDomainIntelligenceRuntime({
      ...discordEnv,
      RAYFOX_DOMAIN_INTELLIGENCE_MODE: "disabled",
    });
    const verification = createVerificationRuntime(discordEnv, vi.fn());

    expect(domain).toEqual({
      ready: false,
      reason: "RayFox domain intelligence is disabled",
    });
    expect(verification.ready).toBe(true);
  });

  test("fails closed when Discord or the database is not configured", () => {
    const runtime = createDomainIntelligenceRuntime({
      ...domainEnv,
      DATABASE_URL: undefined,
    });

    expect(runtime).toMatchObject({ ready: false });
    if (!runtime.ready) {
      expect(runtime.reason).toContain("DATABASE_URL");
    }
  });

  test("composes the real provider-agnostic service when all contracts are configured", () => {
    const runtime = createDomainIntelligenceRuntime(domainEnv, vi.fn());

    expect(runtime).toMatchObject({
      ready: true,
      config: {
        mode: "internal",
        betaRoleIds: ["1541478390924837005"],
        verifiedRoleId: "1540611679023276114",
      },
    });
    if (runtime.ready) {
      expect(typeof runtime.service.search).toBe("function");
      expect(typeof runtime.service.compare).toBe("function");
      expect(JSON.stringify(runtime.config)).not.toContain("test-token");
      expect(JSON.stringify(runtime.config)).not.toContain("postgresql://");
    }
  });

  test("composes the isolated fixture provider only for an explicit Preview", () => {
    const runtime = createDomainIntelligenceRuntime({
      ...domainEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "discord-preview-juyu.vercel.app",
      RAYFOX_DOMAIN_TEST_DATA: "enabled",
      RAYNAME_COMMERCE_API_BASE_URL: undefined,
      RAYNAME_COMMERCE_API_TOKEN: undefined,
      RAYNAME_DOMAIN_PAGE_BASE_URL: "https://www.rayname.com/en/search",
      RAYFOX_PUBLIC_BASE_URL: undefined,
    }, vi.fn());

    expect(runtime).toMatchObject({
      ready: true,
      config: {
        mode: "internal",
        testData: true,
        commerceHost: "internal-test-data",
      },
    });
  });
});

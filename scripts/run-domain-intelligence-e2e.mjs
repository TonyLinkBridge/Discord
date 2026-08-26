import { spawn as spawnChild } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  discordStubFixture,
  startDiscordApiStub,
} from "./discord-api-stub.mjs";
import {
  assertDomainIntelligenceTestEnvironment,
  domainIntelligenceE2eDataKey,
  domainIntelligenceE2eFixture,
  domainIntelligenceE2eLinkKey,
} from "./domain-intelligence-e2e-fixtures.mjs";
import {
  rayNameCommerceStubToken,
  startRayNameCommerceApiStub,
} from "./rayname-commerce-api-stub.mjs";

export const domainIntelligenceE2ePorts = Object.freeze({
  app: 3113,
  discord: 3114,
  rayName: 3115,
});

export function createDomainIntelligenceE2eEnvironment(source) {
  const testDatabaseUrl = source.VERIFICATION_TEST_DATABASE_URL?.trim();
  if (!testDatabaseUrl) {
    throw new Error("VERIFICATION_TEST_DATABASE_URL is required");
  }
  return {
    ...source,
    NODE_ENV: "development",
    ADMIN_DISCORD_USER_IDS: "local-ray",
    AUTH_DISCORD_ID: "playwright-discord-client",
    AUTH_DISCORD_SECRET: "playwright-discord-secret",
    AUTH_SECRET: "playwright-local-auth-secret",
    CRON_SECRET: "playwright-local-cron-secret",
    DATABASE_URL: testDatabaseUrl,
    DATA_MODE: "unavailable",
    DEV_OPERATOR_ID: "local-ray",
    DISCORD_API_BASE_URL:
      `http://127.0.0.1:${domainIntelligenceE2ePorts.discord}`,
    DISCORD_APPLICATION_ID: domainIntelligenceE2eFixture.applicationId,
    DISCORD_BOT_TOKEN: "local-e2e-dummy-token-never-production",
    DISCORD_GUILD_ID: discordStubFixture.guildId,
    DISCORD_PUBLIC_KEY: domainIntelligenceE2eFixture.publicKey,
    DISCORD_VERIFIED_ROLE_ID: domainIntelligenceE2eFixture.verifiedRoleId,
    VERIFICATION_DATA_KEY: domainIntelligenceE2eDataKey,
    RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
    RAYFOX_DOMAIN_BETA_ROLE_IDS: [
      domainIntelligenceE2eFixture.normalBetaRoleId,
      domainIntelligenceE2eFixture.verifiedBetaRoleId,
    ].join(","),
    RAYNAME_COMMERCE_API_BASE_URL:
      `http://127.0.0.1:${domainIntelligenceE2ePorts.rayName}`,
    RAYNAME_COMMERCE_API_TOKEN: rayNameCommerceStubToken,
    RAYNAME_DOMAIN_PAGE_BASE_URL:
      "https://www.rayname.com/domain/intelligence/",
    RAYFOX_PUBLIC_BASE_URL:
      `http://127.0.0.1:${domainIntelligenceE2ePorts.app}`,
    RAYFOX_LINK_SIGNING_KEY: domainIntelligenceE2eLinkKey,
  };
}

export async function startDomainIntelligenceE2eServices(
  source,
  dependencies = {
    assertEnvironment: assertDomainIntelligenceTestEnvironment,
    startDiscord: startDiscordApiStub,
    startRayName: startRayNameCommerceApiStub,
    spawn: spawnChild,
  },
) {
  await dependencies.assertEnvironment(source);
  const discord = await dependencies.startDiscord({
    host: "127.0.0.1",
    port: domainIntelligenceE2ePorts.discord,
  });
  let rayName;
  try {
    rayName = await dependencies.startRayName({
      host: "127.0.0.1",
      port: domainIntelligenceE2ePorts.rayName,
    });
  } catch (error) {
    await discord.close().catch(() => undefined);
    throw error;
  }
  const child = dependencies.spawn(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(domainIntelligenceE2ePorts.app),
    ],
    {
      env: createDomainIntelligenceE2eEnvironment(source),
      stdio: "inherit",
    },
  );
  let closing = false;
  return {
    child,
    async close(signal = "SIGTERM") {
      if (closing) return;
      closing = true;
      if (!child.killed) child.kill(signal);
      await Promise.allSettled([discord.close(), rayName.close()]);
    },
  };
}

async function serveDomainIntelligenceE2e() {
  const services = await startDomainIntelligenceE2eServices(process.env);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void services.close(signal));
  }
  services.child.once("exit", (code, signal) => {
    void services.close(signal ?? "SIGTERM").finally(() => {
      process.exitCode = signal ? 1 : (code ?? 1);
    });
  });
}

export async function runDomainIntelligenceE2e(
  source,
  dependencies = {
    assertEnvironment: assertDomainIntelligenceTestEnvironment,
    spawn: spawnChild,
  },
) {
  await dependencies.assertEnvironment(source);
  const child = dependencies.spawn(
    "npm",
    ["run", "test:e2e", "--", "e2e/domain-intelligence.spec.ts"],
    {
      env: { ...source, DOMAIN_INTELLIGENCE_E2E: "1" },
      stdio: "inherit",
    },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv.includes("--serve")
    ? serveDomainIntelligenceE2e()
    : runDomainIntelligenceE2e(process.env).then((code) => {
        process.exitCode = code;
      });
  operation.catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Domain intelligence E2E startup failed"}\n`,
    );
    process.exitCode = 1;
  });
}

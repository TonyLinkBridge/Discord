import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  discordStubFixture,
  startDiscordApiStub,
} from "./discord-api-stub.mjs";
import {
  assertVerificationTestEnvironment,
  verificationE2eDataKey,
} from "./verification-e2e-fixtures.mjs";

export function createVerificationE2eEnvironment(source) {
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
    DISCORD_API_BASE_URL: "http://127.0.0.1:3114",
    DISCORD_APPLICATION_ID: "900000000000000099",
    DISCORD_BOT_TOKEN: "local-e2e-dummy-token-never-production",
    DISCORD_GUILD_ID: discordStubFixture.guildId,
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_VERIFIED_ROLE_ID: discordStubFixture.roleId,
    VERIFICATION_DATA_KEY: verificationE2eDataKey,
  };
}

async function run() {
  await assertVerificationTestEnvironment(process.env);
  const stub = await startDiscordApiStub();
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3113"],
    {
      env: createVerificationE2eEnvironment(process.env),
      stdio: "inherit",
    },
  );
  let closing = false;
  const close = async (signal) => {
    if (closing) return;
    closing = true;
    if (!child.killed) child.kill(signal);
    await stub.close().catch(() => undefined);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void close(signal));
  }
  child.once("exit", (code, signal) => {
    void stub.close().finally(() => {
      process.exitCode = signal ? 1 : (code ?? 1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Verification E2E startup failed"}\n`,
    );
    process.exitCode = 1;
  });
}

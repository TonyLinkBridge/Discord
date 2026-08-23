import { defineConfig, devices } from "@playwright/test";

const port = 3113;
const verificationE2e = Boolean(
  process.env.VERIFICATION_TEST_DATABASE_URL &&
    process.env.VERIFICATION_TEST_BRANCH_ID &&
    process.env.VERIFICATION_PRODUCTION_BRANCH_ID,
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI || verificationE2e ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: verificationE2e
      ? "node scripts/run-verification-e2e.mjs"
      : `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: verificationE2e
      ? {
          VERIFICATION_TEST_BRANCH_ID:
            process.env.VERIFICATION_TEST_BRANCH_ID!,
          VERIFICATION_TEST_DATABASE_URL:
            process.env.VERIFICATION_TEST_DATABASE_URL!,
          VERIFICATION_PRODUCTION_BRANCH_ID:
            process.env.VERIFICATION_PRODUCTION_BRANCH_ID!,
        }
      : {
          ADMIN_DISCORD_USER_IDS: "local-ray",
          AUTH_DISCORD_ID: "playwright-discord-client",
          AUTH_DISCORD_SECRET: "playwright-discord-secret",
          AUTH_SECRET: "playwright-local-auth-secret",
          DATA_MODE: "unavailable",
          DEV_OPERATOR_ID: "local-ray",
        },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`,
  },
});

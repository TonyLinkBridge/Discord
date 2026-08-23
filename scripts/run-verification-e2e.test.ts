// @vitest-environment node

import { expect, test } from "vitest";

import { createVerificationE2eEnvironment } from "./run-verification-e2e.mjs";

test("starts Next with only the designated test database and loopback Discord API", () => {
  const testUrl = "postgresql://test:secret@test-branch.neon.tech/neondb";
  const environment = createVerificationE2eEnvironment({
    VERIFICATION_TEST_DATABASE_URL: testUrl,
    VERIFICATION_TEST_BRANCH_ID: "br-test-123",
    VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
  });

  expect(environment).toMatchObject({
    DATABASE_URL: testUrl,
    DISCORD_API_BASE_URL: "http://127.0.0.1:3114",
    DISCORD_GUILD_ID: "900000000000000000",
    DISCORD_VERIFIED_ROLE_ID: "900000000000000010",
    NODE_ENV: "development",
  });
  expect(environment.DEV_OPERATOR_ID).toBe("local-ray");
});

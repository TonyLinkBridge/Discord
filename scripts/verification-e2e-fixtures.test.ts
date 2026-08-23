// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import { assertVerificationTestEnvironment } from "./verification-e2e-fixtures.mjs";

const testUrl = "postgresql://test:secret@test-branch.neon.tech/neondb";

describe("verification E2E database guard", () => {
  test("fails fast without the explicit test URL and both branch IDs", async () => {
    const getBranchId = vi.fn();

    await expect(
      assertVerificationTestEnvironment({}, { getBranchId }),
    ).rejects.toThrow("VERIFICATION_TEST_DATABASE_URL");
    expect(getBranchId).not.toHaveBeenCalled();
  });

  test("refuses a URL matching the production configuration", async () => {
    await expect(
      assertVerificationTestEnvironment(
        {
          DATABASE_URL: testUrl,
          VERIFICATION_TEST_DATABASE_URL: testUrl,
          VERIFICATION_TEST_BRANCH_ID: "br-test-123",
          VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
        },
        { getBranchId: vi.fn() },
      ),
    ).rejects.toThrow("production");
  });

  test("requires the database to report the designated Neon branch", async () => {
    const getBranchId = vi.fn().mockResolvedValue("br-unexpected-123");

    await expect(
      assertVerificationTestEnvironment(
        {
          VERIFICATION_TEST_DATABASE_URL: testUrl,
          VERIFICATION_TEST_BRANCH_ID: "br-test-123",
          VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
        },
        { getBranchId },
      ),
    ).rejects.toThrow("branch identity");
    expect(getBranchId).toHaveBeenCalledWith(testUrl);
  });

  test("refuses the production branch even when its connection URL differs", async () => {
    const getBranchId = vi.fn().mockResolvedValue("br-production-123");

    await expect(
      assertVerificationTestEnvironment(
        {
          DATABASE_URL:
            "postgresql://production:secret@production-pooler.neon.tech/neondb",
          VERIFICATION_TEST_DATABASE_URL: testUrl,
          VERIFICATION_TEST_BRANCH_ID: "br-production-123",
          VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
        },
        { getBranchId },
      ),
    ).rejects.toThrow("production branch");
  });

  test("accepts a database-reported test branch distinct from production", async () => {
    const getBranchId = vi.fn().mockResolvedValue("br-test-123");

    await expect(
      assertVerificationTestEnvironment(
        {
          VERIFICATION_TEST_DATABASE_URL: testUrl,
          VERIFICATION_TEST_BRANCH_ID: "br-test-123",
          VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
        },
        { getBranchId },
      ),
    ).resolves.toMatchObject({ branchId: "br-test-123" });
  });
});

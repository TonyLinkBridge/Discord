// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import { verifyDiscordSignature } from "@/lib/discord/signature";

import {
  assertDomainIntelligenceTestEnvironment,
  createSignedDomainInteractionRequest,
  createSignedVerifyInteractionRequest,
  domainIntelligenceE2eFixture,
} from "./domain-intelligence-e2e-fixtures.mjs";

const testUrl = "postgresql://test:secret@test-branch.neon.tech/neondb";

describe("domain intelligence E2E fixtures", () => {
  test("names the missing disposable database prerequisite clearly", async () => {
    await expect(assertDomainIntelligenceTestEnvironment({}))
      .rejects.toThrow(
        "VERIFICATION_TEST_DATABASE_URL is required for domain intelligence E2E",
      );
  });

  test("creates a valid signed normal-member domain command", async () => {
    const request = createSignedDomainInteractionRequest({
      interactionId: "910000000000000001",
      interactionToken: "private-normal-interaction-token",
      member: "normal",
      domain: "lucidgrid.ai",
    });
    const body = await request.text();

    expect(verifyDiscordSignature({
      body,
      publicKeyHex: domainIntelligenceE2eFixture.publicKey,
      signatureHex: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    })).toBe(true);
    expect(JSON.parse(body)).toMatchObject({
      id: "910000000000000001",
      token: "private-normal-interaction-token",
      member: {
        user: { id: domainIntelligenceE2eFixture.normalUserId },
        roles: [domainIntelligenceE2eFixture.normalBetaRoleId],
      },
      data: {
        name: "domain",
        options: [{ name: "domain", type: 3, value: "lucidgrid.ai" }],
      },
    });
  });

  test("adds both beta and Verified roles only to the Verified fixture", async () => {
    const request = createSignedDomainInteractionRequest({
      interactionId: "910000000000000002",
      interactionToken: "private-verified-interaction-token",
      member: "verified",
      domain: "signalharbor.com",
    });
    const interaction = JSON.parse(await request.text());

    expect(interaction.member.roles).toEqual([
      domainIntelligenceE2eFixture.verifiedBetaRoleId,
      domainIntelligenceE2eFixture.verifiedRoleId,
    ]);
    expect(interaction.member.roles).not.toContain(
      domainIntelligenceE2eFixture.normalBetaRoleId,
    );
  });

  test("creates a signed verify command for regression coverage", async () => {
    const request = createSignedVerifyInteractionRequest({
      interactionId: "910000000000000003",
      interactionToken: "private-verify-interaction-token",
      member: "normal",
    });
    const body = await request.text();

    expect(verifyDiscordSignature({
      body,
      publicKeyHex: domainIntelligenceE2eFixture.publicKey,
      signatureHex: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    })).toBe(true);
    expect(JSON.parse(body)).toMatchObject({
      data: { name: "verify" },
      member: { user: { id: domainIntelligenceE2eFixture.normalUserId } },
    });
  });

  test("inherits the disposable Neon guard and rejects production", async () => {
    const getBranchId = vi.fn().mockResolvedValue("br-production-123");

    await expect(assertDomainIntelligenceTestEnvironment({
      VERIFICATION_TEST_DATABASE_URL: testUrl,
      VERIFICATION_TEST_BRANCH_ID: "br-production-123",
      VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
    }, { getBranchId })).rejects.toThrow("production branch");
  });

  test("accepts only the database-reported disposable branch", async () => {
    const getBranchId = vi.fn().mockResolvedValue("br-test-123");

    await expect(assertDomainIntelligenceTestEnvironment({
      VERIFICATION_TEST_DATABASE_URL: testUrl,
      VERIFICATION_TEST_BRANCH_ID: "br-test-123",
      VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
    }, { getBranchId })).resolves.toEqual({
      databaseUrl: testUrl,
      branchId: "br-test-123",
    });
  });
});

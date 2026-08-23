import { describe, expect, test, vi } from "vitest";

import { createTestVerificationRepository } from "@/test/verification-repository";

import { createVerificationCrypto } from "./crypto";
import { createVerificationService } from "./service";
import type { DiscordRoleClient } from "./types";

const now = new Date("2026-08-23T00:00:00.000Z");
const rootKey = Buffer.alloc(32, 9).toString("base64");
const submission = {
  discordUserId: "223456789012345678",
  guildId: "1540610722281824336",
  displayName: "Ray User",
  discordHandle: "ray.user",
  email: "ray@example.com",
  domain: "example.com",
};

function createRoleClient(
  ensureResult: Awaited<ReturnType<DiscordRoleClient["ensureRole"]>> = {
    status: "assigned",
  },
  notificationResult: Awaited<
    ReturnType<DiscordRoleClient["notifyReviewOutcome"]>
  > = { status: "sent" },
): DiscordRoleClient {
  return {
    ensureRole: vi.fn().mockResolvedValue(ensureResult),
    notifyReviewOutcome: vi.fn().mockResolvedValue(notificationResult),
  };
}

function createHarness(roleClient = createRoleClient()) {
  const repository = createTestVerificationRepository();
  const service = createVerificationService({
    repository,
    crypto: createVerificationCrypto(rootKey),
    roleClient,
    roleId: "423456789012345678",
    now: () => now,
  });
  return { repository, roleClient, service };
}

describe("verification service", () => {
  test("does not create a request for an already verified member", async () => {
    const { repository, service } = createHarness();
    repository.seedVerifiedMember({
      ...submission,
      verifiedAt: new Date("2026-08-20T00:00:00.000Z"),
    });

    await expect(service.submit(submission)).resolves.toEqual({
      status: "already-verified",
    });
    expect(repository.snapshot().requests).toHaveLength(0);
  });

  test("decrypts applicant email only when listing for an admin", async () => {
    const { service } = createHarness();
    await service.submit(submission);

    const rows = await service.listForAdmin();

    expect(rows[0]).toMatchObject({
      email: "ray@example.com",
      domain: "example.com",
      status: "pending",
    });
  });

  test("two concurrent approvals call Discord once", async () => {
    const roleClient = createRoleClient();
    const { repository, service } = createHarness(roleClient);
    const created = await service.submit(submission);
    if (created.status !== "created") throw new Error("Expected a new request");

    const [first, second] = await Promise.all([
      service.approve(created.requestId, "323456789012345678"),
      service.approve(created.requestId, "323456789012345678"),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      "already-processing",
      "approved",
    ]);
    expect(roleClient.ensureRole).toHaveBeenCalledTimes(1);
    expect(repository.snapshot().roleOperations).toHaveLength(1);
    expect(
      repository
        .snapshot()
        .auditEvents.filter(({ action }) => action === "verification.approved"),
    ).toHaveLength(1);
  });

  test("records role_failed and never approved when Discord fails", async () => {
    const { repository, service } = createHarness(
      createRoleClient({
        status: "failed",
        code: "missing_permissions",
        safeMessage: "Move the bot role above Verified Customer",
        retryable: false,
      }),
    );
    const created = await service.submit(submission);
    if (created.status !== "created") throw new Error("Expected a new request");

    await expect(
      service.approve(created.requestId, "323456789012345678"),
    ).resolves.toEqual({
      status: "role-failed",
      message: "Move the bot role above Verified Customer",
      retryable: false,
    });

    expect(repository.snapshot().requests[0].status).toBe("role_failed");
    expect(repository.snapshot().requests[0].roleAssignedAt).toBeNull();
  });

  test("retry reuses the failed role operation and reconciles success", async () => {
    const roleClient = createRoleClient({
      status: "failed",
      code: "discord_unavailable",
      safeMessage: "Discord is temporarily unavailable",
      retryable: true,
    });
    const { repository, service } = createHarness(roleClient);
    const created = await service.submit(submission);
    if (created.status !== "created") throw new Error("Expected a new request");
    await service.approve(created.requestId, "323456789012345678");
    vi.mocked(roleClient.ensureRole).mockResolvedValue({
      status: "already-present",
    });

    await expect(
      service.retryRole(created.requestId, "323456789012345678"),
    ).resolves.toEqual({ status: "approved" });

    const snapshot = repository.snapshot();
    expect(snapshot.roleOperations).toHaveLength(1);
    expect(snapshot.roleOperations[0]).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
    });
    expect(
      snapshot.auditEvents.filter(
        ({ action, outcome }) =>
          action === "verification.approved" && outcome === "succeeded",
      ),
    ).toHaveLength(1);
  });

  test("keeps approval durable when the private notification fails", async () => {
    const { repository, service } = createHarness(
      createRoleClient(
        { status: "assigned" },
        {
          status: "failed",
          code: "dm_closed",
          safeMessage: "Member does not accept direct messages",
        },
      ),
    );
    const created = await service.submit(submission);
    if (created.status !== "created") throw new Error("Expected a new request");

    await expect(
      service.approve(created.requestId, "323456789012345678"),
    ).resolves.toEqual({ status: "approved" });

    const snapshot = repository.snapshot();
    expect(snapshot.requests[0].status).toBe("approved");
    expect(
      snapshot.auditEvents.find(
        ({ action }) => action === "verification.notification",
      ),
    ).toMatchObject({ outcome: "failed" });
  });

  test("requires a trimmed rejection reason and schedules data expiry", async () => {
    const { repository, service } = createHarness();
    const created = await service.submit(submission);
    if (created.status !== "created") throw new Error("Expected a new request");

    await expect(
      service.reject(created.requestId, "323456789012345678", "   "),
    ).rejects.toThrow("Rejection reason must be between 1 and 500 characters");
    await expect(
      service.reject(
        created.requestId,
        "323456789012345678",
        "  Account details did not match  ",
      ),
    ).resolves.toEqual({ status: "rejected" });

    expect(repository.snapshot().requests[0]).toMatchObject({
      status: "rejected",
      reviewReason: "Account details did not match",
      sensitiveExpiresAt: new Date("2026-11-21T00:00:00.000Z"),
    });
  });
});

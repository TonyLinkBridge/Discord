import { describe, expect, test } from "vitest";

import { createTestVerificationRepository } from "@/test/verification-repository";

describe("verification repository atomic behavior", () => {
  test("claims a Discord interaction exactly once", async () => {
    const repository = createTestVerificationRepository();
    const input = {
      interactionId: "123456789012345678",
      interactionType: 5,
      discordUserId: "223456789012345678",
    };

    await expect(repository.claimInteraction(input)).resolves.toBe("claimed");
    await expect(repository.claimInteraction(input)).resolves.toBe("duplicate");
  });

  test("returns the same active request for a repeated submission", async () => {
    const repository = createTestVerificationRepository();
    const input = {
      discordUserId: "223456789012345678",
      guildId: "1540610722281824336",
      displayName: "Ray User",
      discordHandle: "ray.user",
      encryptedEmail: {
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "auth-tag",
      },
      emailLookupHash: "lookup-hash",
      domain: "example.com",
      now: new Date("2026-08-23T00:00:00.000Z"),
    };

    const first = await repository.submit(input);
    const second = await repository.submit(input);

    expect(first.status).toBe("created");
    if (first.status !== "created") throw new Error("Expected a new request");
    expect(second).toEqual({
      status: "active",
      requestId: first.requestId,
      requestStatus: "pending",
    });
    expect(repository.snapshot().requests).toHaveLength(1);
  });

  test("allows one approval claimant and creates one role operation", async () => {
    const repository = createTestVerificationRepository();
    const submission = await repository.submit({
      discordUserId: "223456789012345678",
      guildId: "1540610722281824336",
      displayName: "Ray User",
      discordHandle: "ray.user",
      encryptedEmail: {
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "auth-tag",
      },
      emailLookupHash: "lookup-hash",
      domain: null,
      now: new Date("2026-08-23T00:00:00.000Z"),
    });
    if (submission.status !== "created") {
      throw new Error("Expected a new request");
    }
    const claim = {
      requestId: submission.requestId,
      actorId: "323456789012345678",
      roleId: "423456789012345678",
      allowedStatus: "pending" as const,
      now: new Date("2026-08-23T00:01:00.000Z"),
    };

    const [first, second] = await Promise.all([
      repository.claimRoleAssignment(claim),
      repository.claimRoleAssignment(claim),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      "already-processing",
      "claimed",
    ]);
    expect(repository.snapshot().roleOperations).toHaveLength(1);
  });

  test("purges expired encrypted fields while preserving audit history", async () => {
    const repository = createTestVerificationRepository();
    const submission = await repository.submit({
      discordUserId: "223456789012345678",
      guildId: "1540610722281824336",
      displayName: "Ray User",
      discordHandle: "ray.user",
      encryptedEmail: {
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "auth-tag",
      },
      emailLookupHash: "lookup-hash",
      domain: "example.com",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    if (submission.status !== "created") {
      throw new Error("Expected a new request");
    }
    await repository.reject({
      requestId: submission.requestId,
      actorId: "323456789012345678",
      reason: "Account details did not match",
      now: new Date("2026-05-01T01:00:00.000Z"),
    });

    await expect(
      repository.purgeExpiredSensitiveData(
        new Date("2026-08-23T00:00:00.000Z"),
      ),
    ).resolves.toBe(1);

    const snapshot = repository.snapshot();
    expect(snapshot.requests[0]).toMatchObject({
      encryptedEmail: null,
      emailLookupHash: null,
      domain: null,
    });
    expect(snapshot.auditEvents).toHaveLength(1);
    await expect(
      repository.purgeExpiredSensitiveData(
        new Date("2026-08-23T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);
  });
});

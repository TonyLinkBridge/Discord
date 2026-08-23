// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import * as schema from "@/lib/database/schema";

import { createNeonVerificationRepository } from "./repository";

const submittedAt = new Date("2026-08-23T00:00:00.000Z");

describe("Neon verification repository", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  function repository() {
    return createNeonVerificationRepository(drizzle(client, { schema }));
  }

  async function submit() {
    return repository().submit({
      discordUserId: "223456789012345678",
      guildId: "1540610722281824336",
      displayName: "DomainNomad",
      discordHandle: "domain.nomad",
      encryptedEmail: {
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "auth-tag",
      },
      emailLookupHash: "lookup-hash",
      domain: "example.com",
      now: submittedAt,
    });
  }

  test("deduplicates interactions and active requests with database constraints", async () => {
    const firstInteraction = await repository().claimInteraction({
      interactionId: "123456789012345678",
      interactionType: 5,
      discordUserId: "223456789012345678",
    });
    const duplicateInteraction = await repository().claimInteraction({
      interactionId: "123456789012345678",
      interactionType: 5,
      discordUserId: "223456789012345678",
    });
    const [first, second] = await Promise.all([submit(), submit()]);

    expect(firstInteraction).toBe("claimed");
    expect(duplicateInteraction).toBe("duplicate");
    expect([first.status, second.status].sort()).toEqual(["active", "created"]);
    expect(await repository().listForAdmin()).toHaveLength(1);
  });

  test("allows one concurrent approval claim and reuses one operation", async () => {
    const created = await submit();
    if (created.status !== "created") throw new Error("Expected request");
    const claim = {
      requestId: created.requestId,
      actorId: "323456789012345678",
      roleId: "1540611679023276114",
      allowedStatus: "pending" as const,
      now: new Date("2026-08-23T00:01:00.000Z"),
    };

    const [first, second] = await Promise.all([
      repository().claimRoleAssignment(claim),
      repository().claimRoleAssignment(claim),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      "already-processing",
      "claimed",
    ]);
  });

  test("persists role failure, retry success, audit, and idempotent cleanup", async () => {
    const created = await submit();
    if (created.status !== "created") throw new Error("Expected request");
    const actorId = "323456789012345678";
    const roleId = "1540611679023276114";
    const firstClaim = await repository().claimRoleAssignment({
      requestId: created.requestId,
      actorId,
      roleId,
      allowedStatus: "pending",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    if (firstClaim.status !== "claimed") throw new Error("Expected claim");
    await repository().failRoleAssignment({
      requestId: created.requestId,
      operationId: firstClaim.operation.id,
      actorId,
      code: "rate_limited",
      safeMessage: "Discord is rate limiting role updates",
      now: new Date("2026-08-23T00:02:00.000Z"),
    });
    const retry = await repository().claimRoleAssignment({
      requestId: created.requestId,
      actorId,
      roleId,
      allowedStatus: "role_failed",
      now: new Date("2026-08-23T00:03:00.000Z"),
    });
    if (retry.status !== "claimed") throw new Error("Expected retry claim");
    expect(retry.operation.id).toBe(firstClaim.operation.id);
    expect(retry.operation.attemptCount).toBe(2);
    await repository().completeRoleAssignment({
      requestId: created.requestId,
      operationId: retry.operation.id,
      actorId,
      now: new Date("2026-08-23T00:04:00.000Z"),
    });

    expect(await repository().getMemberVerificationState("223456789012345678"))
      .toEqual({ status: "verified" });
    expect((await repository().listForAdmin())[0]).toMatchObject({
      status: "approved",
      roleAssignedAt: new Date("2026-08-23T00:04:00.000Z"),
    });
    await expect(
      repository().purgeExpiredSensitiveData(
        new Date("2026-11-22T00:04:00.000Z"),
      ),
    ).resolves.toBe(1);
    await expect(
      repository().purgeExpiredSensitiveData(
        new Date("2026-11-22T00:04:00.000Z"),
      ),
    ).resolves.toBe(0);
    expect((await repository().listForAdmin())[0]).toMatchObject({
      encryptedEmail: null,
      emailLookupHash: null,
      domain: null,
    });
  });
});

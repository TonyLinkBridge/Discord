// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import * as schema from "@/lib/database/schema";

import { createNeonDomainQueryRepository } from "./repository";
import type { DomainIntelligenceResult } from "./types";

const guildId = "1540610722281824336";
const userId = "223456789012345678";
const usageDay = "2026-08-25";

const result: DomainIntelligenceResult = {
  domain: {
    ascii: "example.com",
    unicode: "example.com",
    label: "example",
    tld: "com",
  },
  commercial: {
    availability: "available",
    premium: false,
    premiumRenewal: null,
    registrationPrice: { amount: "12.99", currency: "USD" },
    renewalPrice: { amount: "14.99", currency: "USD" },
    transferPrice: { amount: "11.99", currency: "USD" },
    transferEligible: null,
    destination: "https://www.rayname.com/domain/search?domain=example.com",
    checkedAt: "2026-08-25T00:00:00.000Z",
  },
  registration: null,
  dns: null,
  certificate: null,
  checkedAt: "2026-08-25T00:00:00.000Z",
};

describe("Neon domain query repository", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client, { schema }), { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  function repository() {
    return createNeonDomainQueryRepository(drizzle(client, { schema }));
  }

  function begin(input: {
    interactionId: string;
    domain?: string;
    tier?: "member" | "verified";
    now?: Date;
    replayAfter?: Date;
    staleBefore?: Date;
    quotaExempt?: boolean;
  }) {
    const now = input.now ?? new Date("2026-08-25T00:00:00.000Z");
    return repository().begin({
      interactionId: input.interactionId,
      guildId,
      discordUserId: userId,
      normalizedDomain: input.domain ?? "example.com",
      tier: input.tier ?? "member",
      usageDay,
      limit: input.tier === "verified" ? 3 : 1,
      quotaExempt: input.quotaExempt ?? false,
      now,
      replayAfter:
        input.replayAfter ?? new Date(now.getTime() - 5 * 60 * 1_000),
      staleBefore:
        input.staleBefore ?? new Date(now.getTime() - 2 * 60 * 1_000),
    });
  }

  test("reserves one member slot and releases it after failure", async () => {
    const first = await begin({ interactionId: "interaction-1" });
    expect(first.status).toBe("started");

    const blocked = await begin({ interactionId: "interaction-2", domain: "other.com" });
    expect(blocked).toMatchObject({ status: "quota-rejected", used: 1, limit: 1 });

    if (first.status !== "started") throw new Error("Expected reservation");
    await repository().fail({
      requestId: first.requestId,
      code: "rayname_unavailable",
      completedAt: new Date("2026-08-25T00:00:30.000Z"),
    });

    await expect(
      begin({ interactionId: "interaction-3", domain: "third.com" }),
    ).resolves.toMatchObject({ status: "started" });
  });

  test("allows exactly three concurrent Verified reservations", async () => {
    const outcomes = await Promise.all(
      [1, 2, 3, 4].map((number) =>
        begin({
          interactionId: `verified-${number}`,
          domain: `domain-${number}.com`,
          tier: "verified",
        }),
      ),
    );

    expect(outcomes.filter(({ status }) => status === "started")).toHaveLength(3);
    expect(outcomes.filter(({ status }) => status === "quota-rejected")).toHaveLength(1);
  });

  test("allows exactly one concurrent member reservation", async () => {
    const outcomes = await Promise.all([
      begin({ interactionId: "concurrent-1", domain: "one.com" }),
      begin({ interactionId: "concurrent-2", domain: "two.com" }),
    ]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual([
      "quota-rejected",
      "started",
    ]);
  });

  test("lets quota-exempt admin queries bypass the ceiling without changing daily usage", async () => {
    const limited = await begin({ interactionId: "limited-before-admin" });
    if (limited.status !== "started") throw new Error("Expected member reservation");
    await repository().succeed({
      requestId: limited.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:10.000Z"),
      limit: 1,
    });

    const admin = await begin({
      interactionId: "admin-unlimited",
      domain: "admin-unlimited.com",
      quotaExempt: true,
    });
    expect(admin).toMatchObject({ status: "started" });
    if (admin.status !== "started") throw new Error("Expected admin query");
    await expect(repository().succeed({
      requestId: admin.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:20.000Z"),
      limit: null,
    })).resolves.toEqual({ used: 0, limit: null });

    const failedAdmin = await begin({
      interactionId: "admin-unlimited-failure",
      domain: "admin-failure.com",
      quotaExempt: true,
    });
    if (failedAdmin.status !== "started") throw new Error("Expected admin query");
    await repository().fail({
      requestId: failedAdmin.requestId,
      code: "provider_unavailable",
      completedAt: new Date("2026-08-25T00:00:30.000Z"),
    });

    const usage = await client.query<{ reserved_count: number }>(
      "select reserved_count from domain_query_daily_usage where guild_id = $1 and discord_user_id = $2",
      [guildId, userId],
    );
    expect(usage.rows).toEqual([{ reserved_count: 1 }]);
    const adminRows = await client.query<{ quota_exempt: boolean }>(
      "select quota_exempt from domain_query_requests where interaction_id like 'admin-unlimited%' order by interaction_id",
    );
    expect(adminRows.rows).toEqual([
      { quota_exempt: true },
      { quota_exempt: true },
    ]);
  });

  test("deduplicates the same Discord interaction", async () => {
    const first = await begin({ interactionId: "duplicate" });
    const second = await begin({ interactionId: "duplicate" });

    expect(first.status).toBe("started");
    expect(second).toMatchObject({ status: "duplicate", state: "started" });
  });

  test("replays a successful same-domain result inside five minutes without reserving again", async () => {
    const first = await begin({
      interactionId: "replay-1",
      tier: "verified",
      now: new Date("2026-08-25T00:00:00.000Z"),
    });
    if (first.status !== "started") throw new Error("Expected reservation");
    await expect(
      repository().succeed({
        requestId: first.requestId,
        result,
        providers: { commerce: "rayname" },
        completedAt: new Date("2026-08-25T00:00:10.000Z"),
        limit: 3,
      }),
    ).resolves.toEqual({ used: 1, limit: 3 });

    const replay = await begin({
      interactionId: "replay-2",
      tier: "verified",
      now: new Date("2026-08-25T00:04:00.000Z"),
      replayAfter: new Date("2026-08-24T23:59:00.000Z"),
    });

    expect(replay).toMatchObject({
      status: "replay",
      requestId: first.requestId,
      result,
      used: 1,
    });

    await expect(
      begin({
        interactionId: "replay-3",
        domain: "another.com",
        tier: "verified",
        now: new Date("2026-08-25T00:04:10.000Z"),
      }),
    ).resolves.toMatchObject({ status: "started" });
  });

  test("recovers a stale reservation before applying the daily ceiling", async () => {
    await begin({
      interactionId: "stale-1",
      now: new Date("2026-08-25T00:00:00.000Z"),
    });

    await expect(
      begin({
        interactionId: "stale-2",
        domain: "fresh.com",
        now: new Date("2026-08-25T00:03:00.000Z"),
        staleBefore: new Date("2026-08-25T00:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "started" });

    const rows = await client.query<{ status: string; safe_error_code: string | null }>(
      "select status, safe_error_code from domain_query_requests order by created_at",
    );
    expect(rows.rows[0]).toEqual({
      status: "failed",
      safe_error_code: "stale_query_recovered",
    });
  });

  test("keeps query ownership private and records one conversion per action", async () => {
    const started = await begin({ interactionId: "conversion" });
    if (started.status !== "started") throw new Error("Expected reservation");
    await repository().succeed({
      requestId: started.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:10.000Z"),
      limit: 1,
    });

    await expect(
      repository().getOwnedQuery({
        requestId: started.requestId,
        discordUserId: "different-user",
      }),
    ).resolves.toBeNull();
    await expect(
      repository().getOwnedQuery({
        requestId: started.requestId,
        discordUserId: userId,
      }),
    ).resolves.toMatchObject({ id: started.requestId, result });

    const conversion = {
      requestId: started.requestId,
      action: "register" as const,
      destination: result.commercial.destination,
      occurredAt: new Date("2026-08-25T00:01:00.000Z"),
    };
    await expect(repository().recordConversion(conversion)).resolves.toBe("recorded");
    await expect(repository().recordConversion(conversion)).resolves.toBe("duplicate");

    const rows = await client.query<{
      discord_user_id: string;
      normalized_domain: string;
      destination_url: string;
    }>("select discord_user_id, normalized_domain, destination_url from domain_conversion_events");
    expect(rows.rows).toEqual([
      {
        discord_user_id: userId,
        normalized_domain: "example.com",
        destination_url: result.commercial.destination,
      },
    ]);
  });

  test("reads accurate owned usage without changing the daily allowance", async () => {
    const first = await begin({
      interactionId: "overview-usage-1",
      domain: "first.com",
      tier: "verified",
    });
    if (first.status !== "started") throw new Error("Expected first reservation");
    await repository().succeed({
      requestId: first.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:10.000Z"),
      limit: 3,
    });

    const second = await begin({
      interactionId: "overview-usage-2",
      domain: "second.com",
      tier: "verified",
    });
    if (second.status !== "started") throw new Error("Expected second reservation");
    await repository().succeed({
      requestId: second.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:20.000Z"),
      limit: 3,
    });

    const before = await client.query<{ reserved_count: number }>(
      "select reserved_count from domain_query_daily_usage where guild_id = $1 and discord_user_id = $2",
      [guildId, userId],
    );
    await expect(repository().getOwnedQuery({
      requestId: first.requestId,
      discordUserId: userId,
    })).resolves.toMatchObject({ id: first.requestId, used: 2 });
    const after = await client.query<{ reserved_count: number }>(
      "select reserved_count from domain_query_daily_usage where guild_id = $1 and discord_user_id = $2",
      [guildId, userId],
    );

    expect(after.rows).toEqual(before.rows);
  });

  test("stores only the normalized result rather than raw registration data", async () => {
    const started = await begin({ interactionId: "safe-snapshot" });
    if (started.status !== "started") throw new Error("Expected reservation");
    await repository().succeed({
      requestId: started.requestId,
      result,
      providers: { commerce: "rayname" },
      completedAt: new Date("2026-08-25T00:00:10.000Z"),
      limit: 1,
    });

    const rows = await client.query<{ result_snapshot: unknown }>(
      "select result_snapshot from domain_query_requests where id = $1",
      [started.requestId],
    );
    const serialized = JSON.stringify(rows.rows[0]);
    expect(serialized).toContain("example.com");
    expect(serialized).not.toContain("rawWhois");
    expect(serialized).not.toContain("registrant");
    expect(serialized).not.toContain("authorization");
  });
});

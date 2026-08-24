import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createNeonMemberSyncRepository } from "./repository";

type QueryResult = { rows: unknown[] };

class RecordingDatabase {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly results: QueryResult[]) {}

  async execute(query: SQL): Promise<QueryResult> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });
    return this.results.shift() ?? { rows: [] };
  }
}

describe("Discord member sync repository SQL boundary", () => {
  test("applies a complete snapshot with one atomic database statement", async () => {
    const database = new RecordingDatabase([
      { rows: [{ memberCount: 1, activeMemberCount: 1, botCount: 0 }] },
    ]);
    const repository = createNeonMemberSyncRepository(database);

    await expect(
      repository.applySuccessfulSnapshot({
        runId: "run-1",
        guildId: "guild-1",
        verifiedRoleId: "role-verified",
        roles: [
          {
            guildId: "guild-1",
            roleId: "role-verified",
            name: "Verified Customer",
            color: 5,
            position: 3,
            managed: false,
            permissions: "0",
          },
        ],
        members: [
          {
            guildId: "guild-1",
            discordUserId: "user-1",
            username: "rayuser",
            globalName: "Ray User",
            guildDisplayName: "Ray User",
            avatarHash: "user:avatar-1",
            joinedAt: new Date("2026-08-20T00:00:00.000Z"),
            roleIds: ["role-verified"],
            isBot: false,
          },
        ],
        completedAt: new Date("2026-08-24T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ memberCount: 1, activeMemberCount: 1, botCount: 0 });

    expect(database.queries).toHaveLength(1);
    expect(database.queries[0].sql).toContain("role_input AS");
    expect(database.queries[0].sql).toContain("members_marked_left AS");
    expect(database.queries[0].sql).toContain("completed_run AS");
    const parameters = JSON.stringify(database.queries[0].params);
    expect(parameters).not.toContain("bot-token");
    expect(parameters).not.toContain("@example.com");
    expect(parameters).not.toContain("message_content");
    expect(parameters).not.toContain("raw Discord response");
  });

  test("returns the exact running lease instead of guessing an ID", async () => {
    const database = new RecordingDatabase([
      { rows: [] },
      {
        rows: [
          {
            runId: "existing-run",
            startedAt: new Date("2026-08-24T00:00:00.000Z"),
          },
        ],
      },
    ]);
    const repository = createNeonMemberSyncRepository(database);

    await expect(
      repository.claimRun({
        guildId: "guild-1",
        trigger: "cron",
        requestedBy: null,
        now: new Date("2026-08-24T00:05:00.000Z"),
        staleBefore: new Date("2026-08-23T23:50:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "already-running",
      runId: "existing-run",
      startedAt: new Date("2026-08-24T00:00:00.000Z"),
    });
    expect(database.queries).toHaveLength(2);
  });
});

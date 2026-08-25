// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  recordMigrationBaseline,
  runTransactionalMigrations,
} from "./neon-transactional-migrations.mjs";

type QueuedQuery = { text: string; params: unknown[] };

function pgliteHttpAdapter(client: PGlite) {
  return {
    async query(text: string, params: unknown[] = []) {
      return (await client.query(text, params)).rows;
    },
    async transaction(
      build: (transaction: {
        query(text: string, params?: unknown[]): QueuedQuery;
      }) => QueuedQuery[],
    ) {
      const queued = build({
        query: (text, params = []) => ({ text, params }),
      });

      return client.transaction(async (transaction) => {
        const results = [];
        for (const query of queued) {
          results.push((await transaction.query(query.text, query.params)).rows);
        }
        return results;
      });
    },
  };
}

describe("transactional Neon migrations", () => {
  let client: PGlite;

  beforeEach(() => {
    client = new PGlite();
  });

  afterEach(async () => {
    await client.close();
  });

  test("rolls back migration DDL and its tracking row when a later statement fails", async () => {
    const database = pgliteHttpAdapter(client);
    const brokenMigration = {
      folderMillis: 1_700_000_000_000,
      hash: "a".repeat(64),
      sql: [
        "create table atomic_probe (id integer primary key)",
        "insert into table_that_does_not_exist values (1)",
      ],
    };

    await expect(
      runTransactionalMigrations(database, [brokenMigration]),
    ).rejects.toThrow();

    const table = await client.query<{ name: string | null }>(
      "select to_regclass('public.atomic_probe')::text as name",
    );
    const trackingTable = await client.query<{ name: string | null }>(
      "select to_regclass('drizzle.__drizzle_migrations')::text as name",
    );
    expect(table.rows[0].name).toBeNull();
    expect(trackingTable.rows[0].name).toBeNull();
  });

  test("can retry a corrected migration and records it exactly once", async () => {
    const database = pgliteHttpAdapter(client);
    const migration = {
      folderMillis: 1_700_000_000_001,
      hash: "b".repeat(64),
      sql: ["create table retry_probe (id integer primary key)"],
    };

    await runTransactionalMigrations(database, [migration]);
    await runTransactionalMigrations(database, [migration]);

    const tracked = await client.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations where created_at = $1",
      [migration.folderMillis],
    );
    expect(tracked.rows[0].count).toBe(1);
  });

  test("rejects a recorded timestamp whose migration hash has changed", async () => {
    const database = pgliteHttpAdapter(client);
    const folderMillis = 1_700_000_000_002;
    await runTransactionalMigrations(database, [
      {
        folderMillis,
        hash: "c".repeat(64),
        sql: ["create table hash_probe (id integer primary key)"],
      },
    ]);

    await expect(
      runTransactionalMigrations(database, [
        {
          folderMillis,
          hash: "d".repeat(64),
          sql: ["create table hash_probe_changed (id integer primary key)"],
        },
      ]),
    ).rejects.toThrow(/different recorded hash/i);

    const changedTable = await client.query<{ name: string | null }>(
      "select to_regclass('public.hash_probe_changed')::text as name",
    );
    expect(changedTable.rows[0].name).toBeNull();
  });

  test("records a verified baseline idempotently without running its SQL", async () => {
    const database = pgliteHttpAdapter(client);
    const baseline = {
      folderMillis: 1_700_000_000_003,
      hash: "e".repeat(64),
      sql: ["create table must_not_run (id integer primary key)"],
    };

    await expect(recordMigrationBaseline(database, baseline)).resolves.toBe("recorded");
    await expect(recordMigrationBaseline(database, baseline)).resolves.toBe(
      "already-recorded",
    );

    const table = await client.query<{ name: string | null }>(
      "select to_regclass('public.must_not_run')::text as name",
    );
    const tracked = await client.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations where created_at = $1",
      [baseline.folderMillis],
    );
    expect(table.rows[0].name).toBeNull();
    expect(tracked.rows[0].count).toBe(1);
  });

  test("applies the checked-in domain query migration atomically", async () => {
    const database = pgliteHttpAdapter(client);
    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });

    await runTransactionalMigrations(database, migrations);

    const tables = await client.query<{ query: string | null; conversion: string | null }>(
      `select
        to_regclass('public.domain_query_requests')::text as query,
        to_regclass('public.domain_conversion_events')::text as conversion`,
    );
    const indexes = await client.query<{ indexname: string }>(
      `select indexname
       from pg_indexes
       where indexname in (
         'domain_query_requests_interaction_key',
         'domain_conversion_events_request_action_key'
       )
       order by indexname`,
    );

    expect(tables.rows[0]).toEqual({
      query: "domain_query_requests",
      conversion: "domain_conversion_events",
    });
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      "domain_conversion_events_request_action_key",
      "domain_query_requests_interaction_key",
    ]);
  });
});

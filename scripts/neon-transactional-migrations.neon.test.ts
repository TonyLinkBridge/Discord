// @vitest-environment node

import { readFile } from "node:fs/promises";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  assertBaselineMatchesSnapshot,
  inspectBaselineSchema,
} from "./baseline-schema.mjs";
import {
  recordMigrationBaseline,
  runTransactionalMigrations,
} from "./neon-transactional-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();
const enabled =
  process.env.RUN_NEON_MIGRATION_E2E === "1" &&
  process.env.NEON_BRANCH_KIND === "verification-test" &&
  Boolean(databaseUrl);
const describeNeon = enabled ? describe : describe.skip;

describeNeon("transactional migration behavior on disposable Neon", () => {
  const suffix = `${Date.now()}_${process.pid}`;
  const rollbackTable = `__rayname_atomic_probe_${suffix}`;
  const concurrentTable = `__rayname_concurrent_probe_${suffix}`;
  const rollbackMillis = Date.now() + 10_000_000;
  const concurrentMillis = rollbackMillis + 1;
  let sql: NeonQueryFunction<false, false>;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    sql = neon(databaseUrl);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.transaction((transaction) => [
      transaction.query(`drop table if exists public.${rollbackTable}`),
      transaction.query(`drop table if exists public.${concurrentTable}`),
      transaction.query(
        "delete from drizzle.__drizzle_migrations where created_at = any($1::bigint[])",
        [[rollbackMillis, concurrentMillis]],
      ),
    ]);
  });

  test("rolls back a failed migration, supports retry, and serializes concurrent runs", async () => {
    await expect(
      runTransactionalMigrations(sql, [
        {
          folderMillis: rollbackMillis,
          hash: "1".repeat(64),
          sql: [
            `create table public.${rollbackTable} (id integer primary key)`,
            `insert into public.__rayname_missing_${suffix} values (1)`,
          ],
        },
      ]),
    ).rejects.toThrow();

    const [rolledBackTable] = await sql.query(
      "select to_regclass($1)::text as name",
      [`public.${rollbackTable}`],
    );
    const [rolledBackTracking] = await sql.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where created_at=$1",
      [rollbackMillis],
    );
    expect(rolledBackTable.name).toBeNull();
    expect(rolledBackTracking.count).toBe(0);

    const correctedMigration = {
      folderMillis: rollbackMillis,
      hash: "2".repeat(64),
      sql: [`create table public.${rollbackTable} (id integer primary key)`],
    };
    await runTransactionalMigrations(sql, [correctedMigration]);
    await runTransactionalMigrations(sql, [correctedMigration]);

    const concurrentMigration = {
      folderMillis: concurrentMillis,
      hash: "3".repeat(64),
      sql: [`create table public.${concurrentTable} (id integer primary key)`],
    };
    await Promise.all([
      runTransactionalMigrations(sql, [concurrentMigration]),
      runTransactionalMigrations(sql, [concurrentMigration]),
    ]);

    const [retryTracking] = await sql.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where created_at=$1",
      [rollbackMillis],
    );
    const [concurrentTracking] = await sql.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where created_at=$1",
      [concurrentMillis],
    );
    expect(retryTracking.count).toBe(1);
    expect(concurrentTracking.count).toBe(1);
  });

  test("accepts the evolved branch baseline and reruns project migrations idempotently", async () => {
    const snapshot = JSON.parse(
      await readFile(
        new URL("../drizzle/meta/0000_snapshot.json", import.meta.url),
        "utf8",
      ),
    );
    const catalog = await inspectBaselineSchema(sql, snapshot);
    expect(() => assertBaselineMatchesSnapshot(snapshot, catalog)).not.toThrow();

    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
    await expect(recordMigrationBaseline(sql, migrations[0])).resolves.toBe(
      "already-recorded",
    );
    await runTransactionalMigrations(sql, migrations);
    await runTransactionalMigrations(sql, migrations);
  });
});

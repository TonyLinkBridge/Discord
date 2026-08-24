import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

const databaseUrl = process.env.DATABASE_URL?.trim();

const expectedSchema = {
  constraints: [
    "discord_role_operations_verification_request_id_verification_re",
    "verification_requests_discord_user_id_discord_members_discord_u",
  ],
  enums: ["role_operation", "role_operation_status", "verification_status"],
  indexes: [
    "discord_role_operations_request_role_operation_key",
    "verification_requests_one_active_per_member",
  ],
  tables: [
    "admin_audit_events",
    "discord_interactions",
    "discord_members",
    "discord_role_operations",
    "verification_requests",
  ],
};

function hasExactValues(rows, key, expected) {
  const actual = new Set(rows.map((row) => row[key]));
  return actual.size === expected.length && expected.every((value) => actual.has(value));
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required to baseline database migrations");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(databaseUrl);
    const [constraints, enums, indexes, tables] = await Promise.all([
      sql.query(
        "select conname from pg_constraint where conname = any($1) order by conname",
        [expectedSchema.constraints],
      ),
      sql.query(
        "select typname from pg_type where typname = any($1) order by typname",
        [expectedSchema.enums],
      ),
      sql.query(
        "select indexname from pg_indexes where schemaname=$1 and indexname = any($2) order by indexname",
        ["public", expectedSchema.indexes],
      ),
      sql.query(
        "select tablename from pg_tables where schemaname=$1 and tablename = any($2) order by tablename",
        ["public", expectedSchema.tables],
      ),
    ]);

    const matchesExistingSchema =
      hasExactValues(constraints, "conname", expectedSchema.constraints) &&
      hasExactValues(enums, "typname", expectedSchema.enums) &&
      hasExactValues(indexes, "indexname", expectedSchema.indexes) &&
      hasExactValues(tables, "tablename", expectedSchema.tables);

    if (!matchesExistingSchema) {
      throw new Error(
        "Existing verification schema does not match migration 0000; refusing to baseline",
      );
    }

    await sql.query("create schema if not exists drizzle");
    await sql.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);

    const baseline = readMigrationFiles({ migrationsFolder: "./drizzle" })[0];
    const existing = await sql.query(
      "select hash from drizzle.__drizzle_migrations where created_at=$1",
      [baseline.folderMillis],
    );

    if (existing.some((row) => row.hash !== baseline.hash)) {
      throw new Error("Migration 0000 has a different recorded hash; refusing to baseline");
    }

    if (existing.length === 0) {
      await sql.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values($1,$2)",
        [baseline.hash, baseline.folderMillis],
      );
      console.log("Migration 0000 baseline recorded successfully");
    } else {
      console.log("Migration 0000 baseline is already recorded");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database baseline error";
    console.error(message.replaceAll(databaseUrl, "[REDACTED_DATABASE_URL]"));
    process.exitCode = 1;
  }
}

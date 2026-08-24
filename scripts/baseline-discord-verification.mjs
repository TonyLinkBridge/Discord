import { readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

import {
  assertBaselineMatchesSnapshot,
  inspectBaselineSchema,
} from "./baseline-schema.mjs";
import { recordMigrationBaseline } from "./neon-transactional-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required to baseline database migrations");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(databaseUrl);
    const snapshot = JSON.parse(
      await readFile(
        new URL("../drizzle/meta/0000_snapshot.json", import.meta.url),
        "utf8",
      ),
    );
    const catalog = await inspectBaselineSchema(sql, snapshot);
    assertBaselineMatchesSnapshot(snapshot, catalog);

    const baseline = readMigrationFiles({ migrationsFolder: "./drizzle" })[0];
    const outcome = await recordMigrationBaseline(sql, baseline);
    console.log(
      outcome === "recorded"
        ? "Migration 0000 baseline recorded successfully"
        : "Migration 0000 baseline is already recorded",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database baseline error";
    console.error(message.replaceAll(databaseUrl, "[REDACTED_DATABASE_URL]"));
    process.exitCode = 1;
  }
}

import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { runTransactionalMigrations } from "./neon-transactional-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run database migrations");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(databaseUrl);
    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });

    await runTransactionalMigrations(sql, migrations);
    console.log("Database migrations applied successfully");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database migration error";
    console.error(message.replaceAll(databaseUrl, "[REDACTED_DATABASE_URL]"));
    process.exitCode = 1;
  }
}

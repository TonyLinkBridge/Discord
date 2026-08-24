export type MigrationFile = {
  folderMillis: number;
  hash: string;
  sql: string[];
};

export function buildAtomicMigrationBlock(migration: MigrationFile): string;
export function runTransactionalMigrations(
  sql: unknown,
  migrations: readonly MigrationFile[],
): Promise<void>;
export function recordMigrationBaseline(
  sql: unknown,
  migration: MigrationFile,
): Promise<"recorded" | "already-recorded">;

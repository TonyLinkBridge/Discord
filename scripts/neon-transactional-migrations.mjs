const migrationLockId = 7_318_419_147;
const migrationBlockTag = "$rayname_migration$";

function assertTrustedMigration(migration) {
  if (!Number.isSafeInteger(migration.folderMillis) || migration.folderMillis <= 0) {
    throw new Error("Migration timestamp must be a positive safe integer");
  }
  if (!/^[a-f0-9]{64}$/.test(migration.hash)) {
    throw new Error(`Migration ${migration.folderMillis} has an invalid hash`);
  }
  if (!Array.isArray(migration.sql) || migration.sql.length === 0) {
    throw new Error(`Migration ${migration.folderMillis} has no SQL statements`);
  }
  if (migration.sql.some((statement) => statement.includes(migrationBlockTag))) {
    throw new Error(
      `Migration ${migration.folderMillis} contains the reserved transaction block tag`,
    );
  }
}

export function buildAtomicMigrationBlock(migration) {
  assertTrustedMigration(migration);

  const statements = migration.sql
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => statement.replace(/;+\s*$/, ""))
    .join(";\n");

  if (!statements) {
    throw new Error(`Migration ${migration.folderMillis} has no SQL statements`);
  }

  return `
do ${migrationBlockTag}
begin
  if exists (
    select 1
    from drizzle.__drizzle_migrations
    where created_at = ${migration.folderMillis}
      and hash <> '${migration.hash}'
  ) then
    raise exception 'Migration ${migration.folderMillis} has a different recorded hash';
  end if;

  if not exists (
    select 1
    from drizzle.__drizzle_migrations
    where created_at = ${migration.folderMillis}
      and hash = '${migration.hash}'
  ) then
    ${statements};
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values ('${migration.hash}', ${migration.folderMillis});
  end if;
end
${migrationBlockTag};
`;
}

function buildBaselineRecordBlock(migration) {
  assertTrustedMigration(migration);

  return `
do ${migrationBlockTag}
begin
  if exists (
    select 1
    from drizzle.__drizzle_migrations
    where created_at = ${migration.folderMillis}
      and hash <> '${migration.hash}'
  ) then
    raise exception 'Migration ${migration.folderMillis} has a different recorded hash';
  end if;

  if not exists (
    select 1
    from drizzle.__drizzle_migrations
    where created_at = ${migration.folderMillis}
      and hash = '${migration.hash}'
  ) then
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values ('${migration.hash}', ${migration.folderMillis});
  end if;
end
${migrationBlockTag};
`;
}

export async function ensureMigrationTable(sql) {
  await sql.transaction((transaction) => [
    transaction.query("create schema if not exists drizzle"),
    transaction.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `),
  ]);
}

export async function runTransactionalMigrations(sql, migrations) {
  await ensureMigrationTable(sql);

  if (migrations.length === 0) return;

  await sql.transaction((transaction) => [
    transaction.query("select pg_advisory_xact_lock($1)", [migrationLockId]),
    ...migrations.map((migration) =>
      transaction.query(buildAtomicMigrationBlock(migration)),
    ),
  ]);
}

export async function recordMigrationBaseline(sql, migration) {
  await ensureMigrationTable(sql);
  assertTrustedMigration(migration);

  const results = await sql.transaction((transaction) => [
    transaction.query("select pg_advisory_xact_lock($1)", [migrationLockId]),
    transaction.query(
      `
        select exists (
          select 1
          from drizzle.__drizzle_migrations
          where created_at = $1 and hash = $2
        ) as already_recorded
      `,
      [migration.folderMillis, migration.hash],
    ),
    transaction.query(buildBaselineRecordBlock(migration)),
  ]);

  return results[1][0]?.already_recorded ? "already-recorded" : "recorded";
}

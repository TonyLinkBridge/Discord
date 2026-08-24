// @vitest-environment node

import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  assertBaselineMatchesSnapshot,
  inspectBaselineSchema,
} from "./baseline-schema.mjs";

const snapshot = JSON.parse(
  await readFile(new URL("../drizzle/meta/0000_snapshot.json", import.meta.url), "utf8"),
);

function pgliteQueryAdapter(client: PGlite) {
  return {
    async query(text: string, params: unknown[] = []) {
      return (await client.query(text, params)).rows;
    },
  };
}

describe("migration 0000 baseline verification", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    const baseline = readMigrationFiles({ migrationsFolder: "drizzle" })[0];
    for (const statement of baseline.sql) {
      await client.exec(statement);
    }
  });

  afterEach(async () => {
    await client.close();
  });

  async function assertCurrentSchema() {
    const catalog = await inspectBaselineSchema(
      pgliteQueryAdapter(client),
      snapshot,
    );
    assertBaselineMatchesSnapshot(snapshot, catalog);
  }

  test("accepts the exact 0000 schema", async () => {
    await expect(assertCurrentSchema()).resolves.toBeUndefined();
  });

  test("allows later migrations to add unrelated objects and columns", async () => {
    const later = readMigrationFiles({ migrationsFolder: "drizzle" })[1];
    for (const statement of later.sql) {
      await client.exec(statement);
    }

    await expect(assertCurrentSchema()).resolves.toBeUndefined();
  });

  test("rejects changed column nullability and defaults", async () => {
    await client.exec(`
      alter table public.discord_members alter column guild_id drop not null;
      alter table public.discord_members alter column updated_at drop default;
    `);

    await expect(assertCurrentSchema()).rejects.toThrow(
      /discord_members\.(guild_id|updated_at)/i,
    );
  });

  test("rejects changed enum labels", async () => {
    await client.exec("alter type public.role_operation add value 'archive'");

    await expect(assertCurrentSchema()).rejects.toThrow(/role_operation/i);
  });

  test("rejects a foreign key with different delete behavior", async () => {
    await client.exec(`
      alter table public.verification_requests
        drop constraint verification_requests_discord_user_id_discord_members_discord_user_id_fk;
      alter table public.verification_requests
        add constraint verification_requests_discord_user_id_discord_members_discord_user_id_fk
        foreign key (discord_user_id)
        references public.discord_members(discord_user_id)
        on delete no action on update no action;
    `);

    await expect(assertCurrentSchema()).rejects.toThrow(
      /verification_requests_discord_user_id/i,
    );
  });

  test("rejects an index with different uniqueness", async () => {
    await client.exec(`
      drop index public.discord_role_operations_request_role_operation_key;
      create index discord_role_operations_request_role_operation_key
        on public.discord_role_operations using btree
        (verification_request_id, role_id, operation);
    `);

    await expect(assertCurrentSchema()).rejects.toThrow(
      /discord_role_operations_request_role_operation_key/i,
    );
  });

  test("does not accept a required table from another namespace", async () => {
    await client.exec(`
      create schema spoof;
      alter table public.discord_interactions set schema spoof;
    `);

    await expect(assertCurrentSchema()).rejects.toThrow(
      /public\.discord_interactions/i,
    );
  });
});

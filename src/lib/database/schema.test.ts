import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import {
  adminAuditEvents,
  discordGuildRoles,
  discordInteractions,
  discordMemberSyncRuns,
  discordMembers,
  discordRoleOperations,
  domainConversionAction,
  domainConversionEvents,
  domainQueryRequests,
  domainQueryStatus,
  domainQueryTier,
  roleOperation,
  roleOperationStatus,
  verificationRequests,
  verificationStatus,
} from "./schema";

describe("verification database schema", () => {
  test("defines the complete verification status lifecycle", () => {
    expect(verificationStatus.enumValues).toEqual([
      "pending",
      "processing",
      "approved",
      "rejected",
      "role_failed",
    ]);
    expect(roleOperation.enumValues).toEqual(["assign", "remove"]);
    expect(roleOperationStatus.enumValues).toEqual(["pending", "succeeded", "failed"]);
  });

  test("uses the expected persistent table names", () => {
    expect([
      getTableConfig(discordMembers).name,
      getTableConfig(verificationRequests).name,
      getTableConfig(discordRoleOperations).name,
      getTableConfig(discordInteractions).name,
      getTableConfig(adminAuditEvents).name,
    ]).toEqual([
      "discord_members",
      "verification_requests",
      "discord_role_operations",
      "discord_interactions",
      "admin_audit_events",
    ]);
  });

  test("prevents two active requests for one Discord member", () => {
    const index = getTableConfig(verificationRequests).indexes.find(
      ({ config }) => config.name === "verification_requests_one_active_per_member",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(1);
    expect(index?.config.where).toBeDefined();
  });

  test("makes each role operation idempotent for a request and role", () => {
    const index = getTableConfig(discordRoleOperations).indexes.find(
      ({ config }) => config.name === "discord_role_operations_request_role_operation_key",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(3);
  });

  test("keeps verification and role records attached to their parent records", () => {
    expect(getTableConfig(verificationRequests).foreignKeys).toHaveLength(1);
    expect(getTableConfig(discordRoleOperations).foreignKeys).toHaveLength(1);
  });

  test("exports the persistent Discord member sync tables", () => {
    expect([
      getTableConfig(discordMembers).name,
      getTableConfig(discordGuildRoles).name,
      getTableConfig(discordMemberSyncRuns).name,
    ]).toEqual([
      "discord_members",
      "discord_guild_roles",
      "discord_member_sync_runs",
    ]);
  });

  test("keeps one running sync per guild and stores only approved member facts", () => {
    const sql = readFileSync(
      "drizzle/0001_discord_member_sync.sql",
      "utf8",
    );

    expect(sql).toContain("discord_member_sync_runs_one_running_per_guild");
    expect(sql).toMatch(/WHERE\s+.*"status"\s*=\s*'running'/);
    expect(sql).toContain("membership_status");
    expect(sql).toContain("role_ids");
    expect(sql).not.toContain("message_content");
    expect(sql).not.toContain("member_email");
  });

  test("defines the domain query lifecycle and conversion actions", () => {
    expect(domainQueryTier.enumValues).toEqual(["member", "verified"]);
    expect(domainQueryStatus.enumValues).toEqual([
      "started",
      "succeeded",
      "failed",
      "quota_rejected",
    ]);
    expect(domainConversionAction.enumValues).toEqual([
      "register",
      "transfer",
      "full_intelligence",
      "continue_on_site",
    ]);
  });

  test("stores the safe domain query and conversion record shapes", () => {
    const query = getTableConfig(domainQueryRequests);
    const conversion = getTableConfig(domainConversionEvents);

    expect([query.name, conversion.name]).toEqual([
      "domain_query_requests",
      "domain_conversion_events",
    ]);
    expect(query.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "interaction_id",
        "guild_id",
        "discord_user_id",
        "normalized_domain",
        "tier",
        "status",
        "usage_day",
        "charged_at",
        "safe_error_code",
        "provider_summary",
        "result_snapshot",
      ]),
    );
    expect(conversion.foreignKeys).toHaveLength(1);
  });

  test("makes interactions and conversion actions idempotent and queryable", () => {
    const queryIndexes = getTableConfig(domainQueryRequests).indexes.map(
      ({ config }) => ({
        name: config.name,
        unique: config.unique,
        columns: config.columns.length,
      }),
    );
    const conversionIndexes = getTableConfig(domainConversionEvents).indexes.map(
      ({ config }) => ({
        name: config.name,
        unique: config.unique,
        columns: config.columns.length,
      }),
    );

    expect(queryIndexes).toEqual(
      expect.arrayContaining([
        {
          name: "domain_query_requests_interaction_key",
          unique: true,
          columns: 1,
        },
        {
          name: "domain_query_requests_usage_lookup",
          unique: false,
          columns: 4,
        },
        {
          name: "domain_query_requests_replay_lookup",
          unique: false,
          columns: 3,
        },
      ]),
    );
    expect(conversionIndexes).toContainEqual({
      name: "domain_conversion_events_request_action_key",
      unique: true,
      columns: 2,
    });
  });
});

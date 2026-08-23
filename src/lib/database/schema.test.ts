import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import {
  adminAuditEvents,
  discordInteractions,
  discordMembers,
  discordRoleOperations,
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
});

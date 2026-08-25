import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const verificationStatus = pgEnum("verification_status", [
  "pending",
  "processing",
  "approved",
  "rejected",
  "role_failed",
]);

export const roleOperation = pgEnum("role_operation", ["assign", "remove"]);

export const roleOperationStatus = pgEnum("role_operation_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const discordMembershipStatus = pgEnum("discord_membership_status", [
  "active",
  "left",
]);

export const discordSyncTrigger = pgEnum("discord_sync_trigger", [
  "cron",
  "manual",
]);

export const discordSyncStatus = pgEnum("discord_sync_status", [
  "running",
  "succeeded",
  "failed",
]);

export const domainQueryTier = pgEnum("domain_query_tier", [
  "member",
  "verified",
]);

export const domainQueryStatus = pgEnum("domain_query_status", [
  "started",
  "succeeded",
  "failed",
  "quota_rejected",
]);

export const domainConversionAction = pgEnum("domain_conversion_action", [
  "register",
  "transfer",
  "full_intelligence",
  "continue_on_site",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const discordMembers = pgTable("discord_members", {
  discordUserId: text("discord_user_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  displayName: text("display_name").notNull(),
  discordHandle: text("discord_handle").notNull(),
  avatarUrl: text("avatar_url"),
  username: text("username"),
  globalName: text("global_name"),
  guildDisplayName: text("guild_display_name"),
  avatarHash: text("avatar_hash"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  roleIds: jsonb("role_ids").$type<string[]>().default([]).notNull(),
  isBot: boolean("is_bot").default(false).notNull(),
  membershipStatus: discordMembershipStatus("membership_status")
    .default("active")
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const discordGuildRoles = pgTable(
  "discord_guild_roles",
  {
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
    name: text("name").notNull(),
    color: integer("color").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    managed: boolean("managed").default(false).notNull(),
    permissions: text("permissions").default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.roleId] })],
);

export const discordMemberSyncRuns = pgTable(
  "discord_member_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    trigger: discordSyncTrigger("trigger").notNull(),
    status: discordSyncStatus("status").default("running").notNull(),
    requestedBy: text("requested_by"),
    memberCount: integer("member_count"),
    activeMemberCount: integer("active_member_count"),
    botCount: integer("bot_count"),
    safeErrorCode: text("safe_error_code"),
    safeErrorMessage: text("safe_error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("discord_member_sync_runs_one_running_per_guild")
      .on(table.guildId)
      .where(sql`${table.status} = 'running'`),
  ],
);

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discordUserId: text("discord_user_id")
      .notNull()
      .references(() => discordMembers.discordUserId, { onDelete: "cascade" }),
    status: verificationStatus("status").default("pending").notNull(),
    emailCiphertext: text("email_ciphertext"),
    emailIv: text("email_iv"),
    emailAuthTag: text("email_auth_tag"),
    emailLookupHash: text("email_lookup_hash"),
    domain: text("domain"),
    reviewReason: text("review_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    roleAssignedAt: timestamp("role_assigned_at", { withTimezone: true }),
    sensitiveExpiresAt: timestamp("sensitive_expires_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("verification_requests_one_active_per_member")
      .on(table.discordUserId)
      .where(
        sql`${table.status} in ('pending', 'processing', 'role_failed')`,
      ),
  ],
);

export const discordRoleOperations = pgTable(
  "discord_role_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    verificationRequestId: uuid("verification_request_id")
      .notNull()
      .references(() => verificationRequests.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    roleId: text("role_id").notNull(),
    operation: roleOperation("operation").notNull(),
    status: roleOperationStatus("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("discord_role_operations_request_role_operation_key").on(
      table.verificationRequestId,
      table.roleId,
      table.operation,
    ),
  ],
);

export const discordInteractions = pgTable("discord_interactions", {
  interactionId: text("interaction_id").primaryKey(),
  interactionType: integer("interaction_type").notNull(),
  discordUserId: text("discord_user_id"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});

export const domainQueryRequests = pgTable(
  "domain_query_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interactionId: text("interaction_id").notNull(),
    guildId: text("guild_id").notNull(),
    discordUserId: text("discord_user_id").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    tier: domainQueryTier("tier").notNull(),
    status: domainQueryStatus("status").default("started").notNull(),
    usageDay: date("usage_day", { mode: "string" }).notNull(),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
    safeErrorCode: text("safe_error_code"),
    providerSummary: jsonb("provider_summary")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("domain_query_requests_interaction_key").on(
      table.interactionId,
    ),
    index("domain_query_requests_usage_lookup").on(
      table.guildId,
      table.discordUserId,
      table.usageDay,
      table.status,
    ),
    index("domain_query_requests_replay_lookup").on(
      table.discordUserId,
      table.normalizedDomain,
      table.completedAt,
    ),
  ],
);

export const domainConversionEvents = pgTable(
  "domain_conversion_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queryRequestId: uuid("query_request_id")
      .notNull()
      .references(() => domainQueryRequests.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    action: domainConversionAction("action").notNull(),
    destinationUrl: text("destination_url").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("domain_conversion_events_request_action_key").on(
      table.queryRequestId,
      table.action,
    ),
  ],
);

export const adminAuditEvents = pgTable("admin_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

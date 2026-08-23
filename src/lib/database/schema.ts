import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const discordMembers = pgTable("discord_members", {
  discordUserId: text("discord_user_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  displayName: text("display_name").notNull(),
  discordHandle: text("discord_handle").notNull(),
  avatarUrl: text("avatar_url"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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

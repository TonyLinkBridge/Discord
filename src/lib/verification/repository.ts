import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type {
  ClaimRoleAssignmentResult,
  RoleOperationRecord,
  StoredVerificationRequest,
  SubmitVerificationInput,
  SubmitVerificationResult,
  VerificationRepository,
} from "./types";

export type {
  ClaimRoleAssignmentResult,
  StoredVerificationRequest,
  SubmitVerificationInput,
  SubmitVerificationResult,
  VerificationRepository,
} from "./types";

type QueryResult = { rows: unknown[] } | unknown[];
export type VerificationDatabase = {
  execute(query: SQL): Promise<QueryResult>;
};

function resultRows<T>(result: QueryResult): T[] {
  return (Array.isArray(result) ? result : result.rows) as T[];
}

function date(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

type ReviewRow = Omit<
  StoredVerificationRequest,
  | "createdAt"
  | "updatedAt"
  | "reviewedAt"
  | "roleAssignedAt"
  | "sensitiveExpiresAt"
  | "encryptedEmail"
> & {
  emailCiphertext: string | null;
  emailIv: string | null;
  emailAuthTag: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  reviewedAt: Date | string | null;
  roleAssignedAt: Date | string | null;
  sensitiveExpiresAt: Date | string | null;
};

function mapReviewRow(row: ReviewRow): StoredVerificationRequest {
  return {
    id: row.id,
    discordUserId: row.discordUserId,
    guildId: row.guildId,
    displayName: row.displayName,
    discordHandle: row.discordHandle,
    encryptedEmail:
      row.emailCiphertext && row.emailIv && row.emailAuthTag
        ? {
            ciphertext: row.emailCiphertext,
            iv: row.emailIv,
            authTag: row.emailAuthTag,
          }
        : null,
    emailLookupHash: row.emailLookupHash,
    domain: row.domain,
    status: row.status,
    reviewReason: row.reviewReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: date(row.reviewedAt),
    roleAssignedAt: date(row.roleAssignedAt),
    sensitiveExpiresAt: date(row.sensitiveExpiresAt),
    safeFailure: row.safeFailure,
    createdAt: date(row.createdAt)!,
    updatedAt: date(row.updatedAt)!,
  };
}

type OperationRow = Omit<
  RoleOperationRecord,
  "lastAttemptAt" | "completedAt" | "createdAt"
> & {
  lastAttemptAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
};

function mapOperation(row: OperationRow): RoleOperationRecord {
  return {
    ...row,
    lastAttemptAt: date(row.lastAttemptAt),
    completedAt: date(row.completedAt),
    createdAt: date(row.createdAt)!,
  };
}

const reviewColumns = sql`
  vr.id,
  vr.discord_user_id AS "discordUserId",
  dm.guild_id AS "guildId",
  dm.display_name AS "displayName",
  dm.discord_handle AS "discordHandle",
  vr.email_ciphertext AS "emailCiphertext",
  vr.email_iv AS "emailIv",
  vr.email_auth_tag AS "emailAuthTag",
  vr.email_lookup_hash AS "emailLookupHash",
  vr.domain,
  vr.status,
  vr.review_reason AS "reviewReason",
  vr.reviewed_by AS "reviewedBy",
  vr.reviewed_at AS "reviewedAt",
  vr.role_assigned_at AS "roleAssignedAt",
  vr.sensitive_expires_at AS "sensitiveExpiresAt",
  ro.last_error_message AS "safeFailure",
  vr.created_at AS "createdAt",
  vr.updated_at AS "updatedAt"
`;

export function createNeonVerificationRepository(
  database: VerificationDatabase,
): VerificationRepository {
  return {
    async claimInteraction(input) {
      const result = await database.execute(sql`
        INSERT INTO discord_interactions (
          interaction_id, interaction_type, discord_user_id, received_at
        ) VALUES (
          ${input.interactionId}, ${input.interactionType}, ${input.discordUserId}, now()
        )
        ON CONFLICT (interaction_id) DO NOTHING
        RETURNING interaction_id
      `);
      return resultRows(result).length === 1 ? "claimed" : "duplicate";
    },

    async getMemberVerificationState(discordUserId) {
      const result = await database.execute(sql`
        SELECT
          dm.verified_at AS "verifiedAt",
          vr.status
        FROM discord_members dm
        LEFT JOIN LATERAL (
          SELECT status
          FROM verification_requests
          WHERE discord_user_id = dm.discord_user_id
            AND status IN ('pending', 'processing', 'role_failed')
          ORDER BY created_at DESC
          LIMIT 1
        ) vr ON true
        WHERE dm.discord_user_id = ${discordUserId}
      `);
      const row = resultRows<{ verifiedAt: Date | string | null; status: string | null }>(result)[0];
      if (!row) return { status: "none" };
      if (row.verifiedAt) return { status: "verified" };
      if (row.status === "pending" || row.status === "processing" || row.status === "role_failed") {
        return { status: row.status };
      }
      return { status: "none" };
    },

    async submit(input: SubmitVerificationInput): Promise<SubmitVerificationResult> {
      await database.execute(sql`
        INSERT INTO discord_members (
          discord_user_id, guild_id, display_name, discord_handle, created_at, updated_at
        ) VALUES (
          ${input.discordUserId}, ${input.guildId}, ${input.displayName},
          ${input.discordHandle}, ${input.now}, ${input.now}
        )
        ON CONFLICT (discord_user_id) DO UPDATE SET
          guild_id = EXCLUDED.guild_id,
          display_name = EXCLUDED.display_name,
          discord_handle = EXCLUDED.discord_handle,
          updated_at = EXCLUDED.updated_at
      `);
      const memberState = await this.getMemberVerificationState(input.discordUserId);
      if (memberState.status === "verified") return { status: "already-verified" };

      const inserted = await database.execute(sql`
        INSERT INTO verification_requests (
          id, discord_user_id, status, email_ciphertext, email_iv,
          email_auth_tag, email_lookup_hash, domain, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${input.discordUserId}, 'pending',
          ${input.encryptedEmail.ciphertext}, ${input.encryptedEmail.iv},
          ${input.encryptedEmail.authTag}, ${input.emailLookupHash}, ${input.domain},
          ${input.now}, ${input.now}
        )
        ON CONFLICT (discord_user_id)
          WHERE status IN ('pending', 'processing', 'role_failed')
          DO NOTHING
        RETURNING id
      `);
      const created = resultRows<{ id: string }>(inserted)[0];
      if (created) {
        return { status: "created", requestId: created.id, requestStatus: "pending" };
      }
      const active = await database.execute(sql`
        SELECT id, status
        FROM verification_requests
        WHERE discord_user_id = ${input.discordUserId}
          AND status IN ('pending', 'processing', 'role_failed')
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const row = resultRows<{ id: string; status: "pending" | "processing" | "role_failed" }>(active)[0];
      if (!row) throw new Error("Active verification request could not be reconciled");
      return { status: "active", requestId: row.id, requestStatus: row.status };
    },

    async listForAdmin() {
      const result = await database.execute(sql`
        SELECT ${reviewColumns}
        FROM verification_requests vr
        JOIN discord_members dm ON dm.discord_user_id = vr.discord_user_id
        LEFT JOIN discord_role_operations ro
          ON ro.verification_request_id = vr.id AND ro.operation = 'assign'
        ORDER BY vr.created_at DESC
      `);
      return resultRows<ReviewRow>(result).map(mapReviewRow);
    },

    async claimRoleAssignment(input): Promise<ClaimRoleAssignmentResult> {
      const result = await database.execute(sql`
        WITH claimed AS (
          UPDATE verification_requests
          SET status = 'processing', reviewed_by = ${input.actorId},
              reviewed_at = ${input.now}, updated_at = ${input.now}
          WHERE id = ${input.requestId}
            AND status = ${input.allowedStatus}
          RETURNING *
        ), operation AS (
          INSERT INTO discord_role_operations (
            id, verification_request_id, discord_user_id, role_id, operation,
            status, attempt_count, last_attempt_at, created_at
          )
          SELECT gen_random_uuid(), id, discord_user_id, ${input.roleId}, 'assign',
                 'pending', 1, ${input.now}, ${input.now}
          FROM claimed
          ON CONFLICT (verification_request_id, role_id, operation)
          DO UPDATE SET status = 'pending',
                        attempt_count = discord_role_operations.attempt_count + 1,
                        last_error_code = NULL,
                        last_error_message = NULL,
                        last_attempt_at = EXCLUDED.last_attempt_at,
                        completed_at = NULL
          RETURNING *
        )
        SELECT
          c.id AS "requestId", c.discord_user_id AS "discordUserId",
          dm.guild_id AS "guildId", dm.display_name AS "displayName",
          dm.discord_handle AS "discordHandle",
          c.email_ciphertext AS "emailCiphertext", c.email_iv AS "emailIv",
          c.email_auth_tag AS "emailAuthTag", c.email_lookup_hash AS "emailLookupHash",
          c.domain, c.status, c.review_reason AS "reviewReason",
          c.reviewed_by AS "reviewedBy", c.reviewed_at AS "reviewedAt",
          c.role_assigned_at AS "roleAssignedAt",
          c.sensitive_expires_at AS "sensitiveExpiresAt",
          NULL::text AS "safeFailure", c.created_at AS "requestCreatedAt",
          c.updated_at AS "updatedAt",
          o.id AS "operationId", o.verification_request_id AS "verificationRequestId",
          o.role_id AS "roleId", o.operation, o.status AS "operationStatus",
          o.attempt_count AS "attemptCount", o.last_error_code AS "lastErrorCode",
          o.last_error_message AS "lastErrorMessage", o.last_attempt_at AS "lastAttemptAt",
          o.completed_at AS "completedAt", o.created_at AS "operationCreatedAt"
        FROM claimed c
        JOIN operation o ON o.verification_request_id = c.id
        JOIN discord_members dm ON dm.discord_user_id = c.discord_user_id
      `);
      const row = resultRows<Record<string, unknown>>(result)[0];
      if (row) {
        const request = mapReviewRow({
          id: row.requestId as string,
          discordUserId: row.discordUserId as string,
          guildId: row.guildId as string,
          displayName: row.displayName as string,
          discordHandle: row.discordHandle as string,
          emailCiphertext: row.emailCiphertext as string | null,
          emailIv: row.emailIv as string | null,
          emailAuthTag: row.emailAuthTag as string | null,
          emailLookupHash: row.emailLookupHash as string | null,
          domain: row.domain as string | null,
          status: row.status as StoredVerificationRequest["status"],
          reviewReason: row.reviewReason as string | null,
          reviewedBy: row.reviewedBy as string | null,
          reviewedAt: row.reviewedAt as Date | string | null,
          roleAssignedAt: row.roleAssignedAt as Date | string | null,
          sensitiveExpiresAt: row.sensitiveExpiresAt as Date | string | null,
          safeFailure: null,
          createdAt: row.requestCreatedAt as Date | string,
          updatedAt: row.updatedAt as Date | string,
        });
        const operation = mapOperation({
          id: row.operationId as string,
          verificationRequestId: row.verificationRequestId as string,
          discordUserId: row.discordUserId as string,
          roleId: row.roleId as string,
          operation: row.operation as "assign",
          status: row.operationStatus as RoleOperationRecord["status"],
          attemptCount: row.attemptCount as number,
          lastErrorCode: row.lastErrorCode as string | null,
          lastErrorMessage: row.lastErrorMessage as string | null,
          lastAttemptAt: row.lastAttemptAt as Date | string | null,
          completedAt: row.completedAt as Date | string | null,
          createdAt: row.operationCreatedAt as Date | string,
        });
        return { status: "claimed", request, operation };
      }
      const current = await database.execute(sql`
        SELECT status FROM verification_requests WHERE id = ${input.requestId}
      `);
      const status = resultRows<{ status: string }>(current)[0]?.status;
      if (!status) return { status: "not-found" };
      if (status === "processing") return { status: "already-processing" };
      if (status === "approved") return { status: "already-approved" };
      return { status: "not-reviewable" };
    },

    async completeRoleAssignment(input) {
      await database.execute(sql`
        WITH completed_operation AS (
          UPDATE discord_role_operations
          SET status = 'succeeded', completed_at = ${input.now},
              last_error_code = NULL, last_error_message = NULL
          WHERE id = ${input.operationId}
            AND verification_request_id = ${input.requestId}
          RETURNING verification_request_id
        ), completed_request AS (
          UPDATE verification_requests
          SET status = 'approved', role_assigned_at = ${input.now},
              sensitive_expires_at = ${input.now}::timestamptz + interval '90 days',
              updated_at = ${input.now}
          WHERE id IN (SELECT verification_request_id FROM completed_operation)
            AND status = 'processing'
          RETURNING id, discord_user_id
        ), updated_member AS (
          UPDATE discord_members
          SET verified_at = ${input.now}, updated_at = ${input.now}
          WHERE discord_user_id IN (SELECT discord_user_id FROM completed_request)
          RETURNING discord_user_id
        )
        INSERT INTO admin_audit_events (
          id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
        )
        SELECT gen_random_uuid(), ${input.actorId}, 'verification_request', id::text,
               'verification.approved', 'succeeded', '{}'::jsonb, ${input.now}
        FROM completed_request
        WHERE NOT EXISTS (
          SELECT 1 FROM admin_audit_events
          WHERE entity_id = completed_request.id::text
            AND action = 'verification.approved' AND outcome = 'succeeded'
        )
      `);
    },

    async failRoleAssignment(input) {
      await database.execute(sql`
        WITH failed_operation AS (
          UPDATE discord_role_operations
          SET status = 'failed', last_error_code = ${input.code},
              last_error_message = ${input.safeMessage}, last_attempt_at = ${input.now}
          WHERE id = ${input.operationId}
            AND verification_request_id = ${input.requestId}
          RETURNING verification_request_id
        ), failed_request AS (
          UPDATE verification_requests
          SET status = 'role_failed', updated_at = ${input.now}
          WHERE id IN (SELECT verification_request_id FROM failed_operation)
            AND status = 'processing'
          RETURNING id
        )
        INSERT INTO admin_audit_events (
          id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
        )
        SELECT gen_random_uuid(), ${input.actorId}, 'verification_request', id::text,
               'verification.role_assignment', 'failed',
               jsonb_build_object('code', ${input.code}::text), ${input.now}
        FROM failed_request
      `);
    },

    async reject(input) {
      const result = await database.execute(sql`
        WITH rejected AS (
          UPDATE verification_requests
          SET status = 'rejected', review_reason = ${input.reason},
              reviewed_by = ${input.actorId}, reviewed_at = ${input.now},
              sensitive_expires_at = ${input.now}::timestamptz + interval '90 days',
              updated_at = ${input.now}
          WHERE id = ${input.requestId}
            AND status IN ('pending', 'role_failed')
          RETURNING id
        ), audit AS (
          INSERT INTO admin_audit_events (
            id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
          )
          SELECT gen_random_uuid(), ${input.actorId}, 'verification_request', id::text,
                 'verification.rejected', 'succeeded', '{}'::jsonb, ${input.now}
          FROM rejected
          RETURNING entity_id
        )
        SELECT id FROM rejected
      `);
      if (resultRows(result).length === 1) return "rejected";
      const current = await database.execute(sql`
        SELECT id FROM verification_requests WHERE id = ${input.requestId}
      `);
      return resultRows(current).length ? "not-reviewable" : "not-found";
    },

    async recordNotificationFailure(input) {
      await database.execute(sql`
        INSERT INTO admin_audit_events (
          id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
        ) VALUES (
          gen_random_uuid(), ${input.actorId}, 'verification_request', ${input.requestId},
          'verification.notification', 'failed',
          jsonb_build_object(
            'code', ${input.code}::text,
            'message', ${input.safeMessage}::text
          ),
          ${input.now}
        )
      `);
    },

    async purgeExpiredSensitiveData(now) {
      const result = await database.execute(sql`
        UPDATE verification_requests
        SET email_ciphertext = NULL, email_iv = NULL, email_auth_tag = NULL,
            email_lookup_hash = NULL, domain = NULL, updated_at = ${now}
        WHERE sensitive_expires_at <= ${now}
          AND (
            email_ciphertext IS NOT NULL OR email_iv IS NOT NULL OR
            email_auth_tag IS NOT NULL OR email_lookup_hash IS NOT NULL OR
            domain IS NOT NULL
          )
        RETURNING id
      `);
      return resultRows(result).length;
    },
  };
}

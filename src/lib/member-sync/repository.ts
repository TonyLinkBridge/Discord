import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type {
  DiscordFacts,
  MemberSyncRepository,
  MemberSyncViewStatus,
  SyncedDiscordMember,
} from "./types";

type QueryResult = { rows: unknown[] } | unknown[];

export type MemberSyncDatabase = {
  execute(query: SQL): Promise<unknown>;
};

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as QueryResult & { rows: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

type MemberRow = {
  discordUserId: string;
  username: string | null;
  globalName: string | null;
  guildDisplayName: string | null;
  displayName: string;
  discordHandle: string;
  avatarHash: string | null;
  joinedAt: Date | string | null;
  roleIds: unknown;
  roleNames: unknown;
  isBot: boolean;
  membershipStatus: "active" | "left";
  verifiedAt: Date | string | null;
  lastSeenAt: Date | string | null;
  leftAt: Date | string | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapMember(row: MemberRow): SyncedDiscordMember {
  return {
    discordUserId: row.discordUserId,
    username: row.username ?? row.discordHandle,
    globalName: row.globalName,
    guildDisplayName: row.guildDisplayName ?? row.displayName,
    avatarHash: row.avatarHash,
    joinedAt: iso(row.joinedAt),
    roleIds: stringArray(row.roleIds),
    roleNames: stringArray(row.roleNames),
    isBot: row.isBot,
    membershipStatus: row.membershipStatus,
    verifiedAt: iso(row.verifiedAt),
    lastSeenAt: iso(row.lastSeenAt),
    leftAt: iso(row.leftAt),
  };
}

export function createNeonMemberSyncRepository(
  database: MemberSyncDatabase,
): MemberSyncRepository {
  return {
    async claimRun(input) {
      const claimedResult = await database.execute(sql`
        WITH stale_run AS (
          UPDATE discord_member_sync_runs
          SET status = 'failed',
              safe_error_code = 'stale_run_recovered',
              safe_error_message = 'An abandoned member sync was safely closed',
              completed_at = ${input.now}
          WHERE guild_id = ${input.guildId}
            AND status = 'running'
            AND started_at < ${input.staleBefore}
          RETURNING id
        ), claimed_run AS (
          INSERT INTO discord_member_sync_runs (
            id, guild_id, trigger, status, requested_by, started_at
          )
          SELECT gen_random_uuid(), ${input.guildId}, ${input.trigger},
                 'running', ${input.requestedBy}, ${input.now}
          FROM (SELECT count(*) FROM stale_run) stale_dependency
          ON CONFLICT (guild_id) WHERE status = 'running' DO NOTHING
          RETURNING id AS "runId"
        )
        SELECT "runId" FROM claimed_run
      `);
      const claimed = resultRows<{ runId: string }>(claimedResult)[0];
      if (claimed) return { status: "claimed", runId: claimed.runId };

      const runningResult = await database.execute(sql`
        SELECT id AS "runId", started_at AS "startedAt"
        FROM discord_member_sync_runs
        WHERE guild_id = ${input.guildId} AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
      `);
      const running = resultRows<{
        runId: string;
        startedAt: Date | string;
      }>(runningResult)[0];
      if (!running) {
        throw new Error("Member sync lease could not be reconciled");
      }
      return {
        status: "already-running",
        runId: running.runId,
        startedAt: date(running.startedAt),
      };
    },

    async applySuccessfulSnapshot(input) {
      const rolePayload = input.roles.map((role) => ({
        role_id: role.roleId,
        name: role.name,
        color: role.color,
        position: role.position,
        managed: role.managed,
        permissions: role.permissions,
      }));
      const memberPayload = input.members.map((member) => ({
        discord_user_id: member.discordUserId,
        username: member.username,
        global_name: member.globalName,
        guild_display_name: member.guildDisplayName,
        avatar_hash: member.avatarHash,
        joined_at: member.joinedAt?.toISOString() ?? null,
        role_ids: member.roleIds,
        is_bot: member.isBot,
      }));
      const result = await database.execute(sql`
        WITH run_to_complete AS (
          SELECT id, trigger, requested_by
          FROM discord_member_sync_runs
          WHERE id = ${input.runId}
            AND guild_id = ${input.guildId}
            AND status = 'running'
        ), role_input AS (
          SELECT ${input.guildId}::text AS guild_id, role_rows.*
          FROM jsonb_to_recordset(${JSON.stringify(rolePayload)}::jsonb) AS role_rows(
            role_id text,
            name text,
            color integer,
            position integer,
            managed boolean,
            permissions text
          )
          WHERE EXISTS (SELECT 1 FROM run_to_complete)
        ), member_input AS (
          SELECT ${input.guildId}::text AS guild_id, member_rows.*
          FROM jsonb_to_recordset(${JSON.stringify(memberPayload)}::jsonb) AS member_rows(
            discord_user_id text,
            username text,
            global_name text,
            guild_display_name text,
            avatar_hash text,
            joined_at timestamptz,
            role_ids jsonb,
            is_bot boolean
          )
          WHERE EXISTS (SELECT 1 FROM run_to_complete)
        ), roles_upserted AS (
          INSERT INTO discord_guild_roles (
            guild_id, role_id, name, color, position, managed, permissions, updated_at
          )
          SELECT guild_id, role_id, name, color, position, managed, permissions,
                 ${input.completedAt}
          FROM role_input
          ON CONFLICT (guild_id, role_id) DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            position = EXCLUDED.position,
            managed = EXCLUDED.managed,
            permissions = EXCLUDED.permissions,
            updated_at = EXCLUDED.updated_at
          RETURNING role_id
        ), members_upserted AS (
          INSERT INTO discord_members (
            discord_user_id, guild_id, display_name, discord_handle, avatar_url,
            username, global_name, guild_display_name, avatar_hash, joined_at,
            role_ids, is_bot, membership_status, last_seen_at, left_at,
            verified_at, created_at, updated_at
          )
          SELECT
            discord_user_id, guild_id, guild_display_name, username, NULL,
            username, global_name, guild_display_name, avatar_hash, joined_at,
            role_ids, is_bot, 'active', ${input.completedAt}, NULL,
            CASE WHEN role_ids ? ${input.verifiedRoleId}
                 THEN ${input.completedAt}::timestamptz
                 ELSE NULL::timestamptz END,
            ${input.completedAt}, ${input.completedAt}
          FROM member_input
          ON CONFLICT (discord_user_id) DO UPDATE SET
            guild_id = EXCLUDED.guild_id,
            display_name = EXCLUDED.display_name,
            discord_handle = EXCLUDED.discord_handle,
            username = EXCLUDED.username,
            global_name = EXCLUDED.global_name,
            guild_display_name = EXCLUDED.guild_display_name,
            avatar_hash = EXCLUDED.avatar_hash,
            joined_at = EXCLUDED.joined_at,
            role_ids = EXCLUDED.role_ids,
            is_bot = EXCLUDED.is_bot,
            membership_status = 'active',
            last_seen_at = EXCLUDED.last_seen_at,
            left_at = NULL,
            verified_at = COALESCE(discord_members.verified_at, EXCLUDED.verified_at),
            updated_at = EXCLUDED.updated_at
          RETURNING discord_user_id
        ), members_marked_left AS (
          UPDATE discord_members existing_member
          SET membership_status = 'left',
              left_at = ${input.completedAt},
              updated_at = ${input.completedAt}
          WHERE existing_member.guild_id = ${input.guildId}
            AND existing_member.membership_status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM member_input current_member
              WHERE current_member.discord_user_id = existing_member.discord_user_id
            )
          RETURNING existing_member.discord_user_id
        ), completed_run AS (
          UPDATE discord_member_sync_runs sync_run
          SET status = 'succeeded',
              member_count = (SELECT count(*)::integer FROM member_input),
              active_member_count = (SELECT count(*)::integer FROM member_input),
              bot_count = (
                SELECT count(*)::integer FROM member_input WHERE is_bot = true
              ),
              safe_error_code = NULL,
              safe_error_message = NULL,
              completed_at = ${input.completedAt}
          WHERE sync_run.id IN (SELECT id FROM run_to_complete)
          RETURNING sync_run.id, sync_run.trigger, sync_run.requested_by,
                    sync_run.member_count, sync_run.active_member_count,
                    sync_run.bot_count
        ), manual_audit AS (
          INSERT INTO admin_audit_events (
            id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
          )
          SELECT gen_random_uuid(), requested_by, 'discord_member_sync', id::text,
                 'discord_member_sync', 'succeeded',
                 jsonb_build_object(
                   'memberCount', member_count,
                   'activeMemberCount', active_member_count,
                   'botCount', bot_count
                 ),
                 ${input.completedAt}
          FROM completed_run
          WHERE trigger = 'manual' AND requested_by IS NOT NULL
          RETURNING id
        )
        SELECT member_count AS "memberCount",
               active_member_count AS "activeMemberCount",
               bot_count AS "botCount"
        FROM completed_run
      `);
      const counts = resultRows<{
        memberCount: number | string;
        activeMemberCount: number | string;
        botCount: number | string;
      }>(result)[0];
      if (!counts) throw new Error("Member sync run is no longer active");
      return {
        memberCount: Number(counts.memberCount),
        activeMemberCount: Number(counts.activeMemberCount),
        botCount: Number(counts.botCount),
      };
    },

    async failRun(input) {
      await database.execute(sql`
        WITH failed_run AS (
          UPDATE discord_member_sync_runs
          SET status = 'failed',
              safe_error_code = ${input.failure.code},
              safe_error_message = ${input.failure.safeMessage},
              completed_at = ${input.completedAt}
          WHERE id = ${input.runId} AND status = 'running'
          RETURNING id, trigger, requested_by
        )
        INSERT INTO admin_audit_events (
          id, actor_id, entity_type, entity_id, action, outcome, metadata, occurred_at
        )
        SELECT gen_random_uuid(), requested_by, 'discord_member_sync', id::text,
               'discord_member_sync', 'failed',
               jsonb_build_object('code', ${input.failure.code}::text),
               ${input.completedAt}
        FROM failed_run
        WHERE trigger = 'manual' AND requested_by IS NOT NULL
      `);
    },

    async listMembers(guildId) {
      const result = await database.execute(sql`
        SELECT
          member.discord_user_id AS "discordUserId",
          member.username,
          member.global_name AS "globalName",
          member.guild_display_name AS "guildDisplayName",
          member.display_name AS "displayName",
          member.discord_handle AS "discordHandle",
          member.avatar_hash AS "avatarHash",
          member.joined_at AS "joinedAt",
          member.role_ids AS "roleIds",
          COALESCE(
            jsonb_agg(role.name ORDER BY role.position DESC)
              FILTER (WHERE role.role_id IS NOT NULL),
            '[]'::jsonb
          ) AS "roleNames",
          member.is_bot AS "isBot",
          member.membership_status AS "membershipStatus",
          member.verified_at AS "verifiedAt",
          member.last_seen_at AS "lastSeenAt",
          member.left_at AS "leftAt"
        FROM discord_members member
        LEFT JOIN LATERAL jsonb_array_elements_text(member.role_ids)
          member_role(role_id) ON true
        LEFT JOIN discord_guild_roles role
          ON role.guild_id = member.guild_id
          AND role.role_id = member_role.role_id
        WHERE member.guild_id = ${guildId}
        GROUP BY member.discord_user_id
        ORDER BY
          CASE member.membership_status WHEN 'active' THEN 0 ELSE 1 END,
          member.guild_display_name ASC NULLS LAST,
          member.discord_user_id ASC
      `);
      return resultRows<MemberRow>(result).map(mapMember);
    },

    async getLatestStatus(guildId) {
      const result = await database.execute(sql`
        SELECT
          latest.id AS "lastRunId",
          latest.status AS "lastRunStatus",
          latest.trigger AS "lastRunTrigger",
          latest.started_at AS "lastRunStartedAt",
          latest.completed_at AS "lastRunCompletedAt",
          latest.safe_error_code AS "safeErrorCode",
          latest.safe_error_message AS "safeErrorMessage",
          successful.completed_at AS "lastSuccessfulSyncAt"
        FROM (
          SELECT * FROM discord_member_sync_runs
          WHERE guild_id = ${guildId}
          ORDER BY started_at DESC
          LIMIT 1
        ) latest
        LEFT JOIN LATERAL (
          SELECT completed_at FROM discord_member_sync_runs
          WHERE guild_id = ${guildId} AND status = 'succeeded'
          ORDER BY completed_at DESC
          LIMIT 1
        ) successful ON true
      `);
      const row = resultRows<{
        lastRunId: string;
        lastRunStatus: "running" | "succeeded" | "failed";
        lastRunTrigger: "cron" | "manual";
        lastRunStartedAt: Date | string;
        lastRunCompletedAt: Date | string | null;
        lastSuccessfulSyncAt: Date | string | null;
        safeErrorCode: string | null;
        safeErrorMessage: string | null;
      }>(result)[0];
      if (!row) {
        return {
          state: "never",
          lastRunId: null,
          lastRunStatus: null,
          lastRunTrigger: null,
          lastRunStartedAt: null,
          lastRunCompletedAt: null,
          lastSuccessfulSyncAt: null,
          safeErrorCode: null,
          safeErrorMessage: null,
        } satisfies MemberSyncViewStatus;
      }
      return {
        state:
          row.lastRunStatus === "running"
            ? "running"
            : row.lastRunStatus === "failed"
              ? "degraded"
              : "ready",
        lastRunId: row.lastRunId,
        lastRunStatus: row.lastRunStatus,
        lastRunTrigger: row.lastRunTrigger,
        lastRunStartedAt: iso(row.lastRunStartedAt),
        lastRunCompletedAt: iso(row.lastRunCompletedAt),
        lastSuccessfulSyncAt: iso(row.lastSuccessfulSyncAt),
        safeErrorCode: row.safeErrorCode,
        safeErrorMessage: row.safeErrorMessage,
      } satisfies MemberSyncViewStatus;
    },

    async getDiscordFacts(guildId, verifiedRoleId) {
      const countsResult = await database.execute(sql`
        SELECT
          count(*) FILTER (
            WHERE membership_status = 'active'
          )::integer AS "activeMembers",
          count(*) FILTER (
            WHERE membership_status = 'active' AND role_ids ? ${verifiedRoleId}
          )::integer AS "verifiedMembers",
          count(*) FILTER (
            WHERE membership_status = 'active' AND is_bot = true
          )::integer AS "botMembers",
          (
            SELECT completed_at
            FROM discord_member_sync_runs
            WHERE guild_id = ${guildId} AND status = 'succeeded'
            ORDER BY completed_at DESC
            LIMIT 1
          ) AS "lastSuccessfulSyncAt"
        FROM discord_members
        WHERE guild_id = ${guildId}
      `);
      const counts = resultRows<{
        activeMembers: number | string;
        verifiedMembers: number | string;
        botMembers: number | string;
        lastSuccessfulSyncAt: Date | string | null;
      }>(countsResult)[0];
      const rolesResult = await database.execute(sql`
        SELECT role.role_id AS "roleId", role.name AS label,
               count(*)::integer AS value
        FROM discord_members member
        CROSS JOIN LATERAL jsonb_array_elements_text(member.role_ids)
          member_role(role_id)
        JOIN discord_guild_roles role
          ON role.guild_id = member.guild_id
          AND role.role_id = member_role.role_id
        WHERE member.guild_id = ${guildId}
          AND member.membership_status = 'active'
          AND role.name <> '@everyone'
          AND role.managed = false
        GROUP BY role.role_id, role.name, role.position
        ORDER BY value DESC, role.position DESC, role.name ASC
      `);
      return {
        activeMembers: Number(counts?.activeMembers ?? 0),
        verifiedMembers: Number(counts?.verifiedMembers ?? 0),
        botMembers: Number(counts?.botMembers ?? 0),
        roleDistribution: resultRows<{
          roleId: string;
          label: string;
          value: number | string;
        }>(rolesResult).map((role) => ({
          roleId: role.roleId,
          label: role.label,
          value: Number(role.value),
        })),
        lastSuccessfulSyncAt: iso(counts?.lastSuccessfulSyncAt),
      } satisfies DiscordFacts;
    },
  };
}

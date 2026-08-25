import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type {
  DomainIntelligenceResult,
  DomainTier,
} from "./types";

export type DomainConversionAction =
  | "register"
  | "transfer"
  | "full_intelligence"
  | "continue_on_site";

export type StoredDomainQuery = {
  id: string;
  discordUserId: string;
  normalizedDomain: string;
  tier: DomainTier;
  status: "started" | "succeeded" | "failed" | "quota_rejected";
  result: DomainIntelligenceResult | null;
  completedAt: Date | null;
};

export type DomainQueryRepository = {
  begin(input: {
    interactionId: string;
    guildId: string;
    discordUserId: string;
    normalizedDomain: string;
    tier: DomainTier;
    usageDay: string;
    limit: 1 | 3;
    now: Date;
    replayAfter: Date;
    staleBefore: Date;
  }): Promise<
    | { status: "started"; requestId: string }
    | {
        status: "replay";
        requestId: string;
        result: DomainIntelligenceResult;
        completedAt: Date;
      }
    | {
        status: "quota-rejected";
        requestId: string;
        used: number;
        limit: 1 | 3;
      }
    | {
        status: "duplicate";
        requestId: string;
        state: "started" | "succeeded" | "failed" | "quota_rejected";
      }
  >;
  succeed(input: {
    requestId: string;
    result: DomainIntelligenceResult;
    providers: Record<string, string>;
    completedAt: Date;
    limit: 1 | 3;
  }): Promise<{ used: number; limit: 1 | 3 }>;
  fail(input: {
    requestId: string;
    code: string;
    completedAt: Date;
  }): Promise<void>;
  getOwnedQuery(input: {
    requestId: string;
    discordUserId: string;
  }): Promise<StoredDomainQuery | null>;
  getQueryForOutbound(requestId: string): Promise<StoredDomainQuery | null>;
  recordConversion(input: {
    requestId: string;
    action: DomainConversionAction;
    destination: string;
    occurredAt: Date;
  }): Promise<"recorded" | "duplicate" | "not-found">;
};

type QueryResult = { rows: unknown[] } | unknown[];

export type DomainQueryDatabase = {
  execute(query: SQL): Promise<QueryResult>;
};

function resultRows<T>(result: QueryResult): T[] {
  return (Array.isArray(result) ? result : result.rows) as T[];
}

function date(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

type StoredQueryRow = {
  id: string;
  discordUserId: string;
  normalizedDomain: string;
  tier: DomainTier;
  status: StoredDomainQuery["status"];
  resultSnapshot: DomainIntelligenceResult | null;
  completedAt: Date | string | null;
};

function mapStoredQuery(row: StoredQueryRow): StoredDomainQuery {
  return {
    id: row.id,
    discordUserId: row.discordUserId,
    normalizedDomain: row.normalizedDomain,
    tier: row.tier,
    status: row.status,
    result: row.resultSnapshot,
    completedAt: date(row.completedAt),
  };
}

const storedQueryColumns = sql`
  id,
  discord_user_id AS "discordUserId",
  normalized_domain AS "normalizedDomain",
  tier,
  status,
  result_snapshot AS "resultSnapshot",
  completed_at AS "completedAt"
`;

export function createNeonDomainQueryRepository(
  database: DomainQueryDatabase,
): DomainQueryRepository {
  return {
    async begin(input) {
      const result = await database.execute(sql`
        WITH claimed_interaction AS (
          INSERT INTO domain_query_interaction_claims (
            interaction_id, discord_user_id, created_at
          )
          VALUES (${input.interactionId}, ${input.discordUserId}, ${input.now})
          ON CONFLICT (interaction_id) DO NOTHING
          RETURNING interaction_id
        ), stale_closed AS (
          UPDATE domain_query_requests stale
          SET status = 'failed',
              safe_error_code = 'stale_query_recovered',
              completed_at = ${input.now}
          WHERE stale.guild_id = ${input.guildId}
            AND stale.discord_user_id = ${input.discordUserId}
            AND stale.usage_day = ${input.usageDay}::date
            AND stale.status = 'started'
            AND stale.created_at < ${input.staleBefore}
            AND EXISTS (SELECT 1 FROM claimed_interaction)
          RETURNING stale.id
        ), replay AS (
          SELECT
            previous.id,
            previous.result_snapshot AS "resultSnapshot",
            previous.completed_at AS "completedAt"
          FROM domain_query_requests previous
          WHERE previous.guild_id = ${input.guildId}
            AND previous.discord_user_id = ${input.discordUserId}
            AND previous.normalized_domain = ${input.normalizedDomain}
            AND previous.status = 'succeeded'
            AND previous.completed_at >= ${input.replayAfter}
            AND previous.result_snapshot IS NOT NULL
            AND EXISTS (SELECT 1 FROM claimed_interaction)
          ORDER BY previous.completed_at DESC
          LIMIT 1
        ), replay_release AS (
          UPDATE domain_query_daily_usage daily
          SET reserved_count = greatest(
                0,
                daily.reserved_count -
                  (SELECT count(*)::integer FROM stale_closed)
              ),
              updated_at = ${input.now}
          WHERE daily.guild_id = ${input.guildId}
            AND daily.discord_user_id = ${input.discordUserId}
            AND daily.usage_day = ${input.usageDay}::date
            AND EXISTS (SELECT 1 FROM replay)
          RETURNING daily.reserved_count
        ), usage_reserved AS (
          INSERT INTO domain_query_daily_usage (
            guild_id, discord_user_id, usage_day, reserved_count, updated_at
          )
          SELECT
            ${input.guildId}, ${input.discordUserId}, ${input.usageDay}::date,
            1, ${input.now}
          FROM claimed_interaction
          WHERE NOT EXISTS (SELECT 1 FROM replay)
          ON CONFLICT (guild_id, discord_user_id, usage_day)
          DO UPDATE SET
            reserved_count = greatest(
              0,
              domain_query_daily_usage.reserved_count -
                (SELECT count(*)::integer FROM stale_closed)
            ) + 1,
            updated_at = EXCLUDED.updated_at
          WHERE greatest(
            0,
            domain_query_daily_usage.reserved_count -
              (SELECT count(*)::integer FROM stale_closed)
          ) < ${input.limit}
          RETURNING reserved_count AS "reservedCount"
        ), inserted AS (
          INSERT INTO domain_query_requests (
            id, interaction_id, guild_id, discord_user_id,
            normalized_domain, tier, status, usage_day, safe_error_code,
            created_at, completed_at
          )
          SELECT
            gen_random_uuid(), claimed_interaction.interaction_id,
            ${input.guildId}, ${input.discordUserId},
            ${input.normalizedDomain}, ${input.tier},
            CASE
              WHEN EXISTS (SELECT 1 FROM replay) THEN 'failed'
              WHEN EXISTS (SELECT 1 FROM usage_reserved) THEN 'started'
              ELSE 'quota_rejected'
            END::domain_query_status,
            ${input.usageDay}::date,
            CASE
              WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay_served'
              WHEN NOT EXISTS (SELECT 1 FROM usage_reserved)
                THEN 'daily_limit_reached'
              ELSE NULL
            END,
            ${input.now},
            CASE
              WHEN EXISTS (SELECT 1 FROM replay)
                OR NOT EXISTS (SELECT 1 FROM usage_reserved)
                THEN ${input.now}::timestamptz
              ELSE NULL
            END
          FROM claimed_interaction
          RETURNING id, status
        )
        SELECT
          'duplicate'::text AS kind,
          existing_request.id AS "requestId",
          existing_request.status::text AS state,
          NULL::jsonb AS result,
          NULL::timestamptz AS "completedAt"
        FROM domain_query_requests existing_request
        WHERE existing_request.interaction_id = ${input.interactionId}
          AND NOT EXISTS (SELECT 1 FROM claimed_interaction)
        UNION ALL
        SELECT
          'replay', replay.id, NULL, replay."resultSnapshot", replay."completedAt"
        FROM replay
        UNION ALL
        SELECT
          'started', inserted.id, NULL, NULL::jsonb, NULL::timestamptz
        FROM inserted
        WHERE inserted.status = 'started'
        UNION ALL
        SELECT
          'quota-rejected', inserted.id, NULL, NULL::jsonb, NULL::timestamptz
        FROM inserted
        WHERE inserted.status = 'quota_rejected'
      `);

      type BeginRow = {
        kind: "duplicate" | "replay" | "started" | "quota-rejected";
        requestId: string;
        state: StoredDomainQuery["status"] | null;
        result: DomainIntelligenceResult | null;
        completedAt: Date | string | null;
      };
      let row = resultRows<BeginRow>(result)[0];
      if (!row) {
        const duplicate = await database.execute(sql`
          SELECT
            'duplicate'::text AS kind,
            id AS "requestId",
            status::text AS state,
            NULL::jsonb AS result,
            NULL::timestamptz AS "completedAt"
          FROM domain_query_requests
          WHERE interaction_id = ${input.interactionId}
        `);
        row = resultRows<BeginRow>(duplicate)[0];
      }
      if (!row) throw new Error("Domain query reservation could not be reconciled");

      if (row.kind === "started") {
        return { status: "started", requestId: row.requestId };
      }
      if (row.kind === "quota-rejected") {
        return {
          status: "quota-rejected",
          requestId: row.requestId,
          used: input.limit,
          limit: input.limit,
        };
      }
      if (row.kind === "replay") {
        if (!row.result || !row.completedAt) {
          throw new Error("Domain query replay is incomplete");
        }
        return {
          status: "replay",
          requestId: row.requestId,
          result: row.result,
          completedAt: date(row.completedAt)!,
        };
      }
      return {
        status: "duplicate",
        requestId: row.requestId,
        state: row.state ?? "failed",
      };
    },

    async succeed(input) {
      const completed = await database.execute(sql`
        UPDATE domain_query_requests
        SET status = 'succeeded',
            charged_at = ${input.completedAt},
            safe_error_code = NULL,
            provider_summary = ${JSON.stringify(input.providers)}::jsonb,
            result_snapshot = ${JSON.stringify(input.result)}::jsonb,
            completed_at = ${input.completedAt}
        WHERE id = ${input.requestId}
          AND status = 'started'
        RETURNING guild_id AS "guildId", discord_user_id AS "discordUserId",
                  usage_day AS "usageDay"
      `);
      const row = resultRows<{
        guildId: string;
        discordUserId: string;
        usageDay: Date | string;
      }>(completed)[0];
      if (!row) throw new Error("Domain query is no longer active");

      const counted = await database.execute(sql`
        SELECT count(*)::integer AS used
        FROM domain_query_requests
        WHERE guild_id = ${row.guildId}
          AND discord_user_id = ${row.discordUserId}
          AND usage_day = ${String(row.usageDay).slice(0, 10)}::date
          AND status = 'succeeded'
      `);
      const used = Number(resultRows<{ used: number | string }>(counted)[0]?.used ?? 1);
      return { used: Math.min(used, input.limit), limit: input.limit };
    },

    async fail(input) {
      await database.execute(sql`
        WITH failed AS (
          UPDATE domain_query_requests
          SET status = 'failed',
              safe_error_code = ${input.code},
              provider_summary = '{}'::jsonb,
              result_snapshot = NULL,
              completed_at = ${input.completedAt}
          WHERE id = ${input.requestId}
            AND status = 'started'
          RETURNING guild_id, discord_user_id, usage_day
        )
        UPDATE domain_query_daily_usage daily
        SET reserved_count = greatest(0, daily.reserved_count - 1),
            updated_at = ${input.completedAt}
        FROM failed
        WHERE daily.guild_id = failed.guild_id
          AND daily.discord_user_id = failed.discord_user_id
          AND daily.usage_day = failed.usage_day
      `);
    },

    async getOwnedQuery(input) {
      const result = await database.execute(sql`
        SELECT ${storedQueryColumns}
        FROM domain_query_requests
        WHERE id = ${input.requestId}
          AND discord_user_id = ${input.discordUserId}
      `);
      const row = resultRows<StoredQueryRow>(result)[0];
      return row ? mapStoredQuery(row) : null;
    },

    async getQueryForOutbound(requestId) {
      const result = await database.execute(sql`
        SELECT ${storedQueryColumns}
        FROM domain_query_requests
        WHERE id = ${requestId}
          AND status IN ('succeeded', 'quota_rejected')
      `);
      const row = resultRows<StoredQueryRow>(result)[0];
      return row ? mapStoredQuery(row) : null;
    },

    async recordConversion(input) {
      const inserted = await database.execute(sql`
        INSERT INTO domain_conversion_events (
          id, query_request_id, discord_user_id, normalized_domain,
          action, destination_url, occurred_at
        )
        SELECT
          gen_random_uuid(), query.id, query.discord_user_id,
          query.normalized_domain, ${input.action}, ${input.destination},
          ${input.occurredAt}
        FROM domain_query_requests query
        WHERE query.id = ${input.requestId}
          AND query.status IN ('succeeded', 'quota_rejected')
        ON CONFLICT (query_request_id, action) DO NOTHING
        RETURNING id
      `);
      if (resultRows(inserted).length === 1) return "recorded";

      const existing = await database.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM domain_conversion_events
          WHERE query_request_id = ${input.requestId}
            AND action = ${input.action}
        ) AS exists
      `);
      return resultRows<{ exists: boolean }>(existing)[0]?.exists
        ? "duplicate"
        : "not-found";
    },
  };
}

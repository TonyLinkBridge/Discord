import nacl from "tweetnacl";
import { neon } from "@neondatabase/serverless";

import { assertVerificationTestEnvironment } from "./verification-e2e-fixtures.mjs";

const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(31));
const privateKey = keyPair.secretKey;

export const domainIntelligenceE2eFixture = Object.freeze({
  applicationId: "900000000000000099",
  guildId: "900000000000000000",
  normalUserId: "900000000000000031",
  verifiedUserId: "900000000000000032",
  normalBetaRoleId: "900000000000000041",
  verifiedBetaRoleId: "900000000000000042",
  verifiedRoleId: "900000000000000010",
  publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
});

export const domainIntelligenceE2eDataKey =
  Buffer.alloc(32, 19).toString("base64");
export const domainIntelligenceE2eLinkKey =
  Buffer.alloc(32, 21).toString("base64");

export async function assertDomainIntelligenceTestEnvironment(
  env,
  dependencies,
) {
  try {
    return await assertVerificationTestEnvironment(env, dependencies);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        error.message.replace(/verification E2E/gi, "domain intelligence E2E"),
      );
    }
    throw error;
  }
}

function createSignedCommandRequest({
  interactionId,
  interactionToken,
  member,
  data,
}) {
  const verified = member === "verified";
  const timestamp = "1787702400";
  const body = JSON.stringify({
    id: interactionId,
    application_id: domainIntelligenceE2eFixture.applicationId,
    token: interactionToken,
    type: 2,
    guild_id: domainIntelligenceE2eFixture.guildId,
    member: {
      user: {
        id: verified
          ? domainIntelligenceE2eFixture.verifiedUserId
          : domainIntelligenceE2eFixture.normalUserId,
        username: verified ? "verified.domainer" : "domain.scout",
        global_name: verified ? "Verified Domainer" : "Domain Scout",
      },
      roles: verified
        ? [
            domainIntelligenceE2eFixture.verifiedBetaRoleId,
            domainIntelligenceE2eFixture.verifiedRoleId,
          ]
        : [domainIntelligenceE2eFixture.normalBetaRoleId],
    },
    data,
  });
  const signature = Buffer.from(
    nacl.sign.detached(
      Uint8Array.from(Buffer.from(timestamp + body)),
      privateKey,
    ),
  ).toString("hex");
  return new Request("http://127.0.0.1:3113/api/discord/interactions", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
  });
}

export function createSignedDomainInteractionRequest({
  interactionId,
  interactionToken,
  member,
  domain,
}) {
  return createSignedCommandRequest({
    interactionId,
    interactionToken,
    member,
    data: {
      name: "domain",
      options: [{ type: 3, name: "domain", value: domain }],
    },
  });
}

export function createSignedVerifyInteractionRequest({
  interactionId,
  interactionToken,
  member,
}) {
  return createSignedCommandRequest({
    interactionId,
    interactionToken,
    member,
    data: { name: "verify" },
  });
}

function e2eUserIds() {
  return [
    domainIntelligenceE2eFixture.normalUserId,
    domainIntelligenceE2eFixture.verifiedUserId,
  ];
}

export async function resetDomainIntelligenceE2e(env) {
  const { databaseUrl } = await assertDomainIntelligenceTestEnvironment(env);
  const database = neon(databaseUrl);
  const userIds = e2eUserIds();

  await database`
    DELETE FROM domain_query_requests
    WHERE discord_user_id = ANY(${userIds}::text[])
  `;
  await database`
    DELETE FROM domain_query_daily_usage
    WHERE discord_user_id = ANY(${userIds}::text[])
  `;
  await database`
    DELETE FROM domain_query_interaction_claims
    WHERE discord_user_id = ANY(${userIds}::text[])
  `;
  await database`
    DELETE FROM discord_interactions
    WHERE discord_user_id = ANY(${userIds}::text[])
  `;
  await database`
    DELETE FROM verification_requests
    WHERE discord_user_id = ANY(${userIds}::text[])
  `;
}

export async function readDomainIntelligenceE2eState(env, discordUserId) {
  const { databaseUrl } = await assertDomainIntelligenceTestEnvironment(env);
  const database = neon(databaseUrl);
  const rows = await database`
    SELECT
      count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'quota_rejected')::int AS "quotaRejected",
      (
        SELECT count(*)::int
        FROM domain_conversion_events conversion
        WHERE conversion.discord_user_id = ${discordUserId}
      ) AS conversions
    FROM domain_query_requests
    WHERE discord_user_id = ${discordUserId}
  `;
  const row = rows[0] ?? {};
  return {
    succeeded: Number(row.succeeded ?? 0),
    failed: Number(row.failed ?? 0),
    quotaRejected: Number(row.quotaRejected ?? 0),
    conversions: Number(row.conversions ?? 0),
  };
}

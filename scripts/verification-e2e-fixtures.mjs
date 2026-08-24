import {
  createCipheriv,
  hkdfSync,
} from "node:crypto";

import { neon } from "@neondatabase/serverless";

import { discordStubFixture } from "./discord-api-stub.mjs";

export const verificationE2eDataKey = Buffer.alloc(32, 9).toString("base64");

export const verificationE2eRequests = Object.freeze({
  success: {
    id: "70000000-0000-4000-8000-000000000001",
    discordUserId: discordStubFixture.successUserId,
    displayName: "DomainNomad",
    discordHandle: "domain.nomad",
    email: "domain.nomad+verification@example.com",
    domain: "domainnomad-test.com",
  },
  forbidden: {
    id: "70000000-0000-4000-8000-000000000002",
    discordUserId: discordStubFixture.forbiddenUserId,
    displayName: "Permission Test",
    discordHandle: "permission.test",
    email: "permission+verification@example.com",
    domain: "permission-test.com",
  },
  retry: {
    id: "70000000-0000-4000-8000-000000000003",
    discordUserId: discordStubFixture.retryUserId,
    displayName: "Retry Test",
    discordHandle: "retry.test",
    email: "retry+verification@example.com",
    domain: "retry-test.com",
  },
});

async function readBranchId(databaseUrl) {
  const database = neon(databaseUrl);
  const rows = await database`SELECT current_setting('neon.branch_id', true) AS branch_id`;
  return rows[0]?.branch_id ?? null;
}

export async function assertVerificationTestEnvironment(
  env,
  dependencies = { getBranchId: readBranchId },
) {
  const databaseUrl = env.VERIFICATION_TEST_DATABASE_URL?.trim();
  const expectedBranchId = env.VERIFICATION_TEST_BRANCH_ID?.trim();
  const productionBranchId = env.VERIFICATION_PRODUCTION_BRANCH_ID?.trim();
  if (!databaseUrl) {
    throw new Error("VERIFICATION_TEST_DATABASE_URL is required for verification E2E");
  }
  if (!expectedBranchId) {
    throw new Error("VERIFICATION_TEST_BRANCH_ID is required for verification E2E");
  }
  if (!productionBranchId) {
    throw new Error(
      "VERIFICATION_PRODUCTION_BRANCH_ID is required for verification E2E",
    );
  }
  if (expectedBranchId === productionBranchId) {
    throw new Error("Verification E2E refuses the production branch");
  }
  const productionUrl = env.DATABASE_URL?.trim();
  if (productionUrl && productionUrl === databaseUrl) {
    throw new Error("Verification E2E refuses the production database configuration");
  }

  const parsed = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname.endsWith(".neon.tech")
  ) {
    throw new Error("Verification E2E requires a Neon Postgres test URL");
  }
  const actualBranchId = await dependencies.getBranchId(databaseUrl);
  if (actualBranchId === productionBranchId) {
    throw new Error("Verification E2E refuses the production branch");
  }
  if (actualBranchId !== expectedBranchId) {
    throw new Error("Verification E2E branch identity did not match");
  }
  return { databaseUrl, branchId: expectedBranchId };
}

function encryptEmail(email, base64RootKey) {
  const rootKey = Buffer.from(base64RootKey, "base64");
  if (rootKey.length !== 32) throw new Error("Invalid verification E2E data key");
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      rootKey,
      Buffer.from("rayname-verification-root-v1"),
      Buffer.from("rayname-verification-encryption-v1"),
      32,
    ),
  );
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("rayname-verification-email-v1\0"));
  const ciphertext = Buffer.concat([
    cipher.update(email.trim().toLowerCase(), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export async function seedVerificationE2e(env, options = {}) {
  const { databaseUrl } = await assertVerificationTestEnvironment(env);
  const dataKey = env.VERIFICATION_DATA_KEY?.trim() || verificationE2eDataKey;
  const database = neon(databaseUrl);
  const allFixtures = Object.values(verificationE2eRequests);
  const included = options.include ?? Object.keys(verificationE2eRequests);
  const fixtures = included.map((key) => verificationE2eRequests[key]);
  const memberIds = allFixtures.map(({ discordUserId }) => discordUserId);
  const requestIds = allFixtures.map(({ id }) => id);

  await database`DELETE FROM admin_audit_events WHERE entity_id = ANY(${requestIds}::text[])`;
  await database`DELETE FROM verification_requests WHERE id = ANY(${requestIds}::uuid[])`;
  await database`DELETE FROM discord_members WHERE discord_user_id = ANY(${memberIds})`;
  await database`DELETE FROM discord_interactions WHERE discord_user_id = ANY(${memberIds})`;

  for (const fixture of fixtures) {
    const encrypted = encryptEmail(fixture.email, dataKey);
    await database`
      INSERT INTO discord_members (
        discord_user_id, guild_id, display_name, discord_handle
      ) VALUES (
        ${fixture.discordUserId}, ${discordStubFixture.guildId},
        ${fixture.displayName}, ${fixture.discordHandle}
      )
    `;
    await database`
      INSERT INTO verification_requests (
        id, discord_user_id, status, email_ciphertext, email_iv,
        email_auth_tag, email_lookup_hash, domain
      ) VALUES (
        ${fixture.id}, ${fixture.discordUserId}, 'pending',
        ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag},
        ${`e2e-${fixture.discordUserId}`}, ${fixture.domain}
      )
    `;
  }
}

export async function readVerificationE2eState(env, requestId) {
  const { databaseUrl } = await assertVerificationTestEnvironment(env);
  const database = neon(databaseUrl);
  const rows = await database`
    SELECT
      vr.status,
      vr.role_assigned_at AS "roleAssignedAt",
      (SELECT count(*)::int FROM discord_role_operations ro WHERE ro.verification_request_id = vr.id) AS "roleOperationCount",
      (SELECT count(*)::int FROM admin_audit_events ae WHERE ae.entity_id = vr.id::text AND ae.outcome = 'succeeded') AS "successAuditCount"
    FROM verification_requests vr
    WHERE vr.id = ${requestId}
  `;
  return rows[0] ?? null;
}

export async function resetMemberSyncE2e(env) {
  const { databaseUrl } = await assertVerificationTestEnvironment(env);
  const database = neon(databaseUrl);
  const guildId = discordStubFixture.guildId;
  const memberIds = [
    discordStubFixture.memberAlphaId,
    discordStubFixture.memberBetaId,
    discordStubFixture.botUserId,
    discordStubFixture.memberGammaId,
  ];

  await database`
    DELETE FROM admin_audit_events
    WHERE entity_type = 'discord_member_sync'
      AND entity_id IN (
        SELECT id::text FROM discord_member_sync_runs WHERE guild_id = ${guildId}
      )
  `;
  await database`DELETE FROM discord_member_sync_runs WHERE guild_id = ${guildId}`;
  await database`
    DELETE FROM discord_members
    WHERE guild_id = ${guildId}
      AND discord_user_id = ANY(${memberIds}::text[])
  `;
  await database`DELETE FROM discord_guild_roles WHERE guild_id = ${guildId}`;
}

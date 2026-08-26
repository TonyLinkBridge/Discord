import "server-only";

import { createDatabase } from "@/lib/database/client";
import { getDatabaseConfig } from "@/lib/database/config";

import { createCertificateClient } from "./certificate-client";
import { getDomainIntelligenceConfig } from "./config";
import { createDnsClient } from "./dns-client";
import { createRayNameCommerceClient } from "./rayname-client";
import { createRayNameFixtureProvider } from "./rayname-fixture-provider";
import {
  createNeonDomainQueryRepository,
  type DomainQueryDatabase,
} from "./repository";
import { createRegistrationClient } from "./registration-client";
import { createDomainIntelligenceService } from "./service";

const discordIdPattern = /^\d{17,20}$/;

export type DomainIntelligenceRuntime =
  | { ready: false; reason: string }
  | {
      ready: true;
      config: {
        mode: "internal" | "public";
        testData: boolean;
        betaRoleIds: string[];
        verifiedRoleId: string;
        commerceHost: string;
        domainPageHost: string;
        testerRoleCount: number;
        testerUserCount: number;
      };
      service: ReturnType<typeof createDomainIntelligenceService>;
    };

export function createDomainIntelligenceRuntime(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): DomainIntelligenceRuntime {
  const domainConfig = getDomainIntelligenceConfig(env);
  if (!domainConfig.configured) {
    return { ready: false, reason: domainConfig.reason };
  }

  const databaseConfig = getDatabaseConfig(env);
  if (!databaseConfig.configured) {
    return { ready: false, reason: databaseConfig.reason };
  }
  const verifiedRoleId = env.DISCORD_VERIFIED_ROLE_ID?.trim() ?? "";
  if (!discordIdPattern.test(verifiedRoleId)) {
    return { ready: false, reason: "DISCORD_VERIFIED_ROLE_ID is invalid" };
  }

  const database = createDatabase(databaseConfig.url);
  const repository = createNeonDomainQueryRepository(
    database as unknown as DomainQueryDatabase,
  );
  const service = createDomainIntelligenceService({
    config: {
      enabled: true,
      mode: domainConfig.mode,
      betaRoleIds: domainConfig.betaRoleIds,
      testerRoleIds: domainConfig.testerRoleIds,
      testerUserIds: domainConfig.testerUserIds,
      verifiedRoleId,
      ...(domainConfig.testData ? { testData: true as const } : {}),
    },
    repository,
    commerce: domainConfig.testData
      ? createRayNameFixtureProvider()
      : createRayNameCommerceClient(
          {
            apiBaseUrl: domainConfig.commerceApiBaseUrl,
            apiToken: domainConfig.commerceApiToken,
          },
          fetchImpl,
        ),
    registration: createRegistrationClient({ fetchImpl }),
    dns: createDnsClient(),
    certificate: createCertificateClient(),
    now: () => new Date(),
  });

  return {
    ready: true,
    config: {
      mode: domainConfig.mode,
      testData: domainConfig.testData,
      betaRoleIds: domainConfig.betaRoleIds,
      verifiedRoleId,
      commerceHost: domainConfig.safe.commerceHost,
      domainPageHost: domainConfig.safe.domainPageHost,
      testerRoleCount: domainConfig.safe.testerRoleCount,
      testerUserCount: domainConfig.safe.testerUserCount,
    },
    service,
  };
}

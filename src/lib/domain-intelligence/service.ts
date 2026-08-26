import "server-only";

import type { CertificateProvider } from "./certificate-client";
import type { DnsProvider } from "./dns-client";
import { normalizeDomain } from "./input";
import type { RayNameCommerceProvider } from "./rayname-client";
import type { RegistrationProvider } from "./registration-client";
import type { DomainQueryRepository } from "./repository";
import { usageDayAt } from "./time";
import type {
  CertificateSummary,
  DnsSummary,
  DomainIntelligenceResult,
  RayNameCommercialResult,
  RayNameTldPrice,
  RegistrationFacts,
  SafeProviderFailure,
} from "./types";

export type DomainIntelligenceServiceConfig =
  | { enabled: false }
  | {
      enabled: true;
      mode: "internal" | "public";
      betaRoleIds: string[];
      verifiedRoleId: string;
      testData?: true;
    };

export type DomainSearchInput = {
  interactionId: string;
  guildId: string;
  discordUserId: string;
  roleIds: string[];
  rawDomain: string;
};

export type DomainSearchOutcome =
  | {
      status: "success";
      requestId: string;
      result: DomainIntelligenceResult;
      replayed: boolean;
      used: number;
      limit: 1 | 3;
      testData?: true;
    }
  | {
      status: "quota-rejected";
      requestId: string;
      used: number;
      limit: 1 | 3;
      verifyAvailable: boolean;
    }
  | { status: "invalid" }
  | { status: "unavailable"; safeMessage: string; retryable: boolean }
  | { status: "not-enabled" };

export type DomainCompareSort = "registration" | "renewal" | "transfer";

export type DomainComparisonOutcome =
  | {
      status: "success";
      requestId: string;
      sort: DomainCompareSort;
      page: number;
      pageCount: number;
      rows: RayNameTldPrice[];
      testData?: true;
    }
  | {
      status: "not-owned" | "unavailable" | "not-enabled";
      safeMessage: string;
    };

export interface DomainIntelligenceService {
  search(input: DomainSearchInput): Promise<DomainSearchOutcome>;
  compare(input: {
    requestId: string;
    discordUserId: string;
    sort: DomainCompareSort;
    page: number;
  }): Promise<DomainComparisonOutcome>;
}

export type DomainIntelligenceServiceDependencies = {
  config: DomainIntelligenceServiceConfig;
  repository: DomainQueryRepository;
  commerce: RayNameCommerceProvider;
  registration: RegistrationProvider;
  dns: DnsProvider;
  certificate: CertificateProvider;
  now(): Date;
};

function isFailure<T>(value: T | SafeProviderFailure): value is SafeProviderFailure {
  return typeof value === "object" && value !== null && "code" in value;
}

function settledValue<T>(
  result: PromiseSettledResult<T | SafeProviderFailure>,
): T | null {
  if (result.status === "rejected" || isFailure(result.value)) return null;
  return result.value;
}

function providerSummary(input: {
  commercial: RayNameCommercialResult;
  registration: RegistrationFacts | null;
  dns: DnsSummary | null;
  certificate: CertificateSummary | null;
  testData: boolean;
}) {
  const summary: Record<string, string> = {
    commerce: `${input.testData ? "fixture" : "rayname"}:${input.commercial.checkedAt}`,
  };
  if (input.registration?.source) {
    summary.registration =
      `${input.registration.source.kind}:${input.registration.source.name}:` +
      input.registration.source.checkedAt;
  }
  if (input.dns) summary.dns = `dns:${input.dns.checkedAt}`;
  if (input.certificate) {
    summary.certificate = `tls:${input.certificate.checkedAt}`;
  }
  return summary;
}

function priceFor(row: RayNameTldPrice, sort: DomainCompareSort) {
  if (sort === "registration") return row.registrationPrice;
  if (sort === "renewal") return row.renewalPrice;
  return row.transferPrice;
}

function sortPrices(rows: RayNameTldPrice[], sort: DomainCompareSort) {
  return [...rows].sort((left, right) => {
    const leftPrice = priceFor(left, sort);
    const rightPrice = priceFor(right, sort);
    if (leftPrice === null && rightPrice === null) {
      return left.tld.localeCompare(right.tld);
    }
    if (leftPrice === null) return 1;
    if (rightPrice === null) return -1;
    if (leftPrice.currency !== rightPrice.currency) {
      return leftPrice.currency.localeCompare(rightPrice.currency);
    }
    return Number(leftPrice.amount) - Number(rightPrice.amount) ||
      left.tld.localeCompare(right.tld);
  });
}

const databaseUnavailable: DomainSearchOutcome = {
  status: "unavailable",
  safeMessage: "RayFox couldn't start this lookup. Try again in a moment.",
  retryable: true,
};

export function createDomainIntelligenceService(
  dependencies: DomainIntelligenceServiceDependencies,
): DomainIntelligenceService {
  return {
    async search(input) {
      const config = dependencies.config;
      if (!config.enabled) return { status: "not-enabled" };
      if (
        config.mode === "internal" &&
        !config.betaRoleIds.includes(input.guildId) &&
        !input.roleIds.some((roleId) =>
          config.betaRoleIds.includes(roleId)
        )
      ) {
        return { status: "not-enabled" };
      }

      const normalized = normalizeDomain(input.rawDomain);
      if (!normalized.valid) return { status: "invalid" };

      const verified = input.roleIds.includes(config.verifiedRoleId);
      const tier = verified ? "verified" as const : "member" as const;
      const limit = verified ? 3 as const : 1 as const;
      const startedAt = dependencies.now();
      let reservation: Awaited<ReturnType<DomainQueryRepository["begin"]>>;
      try {
        reservation = await dependencies.repository.begin({
          interactionId: input.interactionId,
          guildId: input.guildId,
          discordUserId: input.discordUserId,
          normalizedDomain: normalized.domain.ascii,
          tier,
          usageDay: usageDayAt(startedAt),
          limit,
          now: startedAt,
          replayAfter: new Date(startedAt.getTime() - 5 * 60_000),
          staleBefore: new Date(startedAt.getTime() - 2 * 60_000),
        });
      } catch {
        return databaseUnavailable;
      }

      if (reservation.status === "quota-rejected") {
        return {
          ...reservation,
          verifyAvailable: !verified,
        };
      }
      if (reservation.status === "replay") {
        return {
          status: "success",
          requestId: reservation.requestId,
          result: reservation.result,
          replayed: true,
          used: reservation.used,
          limit,
          ...(dependencies.config.enabled && dependencies.config.testData
            ? { testData: true as const }
            : {}),
        };
      }
      if (reservation.status === "duplicate") {
        if (reservation.state === "quota_rejected") {
          return {
            status: "quota-rejected",
            requestId: reservation.requestId,
            used: limit,
            limit,
            verifyAvailable: !verified,
          };
        }
        return {
          status: "unavailable",
          safeMessage: "This lookup is already being handled.",
          retryable: true,
        };
      }

      const [commerceResult, registrationResult, dnsResult, certificateResult] =
        await Promise.allSettled([
          dependencies.commerce.lookup(normalized.domain),
          dependencies.registration.lookup(normalized.domain),
          dependencies.dns.lookup(normalized.domain),
          dependencies.certificate.inspect(normalized.domain),
        ]);

      const commercialResult = commerceResult.status === "fulfilled"
        ? commerceResult.value
        : {
            code: "unavailable" as const,
            safeMessage: "RayName commerce is temporarily unavailable",
            retryable: true,
          };
      if (isFailure(commercialResult)) {
        await dependencies.repository.fail({
          requestId: reservation.requestId,
          code: `rayname_${commercialResult.code}`,
          completedAt: dependencies.now(),
        }).catch(() => undefined);
        return {
          status: "unavailable",
          safeMessage: commercialResult.safeMessage,
          retryable: commercialResult.retryable,
        };
      }

      const registrationFacts = settledValue(registrationResult);
      const dnsSummary = settledValue(dnsResult);
      const certificateSummary = settledValue(certificateResult);
      const result: DomainIntelligenceResult = {
        domain: normalized.domain,
        commercial: commercialResult,
        registration: registrationFacts,
        dns: dnsSummary,
        certificate: certificateSummary,
        checkedAt: dependencies.now().toISOString(),
      };

      try {
        const allowance = await dependencies.repository.succeed({
          requestId: reservation.requestId,
          result,
          providers: providerSummary({
            commercial: commercialResult,
            registration: registrationFacts,
            dns: dnsSummary,
            certificate: certificateSummary,
            testData: dependencies.config.enabled &&
              dependencies.config.testData === true,
          }),
          completedAt: dependencies.now(),
          limit,
        });
        return {
          status: "success",
          requestId: reservation.requestId,
          result,
          replayed: false,
          used: allowance.used,
          limit: allowance.limit,
          ...(dependencies.config.enabled && dependencies.config.testData
            ? { testData: true as const }
            : {}),
        };
      } catch {
        await dependencies.repository.fail({
          requestId: reservation.requestId,
          code: "completion_failed",
          completedAt: dependencies.now(),
        }).catch(() => undefined);
        return databaseUnavailable;
      }
    },

    async compare(input) {
      if (!dependencies.config.enabled) {
        return {
          status: "not-enabled",
          safeMessage: "RayFox Domain Intelligence isn't enabled here yet.",
        };
      }
      const owned = await dependencies.repository.getOwnedQuery({
        requestId: input.requestId,
        discordUserId: input.discordUserId,
      }).catch(() => null);
      if (!owned || owned.status !== "succeeded" || !owned.result) {
        return {
          status: "not-owned",
          safeMessage: "This result belongs to another member or has expired",
        };
      }

      const prices = await dependencies.commerce
        .listTldPrices(owned.result.domain.label)
        .catch(() => ({
          code: "unavailable" as const,
          safeMessage: "RayName pricing is temporarily unavailable",
          retryable: true,
        }));
      if (isFailure(prices)) {
        return { status: "unavailable", safeMessage: prices.safeMessage };
      }

      const sorted = sortPrices(prices, input.sort);
      const pageCount = Math.max(1, Math.ceil(sorted.length / 5));
      const page = Math.min(Math.max(Math.trunc(input.page), 1), pageCount);
      return {
        status: "success",
        requestId: input.requestId,
        sort: input.sort,
        page,
        pageCount,
        rows: sorted.slice((page - 1) * 5, page * 5),
        ...(dependencies.config.enabled && dependencies.config.testData
          ? { testData: true as const }
          : {}),
      };
    },
  };
}

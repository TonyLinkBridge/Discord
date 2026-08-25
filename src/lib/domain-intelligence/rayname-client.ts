import "server-only";

import { z } from "zod";

import { createTtlCache } from "./ttl-cache";
import type {
  Money,
  NormalizedDomain,
  RayNameCommercialResult,
  RayNameTldPrice,
  SafeProviderFailure,
} from "./types";

type RayNameClientConfig = {
  apiBaseUrl: string;
  apiToken: string;
};

export interface RayNameCommerceProvider {
  lookup(
    domain: NormalizedDomain,
  ): Promise<RayNameCommercialResult | SafeProviderFailure>;
  listTldPrices(
    label: string,
  ): Promise<RayNameTldPrice[] | SafeProviderFailure>;
}

const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const availability = z.enum([
  "available",
  "registered",
  "reserved",
  "unknown",
]);
const checkedAt = z.string().datetime({ offset: true });

const lookupSchema = z.object({
  availability,
  premium: z.boolean(),
  premiumRenewal: z.boolean().nullable(),
  currency,
  registrationPrice: decimal.nullable(),
  renewalPrice: decimal.nullable(),
  transferPrice: decimal.nullable(),
  transferEligible: z.boolean().nullable(),
  destination: z.string().url(),
  checkedAt,
});

const tldPriceSchema = z.object({
  tld: z.string().regex(/^\.[a-z0-9-]{2,63}$/),
  availability,
  premium: z.boolean(),
  currency,
  registrationPrice: decimal.nullable(),
  renewalPrice: decimal.nullable(),
  transferPrice: decimal.nullable(),
  destination: z.string().url(),
  checkedAt,
});

const priceListSchema = z.object({ prices: z.array(tldPriceSchema).max(1_000) });

const failure = {
  malformed: {
    code: "malformed",
    safeMessage: "RayName returned an invalid commerce response",
    retryable: false,
  },
  rate_limited: {
    code: "rate_limited",
    safeMessage: "RayName commerce is temporarily rate limited",
    retryable: true,
  },
  timeout: {
    code: "timeout",
    safeMessage: "RayName commerce timed out",
    retryable: true,
  },
  unavailable: {
    code: "unavailable",
    safeMessage: "RayName commerce is temporarily unavailable",
    retryable: true,
  },
} satisfies Record<string, SafeProviderFailure>;

function isRayNameDestination(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      (url.hostname === "rayname.com" ||
        url.hostname.endsWith(".rayname.com")) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function money(amount: string | null, isoCurrency: string): Money | null {
  return amount === null ? null : { amount, currency: isoCurrency };
}

function validCommercialSemantics(
  value: z.infer<typeof lookupSchema>,
): boolean {
  if (!isRayNameDestination(value.destination)) return false;
  if (value.availability === "available") {
    return value.registrationPrice !== null && value.renewalPrice !== null;
  }
  return true;
}

function commercialResult(
  value: z.infer<typeof lookupSchema>,
): RayNameCommercialResult {
  return {
    availability: value.availability,
    premium: value.premium,
    premiumRenewal: value.premiumRenewal,
    registrationPrice: money(value.registrationPrice, value.currency),
    renewalPrice: money(value.renewalPrice, value.currency),
    transferPrice: money(value.transferPrice, value.currency),
    transferEligible: value.transferEligible,
    destination: value.destination,
    checkedAt: value.checkedAt,
  };
}

function priceResult(value: z.infer<typeof tldPriceSchema>): RayNameTldPrice {
  return {
    tld: value.tld,
    availability: value.availability,
    premium: value.premium,
    registrationPrice: money(value.registrationPrice, value.currency),
    renewalPrice: money(value.renewalPrice, value.currency),
    transferPrice: money(value.transferPrice, value.currency),
    destination: value.destination,
    checkedAt: value.checkedAt,
  };
}

function requestFailure(error: unknown): SafeProviderFailure {
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return failure.timeout;
  }
  return failure.unavailable;
}

export function createRayNameCommerceClient(
  config: RayNameClientConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): RayNameCommerceProvider {
  const lookupCache = createTtlCache<string, RayNameCommercialResult>({
    maxEntries: 1_000,
    now,
  });
  const priceCache = createTtlCache<string, RayNameTldPrice[]>({
    maxEntries: 1_000,
    now,
  });
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiToken}`,
  };

  async function request(path: string): Promise<Response | SafeProviderFailure> {
    try {
      const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 429) return failure.rate_limited;
      if (!response.ok) return failure.unavailable;
      return response;
    } catch (error) {
      return requestFailure(error);
    }
  }

  return {
    async lookup(domain) {
      const cached = lookupCache.get(domain.ascii);
      if (cached) return cached;

      const response = await request(
        `/v1/domains/lookup?domain=${encodeURIComponent(domain.ascii)}`,
      );
      if (!(response instanceof Response)) return response;

      const parsed = lookupSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success || !validCommercialSemantics(parsed.data)) {
        return failure.malformed;
      }
      const result = commercialResult(parsed.data);
      lookupCache.set(domain.ascii, result, 60_000);
      return result;
    },

    async listTldPrices(label) {
      const normalizedLabel = label.toLowerCase();
      const cached = priceCache.get(normalizedLabel);
      if (cached) return cached;

      const response = await request(
        `/v1/tlds/prices?label=${encodeURIComponent(normalizedLabel)}`,
      );
      if (!(response instanceof Response)) return response;

      const parsed = priceListSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (
        !parsed.success ||
        parsed.data.prices.some(
          (row) =>
            !isRayNameDestination(row.destination) ||
            (row.availability === "available" &&
              (row.registrationPrice === null || row.renewalPrice === null)),
        )
      ) {
        return failure.malformed;
      }
      const result = parsed.data.prices.map(priceResult);
      priceCache.set(normalizedLabel, result, 15 * 60_000);
      return result;
    },
  };
}

import { describe, expect, test } from "vitest";

import type { DomainSearchOutcome } from "./service";
import { verifyOutboundToken } from "./link-token";
import { createDomainOutcomeLinks } from "./outbound-links";

const signingKey = Buffer.alloc(32, 29).toString("base64");
const now = new Date("2026-08-26T00:00:00.000Z");
const requestId = "9cd5530b-3527-4af0-bf5d-27b2a3284ab1";

function success(availability: "available" | "registered"): DomainSearchOutcome {
  return {
    status: "success",
    requestId,
    replayed: false,
    used: 1,
    limit: 3,
    presentation: "live-commerce",
    result: {
      domain: {
        ascii: "lucidgrid.ai",
        unicode: "lucidgrid.ai",
        label: "lucidgrid",
        tld: "ai",
      },
      commercial: {
        availability,
        premium: false,
        premiumRenewal: null,
        registrationPrice: null,
        renewalPrice: null,
        transferPrice: null,
        transferEligible: null,
        destination: "https://www.rayname.com/domain/lucidgrid.ai",
        checkedAt: now.toISOString(),
      },
      registration: null,
      dns: null,
      certificate: null,
      checkedAt: now.toISOString(),
    },
  };
}

function payload(url: string) {
  const token = new URL(url).pathname.split("/").at(-1) ?? "";
  return verifyOutboundToken({ token, signingKey, now });
}

describe("Discord domain outcome links", () => {
  test("creates a signed register link for an available domain", () => {
    const links = createDomainOutcomeLinks({
      outcome: success("available"),
      publicBaseUrl: "https://bot.rayname.com",
      signingKey,
      now,
    });

    expect(links.fullIntelligence).toBeNull();
    expect(payload(links.primary!)).toMatchObject({ action: "register", requestId });
  });

  test("creates signed transfer and intelligence links for a registered domain", () => {
    const links = createDomainOutcomeLinks({
      outcome: success("registered"),
      publicBaseUrl: "https://bot.rayname.com/",
      signingKey,
      now,
    });

    expect(payload(links.primary!)).toMatchObject({ action: "transfer", requestId });
    expect(payload(links.fullIntelligence!)).toMatchObject({
      action: "full_intelligence",
      requestId,
    });
  });

  test("creates only a signed continuation link after the daily limit", () => {
    const outcome: DomainSearchOutcome = {
      status: "quota-rejected",
      requestId,
      used: 1,
      limit: 1,
      verifyAvailable: true,
    };
    const links = createDomainOutcomeLinks({
      outcome,
      publicBaseUrl: "https://bot.rayname.com",
      signingKey,
      now,
    });

    expect(payload(links.primary!)).toMatchObject({
      action: "continue_on_site",
      requestId,
    });
    expect(links.fullIntelligence).toBeNull();
  });

  test("uses a neutral RayName continuation for public intelligence", () => {
    const outcome = {
      ...success("available"),
      presentation: "public-intelligence" as const,
    };
    const links = createDomainOutcomeLinks({
      outcome,
      publicBaseUrl: "https://bot.rayname.com",
      signingKey,
      now,
    });

    expect(payload(links.primary!)).toMatchObject({
      action: "continue_on_site",
      requestId,
    });
    expect(links.fullIntelligence).toBeNull();
  });

  test("does not create links for unsuccessful provider states", () => {
    expect(createDomainOutcomeLinks({
      outcome: {
        status: "unavailable",
        safeMessage: "Try again",
        retryable: true,
      },
      publicBaseUrl: "https://bot.rayname.com",
      signingKey,
      now,
    })).toEqual({ primary: null, fullIntelligence: null });
  });
});

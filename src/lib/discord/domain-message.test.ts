// @vitest-environment node

import { describe, expect, test } from "vitest";

import type {
  DomainComparisonOutcome,
  DomainSearchOutcome,
} from "@/lib/domain-intelligence/service";
import type { DomainIntelligenceResult } from "@/lib/domain-intelligence/types";

import {
  renderDomainComparison,
  renderDomainOutcome,
  type DiscordWebhookMessage,
} from "./domain-message";

const baseResult: DomainIntelligenceResult = {
  domain: {
    ascii: "lucidgrid.ai",
    unicode: "lucidgrid.ai",
    label: "lucidgrid",
    tld: "ai",
  },
  commercial: {
    availability: "available",
    premium: false,
    premiumRenewal: null,
    registrationPrice: { amount: "79.00", currency: "USD" },
    renewalPrice: { amount: "89.00", currency: "USD" },
    transferPrice: { amount: "74.00", currency: "USD" },
    transferEligible: null,
    destination: "https://www.rayname.com/domain/search?domain=lucidgrid.ai",
    checkedAt: "2026-08-26T00:00:00.000Z",
  },
  registration: null,
  dns: null,
  certificate: null,
  checkedAt: "2026-08-26T00:00:00.000Z",
};

const links = {
  primary: "https://rayname.local/api/rayfox/outbound/register-token",
  fullIntelligence: "https://rayname.local/api/rayfox/outbound/full-token",
};

function success(
  result: DomainIntelligenceResult = baseResult,
): Extract<DomainSearchOutcome, { status: "success" }> {
  return {
    status: "success",
    requestId: "72345678-1234-4234-8234-123456789012",
    result,
    replayed: false,
    used: 1,
    limit: 3,
  };
}

function expectWithinDiscordLimits(message: DiscordWebhookMessage) {
  expect(message.embeds?.length ?? 0).toBeLessThanOrEqual(10);
  for (const embed of message.embeds ?? []) {
    expect(embed.title?.length ?? 0).toBeLessThanOrEqual(256);
    expect(embed.description?.length ?? 0).toBeLessThanOrEqual(4_096);
    expect(embed.fields?.length ?? 0).toBeLessThanOrEqual(25);
    for (const field of embed.fields ?? []) {
      expect(field.name.length).toBeLessThanOrEqual(256);
      expect(field.value.length).toBeLessThanOrEqual(1_024);
    }
    expect(embed.footer?.text.length ?? 0).toBeLessThanOrEqual(2_048);
  }
  expect(message.components?.length ?? 0).toBeLessThanOrEqual(5);
  for (const row of message.components ?? []) {
    expect(row.components.length).toBeLessThanOrEqual(5);
    for (const component of row.components) {
      expect(component.label.length).toBeLessThanOrEqual(80);
      expect(component.custom_id?.length ?? 0).toBeLessThanOrEqual(100);
    }
  }
}

describe("RayFox domain result messages", () => {
  test("renders an available RayName-first card with native compact copy", () => {
    const message = renderDomainOutcome(success(), links);
    expect(message.embeds?.[0]).toMatchObject({
      title: "lucidgrid.ai",
      description: expect.stringContaining("**Available**"),
      color: 0x7c3aed,
      footer: { text: "2 of 3 searches left today" },
    });
    const serialized = JSON.stringify(message);
    expect(serialized).toContain("RayName pricing");
    expect(serialized).toContain("Register on RayName");
    expect(serialized).toContain("Compare extensions");
    expect(serialized).not.toContain("rawWhois");
    expectWithinDiscordLimits(message);
  });

  test("renders registered intelligence and a transfer CTA", () => {
    const result: DomainIntelligenceResult = {
      ...baseResult,
      commercial: {
        ...baseResult.commercial,
        availability: "registered",
        transferEligible: true,
      },
      registration: {
        state: "found",
        registrar: "Example Registrar",
        registrarUrl: "https://registrar.example/",
        createdAt: "2020-01-02T00:00:00.000Z",
        updatedAt: "2025-03-04T00:00:00.000Z",
        expiresAt: "2027-01-02T00:00:00.000Z",
        statuses: ["client transfer prohibited"],
        nameservers: ["ns1.example.net", "ns2.example.net"],
        dnssec: true,
        source: {
          kind: "rdap",
          name: "rdap.registry.example",
          checkedAt: baseResult.checkedAt,
        },
      },
      dns: { a: [], aaaa: [], mx: [], txt: [], ns: ["ns1.example.net"], checkedAt: baseResult.checkedAt },
      certificate: {
        issuerCommonName: "Example Trust CA",
        subjectCommonName: "lucidgrid.ai",
        validFrom: "2026-08-01T00:00:00.000Z",
        validTo: "2026-10-30T23:59:59.000Z",
        protocol: "TLSv1.3",
        checkedAt: baseResult.checkedAt,
      },
    };

    const message = renderDomainOutcome(success(result), links);
    const serialized = JSON.stringify(message);
    expect(message.embeds?.[0].description).toContain("**Registered**");
    expect(serialized).toContain("Example Registrar");
    expect(serialized).toContain("DNSSEC signed");
    expect(serialized).toContain("Transfer to RayName");
    expect(serialized).toContain("View full intelligence");
    expectWithinDiscordLimits(message);
  });

  test.each([
    [true, "Premium pricing applies on renewal."],
    [false, "Renews at the standard RayName rate."],
  ])("explains premium renewal semantics when premiumRenewal=%s", (premiumRenewal, copy) => {
    const outcome = success({
      ...baseResult,
      commercial: {
        ...baseResult.commercial,
        premium: true,
        premiumRenewal,
        registrationPrice: { amount: "2499.00", currency: "USD" },
      },
    });
    const serialized = JSON.stringify(renderDomainOutcome(outcome, links));
    expect(serialized).toContain("Premium domain");
    expect(serialized).toContain("USD 2499.00");
    expect(serialized).toContain(copy);
  });

  test("renders the exact exhausted message and verification CTA for members", () => {
    const outcome: DomainSearchOutcome = {
      status: "quota-rejected",
      requestId: "72345678-1234-4234-8234-123456789012",
      used: 1,
      limit: 1,
      verifyAvailable: true,
    };
    const message = renderDomainOutcome(outcome, links);
    const serialized = JSON.stringify(message);
    expect(message.embeds?.[0].description).toBe(
      "**You’re out of Discord searches for today.**\nKeep going on RayName for live pricing, availability, and the full lookup.",
    );
    expect(serialized).toContain("Continue on RayName");
    expect(serialized).toContain("Verify your RayName account");
    expectWithinDiscordLimits(message);
  });

  test("renders the honest RayName unavailable message without substitute pricing", () => {
    const message = renderDomainOutcome({
      status: "unavailable",
      safeMessage: "upstream details must not be shown",
      retryable: true,
    }, { primary: null, fullIntelligence: null });
    expect(message.embeds?.[0].description).toBe(
      "**RayName pricing is temporarily unavailable.**\nWe didn’t count this search. Try again in a moment.",
    );
    expect(JSON.stringify(message)).not.toContain("upstream details");
  });

  test("stays useful when every optional enrichment is unavailable", () => {
    const message = renderDomainOutcome(success({
      ...baseResult,
      registration: null,
      dns: null,
      certificate: null,
    }), links);
    const fields = message.embeds?.[0].fields ?? [];
    expect(fields.map(({ name }) => name)).toEqual([
      "Register",
      "Renew",
      "Transfer",
    ]);
    expectWithinDiscordLimits(message);
  });
});

describe("RayFox extension comparison messages", () => {
  test("renders five rows with sort and pagination controls", () => {
    const outcome: DomainComparisonOutcome = {
      status: "success",
      requestId: "72345678-1234-4234-8234-123456789012",
      sort: "registration",
      page: 2,
      pageCount: 3,
      rows: ["com", "ai", "io", "net", "org"].map((tld, index) => ({
        tld: `.${tld}`,
        availability: "available" as const,
        premium: false,
        registrationPrice: { amount: `${10 + index}.00`, currency: "USD" },
        renewalPrice: { amount: `${20 + index}.00`, currency: "USD" },
        transferPrice: { amount: `${9 + index}.00`, currency: "USD" },
        destination: `https://www.rayname.com/domain/search?domain=lucidgrid.${tld}`,
        checkedAt: baseResult.checkedAt,
      })),
    };
    const message = renderDomainComparison(outcome);
    expect(message.embeds?.[0]).toMatchObject({
      title: "Extension price board",
      footer: { text: "Page 2 of 3 · Sorted by registration" },
    });
    expect(message.embeds?.[0].fields).toHaveLength(5);
    const serialized = JSON.stringify(message);
    expect(serialized).toContain("Sort: renewal");
    expect(serialized).toContain("Previous");
    expect(serialized).toContain("Next");
    expectWithinDiscordLimits(message);
  });
});

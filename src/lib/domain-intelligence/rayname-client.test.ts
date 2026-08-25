import { describe, expect, test, vi } from "vitest";

import type { NormalizedDomain } from "./types";
import { createRayNameCommerceClient } from "./rayname-client";

const domain: NormalizedDomain = {
  ascii: "example.com",
  unicode: "example.com",
  label: "example",
  tld: "com",
};

const lookupPayload = {
  availability: "available",
  premium: false,
  premiumRenewal: null,
  currency: "USD",
  registrationPrice: "12.99",
  renewalPrice: "14.99",
  transferPrice: "11.99",
  transferEligible: null,
  destination: "https://www.rayname.com/domain/search?domain=example.com",
  checkedAt: "2026-08-25T15:00:00.000Z",
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function client(input: {
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}) {
  return createRayNameCommerceClient(
    {
      apiBaseUrl: "https://api.rayname.com",
      apiToken: "private-test-token-never-log",
    },
    input.fetchImpl,
    input.now,
  );
}

describe("RayName commerce lookup", () => {
  test("returns validated RayName prices and sends the server token only in authorization", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(lookupPayload));

    await expect(client({ fetchImpl }).lookup(domain)).resolves.toEqual({
      availability: "available",
      premium: false,
      premiumRenewal: null,
      registrationPrice: { amount: "12.99", currency: "USD" },
      renewalPrice: { amount: "14.99", currency: "USD" },
      transferPrice: { amount: "11.99", currency: "USD" },
      transferEligible: null,
      destination: lookupPayload.destination,
      checkedAt: lookupPayload.checkedAt,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.rayname.com/v1/domains/lookup?domain=example.com",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer private-test-token-never-log",
        },
      }),
    );
  });

  test.each([
    { ...lookupPayload, availability: "maybe" },
    { ...lookupPayload, currency: "US" },
    { ...lookupPayload, registrationPrice: "12 dollars" },
    { ...lookupPayload, registrationPrice: null },
    { ...lookupPayload, checkedAt: "not-a-date" },
    { ...lookupPayload, destination: "https://example.com/buy" },
  ])("rejects malformed successful payload %#", async (payload) => {
    const result = await client({
      fetchImpl: vi.fn().mockResolvedValue(json(payload)),
    }).lookup(domain);

    expect(result).toEqual({
      code: "malformed",
      safeMessage: "RayName returned an invalid commerce response",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("private-test-token");
  });

  test.each([
    [429, "rate_limited", true],
    [500, "unavailable", true],
  ] as const)("maps HTTP %i to %s without exposing its body", async (status, code, retryable) => {
    const result = await client({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("private upstream diagnostic", { status }),
      ),
    }).lookup(domain);

    expect(result).toMatchObject({ code, retryable });
    expect(JSON.stringify(result)).not.toContain("private upstream diagnostic");
  });

  test("maps a timeout without caching the failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(json(lookupPayload));
    const commerce = client({ fetchImpl });

    await expect(commerce.lookup(domain)).resolves.toMatchObject({
      code: "timeout",
      retryable: true,
    });
    await expect(commerce.lookup(domain)).resolves.toMatchObject({
      availability: "available",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("caches a successful lookup for less than 60 seconds", async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(json(lookupPayload));
    const commerce = client({ fetchImpl, now: () => now });

    await commerce.lookup(domain);
    now = 59_999;
    await commerce.lookup(domain);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 60_000;
    await commerce.lookup(domain);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("RayName TLD price catalogue", () => {
  test("returns validated rows and caches them for less than 15 minutes", async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        prices: [
          {
            tld: ".com",
            availability: "available",
            premium: false,
            currency: "USD",
            registrationPrice: "12.99",
            renewalPrice: "14.99",
            transferPrice: "11.99",
            destination: "https://www.rayname.com/domain/search?domain=example.com",
            checkedAt: "2026-08-25T15:00:00.000Z",
          },
        ],
      }),
    );
    const commerce = client({ fetchImpl, now: () => now });

    await expect(commerce.listTldPrices("example")).resolves.toEqual([
      {
        tld: ".com",
        availability: "available",
        premium: false,
        registrationPrice: { amount: "12.99", currency: "USD" },
        renewalPrice: { amount: "14.99", currency: "USD" },
        transferPrice: { amount: "11.99", currency: "USD" },
        destination: "https://www.rayname.com/domain/search?domain=example.com",
        checkedAt: "2026-08-25T15:00:00.000Z",
      },
    ]);
    now = 899_999;
    await commerce.listTldPrices("example");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 900_000;
    await commerce.listTldPrices("example");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

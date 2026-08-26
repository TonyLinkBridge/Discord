import { describe, expect, test, vi } from "vitest";

import { createOutboundToken } from "@/lib/domain-intelligence/link-token";
import type {
  DomainConversionAction,
  StoredDomainQuery,
} from "@/lib/domain-intelligence/repository";

import { createRayfoxOutboundGet } from "./route";

const signingKey = Buffer.alloc(32, 23).toString("base64");
const requestId = "9cd5530b-3527-4af0-bf5d-27b2a3284ab1";
const now = new Date("2026-08-26T00:00:00.000Z");

function storedQuery(
  destination = "https://www.rayname.com/domain/lucidgrid.ai?currency=USD",
): StoredDomainQuery {
  return {
    id: requestId,
    discordUserId: "1541000000000000001",
    normalizedDomain: "lucidgrid.ai",
    tier: "member",
    status: "succeeded",
    completedAt: now,
    result: {
      domain: {
        ascii: "lucidgrid.ai",
        unicode: "lucidgrid.ai",
        label: "lucidgrid",
        tld: "ai",
      },
      commercial: {
        availability: "available",
        premium: false,
        premiumRenewal: false,
        registrationPrice: { amount: "79.00", currency: "USD" },
        renewalPrice: { amount: "79.00", currency: "USD" },
        transferPrice: { amount: "79.00", currency: "USD" },
        transferEligible: true,
        destination,
        checkedAt: now.toISOString(),
      },
      registration: null,
      dns: null,
      certificate: null,
      checkedAt: now.toISOString(),
    },
  };
}

function setup(query: StoredDomainQuery | null = storedQuery()) {
  const repository = {
    getQueryForOutbound: vi.fn().mockResolvedValue(query),
    recordConversion: vi.fn().mockResolvedValue("recorded" as const),
  };
  const get = createRayfoxOutboundGet({
    signingKey,
    domainPageBaseUrl: "https://www.rayname.com/domain/intelligence/",
    repository,
    now: () => now,
  });
  return { get, repository };
}

function token(action: DomainConversionAction, createdAt = now) {
  return createOutboundToken({
    requestId,
    action,
    now: createdAt,
    signingKey,
  });
}

function request(value: string) {
  return new Request(
    `http://localhost/api/rayfox/outbound/${value}?destination=https://attacker.example/steal&email=member@example.com`,
  );
}

async function call(
  get: ReturnType<typeof createRayfoxOutboundGet>,
  value: string,
) {
  return get(request(value), { params: Promise.resolve({ token: value }) });
}

describe("RayFox outbound route", () => {
  test.each([
    ["register", "register"],
    ["transfer", "transfer"],
    ["full_intelligence", "full-intelligence"],
  ] as const)("redirects %s through the stored RayName destination", async (action, content) => {
    const { get, repository } = setup();
    const value = token(action);

    const response = await call(get, value);
    const location = response.headers.get("location") ?? "";

    expect(response.status).toBe(302);
    expect(location).toContain("https://www.rayname.com/domain/lucidgrid.ai?");
    expect(location).toContain("currency=USD");
    expect(location).toContain("utm_source=discord");
    expect(location).toContain("utm_medium=rayfox");
    expect(location).toContain("utm_campaign=domain-intelligence");
    expect(location).toContain(`utm_content=${content}`);
    expect(location).toContain(`rayfox_id=${requestId}`);
    expect(location).not.toContain(value);
    expect(location).not.toContain("member%40example.com");
    expect(location).not.toContain("1541000000000000001");
    expect(repository.recordConversion).toHaveBeenCalledWith({
      requestId,
      action,
      destination: location,
      occurredAt: now,
    });
  });

  test("builds the daily-limit destination from the configured RayName page", async () => {
    const query = storedQuery();
    query.status = "quota_rejected";
    query.result = null;
    const { get, repository } = setup(query);

    const response = await call(get, token("continue_on_site"));
    const location = response.headers.get("location") ?? "";

    expect(response.status).toBe(302);
    expect(location).toContain(
      "https://www.rayname.com/domain/intelligence/lucidgrid.ai?",
    );
    expect(location).toContain("utm_content=limit");
    expect(repository.recordConversion).toHaveBeenCalledOnce();
  });

  test("allows an idempotent browser retry", async () => {
    const { get, repository } = setup();
    repository.recordConversion.mockResolvedValue("duplicate");

    const response = await call(get, token("register"));

    expect(response.status).toBe(302);
  });

  test("returns one generic 404 for invalid, expired, or missing queries", async () => {
    const invalid = setup();
    const invalidResponse = await call(invalid.get, "not-a-token");
    expect(invalidResponse.status).toBe(404);
    expect(await invalidResponse.text()).toBe("Not found");
    expect(invalid.repository.getQueryForOutbound).not.toHaveBeenCalled();

    const expiredValue = token(
      "register",
      new Date("2026-08-24T00:00:00.000Z"),
    );
    const expiredResponse = await call(invalid.get, expiredValue);
    expect(expiredResponse.status).toBe(404);

    const missing = setup(null);
    const missingResponse = await call(missing.get, token("register"));
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toBe("Not found");
  });

  test("rejects an untrusted stored destination and ignores request URLs", async () => {
    const { get, repository } = setup(
      storedQuery("https://attacker.example/buy/lucidgrid.ai"),
    );

    const response = await call(get, token("register"));

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(repository.recordConversion).not.toHaveBeenCalled();
  });

  test("does not redirect when the click can no longer be attributed", async () => {
    const { get, repository } = setup();
    repository.recordConversion.mockResolvedValue("not-found");

    const response = await call(get, token("register"));

    expect(response.status).toBe(404);
  });
});

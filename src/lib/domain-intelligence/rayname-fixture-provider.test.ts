// @vitest-environment node

import { describe, expect, test } from "vitest";

import { normalizeDomain } from "./input";
import { createRayNameFixtureProvider } from "./rayname-fixture-provider";

const now = new Date("2026-08-26T00:00:00.000Z");

function domain(value: string) {
  const normalized = normalizeDomain(value);
  if (!normalized.valid) throw new Error("invalid test domain");
  return normalized.domain;
}

describe("RayName internal fixture provider", () => {
  test.each([
    ["rayfox-available-test.com", "available", false],
    ["rayfox-registered-test.com", "registered", false],
    ["rayfox-premium-test.ai", "available", true],
  ] as const)("returns deterministic test semantics for %s", async (value, availability, premium) => {
    const provider = createRayNameFixtureProvider({ now: () => now });

    await expect(provider.lookup(domain(value))).resolves.toMatchObject({
      availability,
      premium,
      destination: `https://www.rayname.com/en/search?q=${value}`,
      checkedAt: now.toISOString(),
    });
  });

  test("returns a deterministic extension board with safe RayName destinations", async () => {
    const provider = createRayNameFixtureProvider({ now: () => now });
    const rows = await provider.listTldPrices("rayfox");

    expect(Array.isArray(rows)).toBe(true);
    if (!Array.isArray(rows)) throw new Error("expected fixture prices");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      tld: ".com",
      destination: "https://www.rayname.com/en/search?q=rayfox.com",
    });
  });
});

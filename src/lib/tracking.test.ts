import { expect, test } from "vitest";

import { buildTrackedRayNameUrl } from "./tracking";

test("builds a stable RayName registration URL with campaign attribution", () => {
  expect(
    buildTrackedRayNameUrl({
      destination: "https://www.rayname.com/domain/search",
      campaign: "com-transfer-week",
      source: "discord",
      medium: "community",
      content: "priority-card",
    }),
  ).toBe(
    "https://www.rayname.com/domain/search?utm_campaign=com-transfer-week&utm_content=priority-card&utm_medium=community&utm_source=discord",
  );
});

test("rejects insecure and non-RayName tracking destinations", () => {
  const input = {
    campaign: "com-transfer-week",
    source: "discord",
    medium: "community",
    content: "priority-card",
  };

  expect(() => buildTrackedRayNameUrl({ ...input, destination: "http://www.rayname.com/domain/search" })).toThrow(
    "Tracking destinations must use HTTPS on a RayName domain.",
  );
  expect(() => buildTrackedRayNameUrl({ ...input, destination: "https://example.com/domain/search" })).toThrow(
    "Tracking destinations must use HTTPS on a RayName domain.",
  );
});

test("rejects a RayName destination containing credentials", () => {
  expect(() => buildTrackedRayNameUrl({
    campaign: "renewal-rescue",
    content: "campaign-form",
    destination: "https://attacker:secret@www.rayname.com/domain/search",
    medium: "community",
    source: "discord",
  })).toThrow("Tracking destinations must use HTTPS on a RayName domain without credentials.");
});

test("adds a safe server-generated attribution identifier", () => {
  expect(buildTrackedRayNameUrl({
    campaign: "domain-intelligence",
    content: "register",
    destination: "https://rayname.com/domain/lucidgrid.ai?currency=USD",
    medium: "rayfox",
    source: "discord",
    attributionId: "9cd5530b-3527-4af0-bf5d-27b2a3284ab1",
  })).toBe(
    "https://rayname.com/domain/lucidgrid.ai?currency=USD&rayfox_id=9cd5530b-3527-4af0-bf5d-27b2a3284ab1&utm_campaign=domain-intelligence&utm_content=register&utm_medium=rayfox&utm_source=discord",
  );
});

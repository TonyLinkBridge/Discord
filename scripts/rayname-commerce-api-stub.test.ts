// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  createRayNameCommerceApiStub,
  startRayNameCommerceApiStub,
} from "./rayname-commerce-api-stub.mjs";

const authorization = "Bearer local-rayname-commerce-token-never-production";

function api(path: string, authorized = true) {
  return new Request(`http://127.0.0.1:3115${path}`, {
    headers: authorized ? { authorization } : undefined,
  });
}

function control(mode: string) {
  return new Request("http://127.0.0.1:3115/__test/mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

describe("RayName commerce loopback stub", () => {
  test.each([
    ["available", 200, "available", false, "12.99"],
    ["registered", 200, "registered", false, null],
    ["premium", 200, "available", true, "1299.00"],
  ] as const)(
    "serves deterministic %s lookup data",
    async (mode, status, availability, premium, registrationPrice) => {
      const stub = createRayNameCommerceApiStub();
      expect((await stub.handle(control(mode))).status).toBe(204);

      const response = await stub.handle(
        api("/v1/domains/lookup?domain=lucidgrid.ai"),
      );

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({
        availability,
        premium,
        registrationPrice,
        currency: "USD",
        destination:
          "https://www.rayname.com/domain/search?domain=lucidgrid.ai",
        checkedAt: "2026-08-26T00:00:00.000Z",
      });
    },
  );

  test.each([
    ["malformed", 200],
    ["rate-limited", 429],
    ["unavailable", 503],
  ] as const)("serves the controlled %s response", async (mode, status) => {
    const stub = createRayNameCommerceApiStub();
    await stub.handle(control(mode));

    expect((await stub.handle(
      api("/v1/domains/lookup?domain=lucidgrid.ai"),
    )).status).toBe(status);
  });

  test("serves a deterministic extension price catalogue", async () => {
    const stub = createRayNameCommerceApiStub();
    const response = await stub.handle(api("/v1/tlds/prices?label=lucidgrid"));
    const body = await response.json() as { prices: unknown[] };

    expect(response.status).toBe(200);
    expect(body.prices).toHaveLength(7);
    expect(body.prices[0]).toMatchObject({
      tld: ".com",
      currency: "USD",
      registrationPrice: "12.99",
    });
  });

  test("requires the exact test bearer token and records no credentials", async () => {
    const stub = createRayNameCommerceApiStub();
    expect((await stub.handle(
      api("/v1/domains/lookup?domain=lucidgrid.ai", false),
    )).status).toBe(401);
    expect((await stub.handle(new Request(
      "http://127.0.0.1:3115/v1/domains/lookup?domain=lucidgrid.ai",
      { headers: { authorization: "Bearer wrong-token" } },
    ))).status).toBe(401);

    await stub.handle(api("/v1/domains/lookup?domain=lucidgrid.ai"));
    expect(stub.calls()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: "GET",
        path: "/v1/domains/lookup?domain=lucidgrid.ai",
      }),
    ]));
    expect(JSON.stringify(stub.calls())).not.toContain("token");
  });

  test("refuses to bind outside IPv4 loopback", async () => {
    await expect(startRayNameCommerceApiStub({ host: "0.0.0.0" }))
      .rejects.toThrow("127.0.0.1");
  });
});

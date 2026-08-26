import { createServer } from "node:http";

export const rayNameCommerceStubToken =
  "local-rayname-commerce-token-never-production";

const checkedAt = "2026-08-26T00:00:00.000Z";
const modes = new Set([
  "available",
  "registered",
  "premium",
  "malformed",
  "rate-limited",
  "unavailable",
]);

function json(value, status = 200) {
  return Response.json(value, { status });
}

function lookupPayload(domain, mode) {
  const shared = {
    currency: "USD",
    destination: `https://www.rayname.com/domain/search?domain=${encodeURIComponent(domain)}`,
    checkedAt,
  };
  if (mode === "registered") {
    return {
      availability: "registered",
      premium: false,
      premiumRenewal: null,
      registrationPrice: null,
      renewalPrice: "14.99",
      transferPrice: "11.99",
      transferEligible: true,
      ...shared,
    };
  }
  if (mode === "premium") {
    return {
      availability: "available",
      premium: true,
      premiumRenewal: false,
      registrationPrice: "1299.00",
      renewalPrice: "79.00",
      transferPrice: "1199.00",
      transferEligible: null,
      ...shared,
    };
  }
  return {
    availability: "available",
    premium: false,
    premiumRenewal: null,
    registrationPrice: "12.99",
    renewalPrice: "14.99",
    transferPrice: "11.99",
    transferEligible: null,
    ...shared,
  };
}

const catalogue = [
  [".com", "12.99", "14.99", "11.99"],
  [".ai", "79.00", "89.00", "74.00"],
  [".io", "39.00", "44.00", "36.00"],
  [".co", "29.00", "31.00", "27.00"],
  [".xyz", "2.99", "13.99", "10.99"],
  [".net", "14.99", "16.99", "13.99"],
  [".org", "11.99", "13.99", "10.99"],
];

function pricePayload(label) {
  return {
    prices: catalogue.map(
      ([tld, registrationPrice, renewalPrice, transferPrice]) => ({
        tld,
        availability: "available",
        premium: false,
        currency: "USD",
        registrationPrice,
        renewalPrice,
        transferPrice,
        destination:
          `https://www.rayname.com/domain/search?domain=${encodeURIComponent(label + tld)}`,
        checkedAt,
      }),
    ),
  };
}

export function createRayNameCommerceApiStub() {
  const recordedCalls = [];
  let mode = "available";

  function finish(request, url, response) {
    recordedCalls.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      status: response.status,
    });
    return response;
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (url.hostname !== "127.0.0.1") return json({ error: "Not found" }, 404);

    if (url.pathname === "/__test/calls" && request.method === "GET") {
      return json({ calls: structuredClone(recordedCalls) });
    }
    if (url.pathname === "/__test/reset" && request.method === "POST") {
      recordedCalls.length = 0;
      mode = "available";
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/__test/mode" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !modes.has(body.mode)) {
        return json({ error: "Invalid mode" }, 400);
      }
      mode = body.mode;
      return new Response(null, { status: 204 });
    }

    if (
      request.headers.get("authorization") !==
      `Bearer ${rayNameCommerceStubToken}`
    ) {
      return finish(request, url, json({ error: "Unauthorized" }, 401));
    }
    if (mode === "rate-limited") {
      return finish(request, url, json({ retry_after: 0.01 }, 429));
    }
    if (mode === "unavailable") {
      return finish(request, url, json({ error: "Test unavailable" }, 503));
    }
    if (mode === "malformed") {
      return finish(request, url, json({ availability: "maybe" }));
    }

    if (url.pathname === "/v1/domains/lookup" && request.method === "GET") {
      const domain = url.searchParams.get("domain");
      if (!domain) return finish(request, url, json({ error: "Missing domain" }, 400));
      return finish(request, url, json(lookupPayload(domain, mode)));
    }
    if (url.pathname === "/v1/tlds/prices" && request.method === "GET") {
      const label = url.searchParams.get("label");
      if (!label) return finish(request, url, json({ error: "Missing label" }, 400));
      return finish(request, url, json(pricePayload(label)));
    }
    return finish(request, url, json({ error: "Not found" }, 404));
  }

  return {
    handle,
    calls: () => structuredClone(recordedCalls),
    reset() {
      recordedCalls.length = 0;
      mode = "available";
    },
  };
}

export async function startRayNameCommerceApiStub({
  host = "127.0.0.1",
  port = 3115,
} = {}) {
  if (host !== "127.0.0.1") {
    throw new Error("RayName commerce API stub may bind only to 127.0.0.1");
  }
  const stub = createRayNameCommerceApiStub();
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${host}:${port}${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers: incoming.headers,
      body,
    });
    const response = await stub.handle(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    ...stub,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

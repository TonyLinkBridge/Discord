// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { NormalizedDomain } from "./types";
import { createRegistrationClient } from "./registration-client";
import type { WhoisTransport } from "./whois-transport";

const domain: NormalizedDomain = {
  ascii: "example.com",
  unicode: "example.com",
  label: "example",
  tld: "com",
};

const bootstrap = {
  version: "1.0",
  services: [[['com'], ["https://rdap.registry.example/v1/"]]],
};

const rdapDomain = {
  objectClassName: "domain",
  ldhName: "EXAMPLE.COM",
  status: ["client transfer prohibited", "active"],
  nameservers: [{ ldhName: "NS2.EXAMPLE.NET" }, { ldhName: "NS1.EXAMPLE.NET" }],
  secureDNS: { delegationSigned: true },
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2025-08-14T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2027-08-13T04:00:00Z" },
  ],
  entities: [
    {
      roles: ["registrant"],
      vcardArray: ["vcard", [["fn", {}, "text", "Private Person"]]],
    },
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["fn", {}, "text", "Example Registrar, Inc."],
          ["url", {}, "uri", "https://registrar.example"],
          ["email", {}, "text", "private@example.com"],
        ],
      ],
    },
  ],
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unusedWhois(): WhoisTransport {
  return { query: vi.fn().mockRejectedValue(new Error("WHOIS should not run")) };
}

describe("registration client", () => {
  test("uses authoritative RDAP first, normalizes safe fields, and caches facts", async () => {
    let time = 1_000;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(bootstrap))
      .mockResolvedValueOnce(json(rdapDomain))
      .mockResolvedValueOnce(json(rdapDomain));
    const whois = unusedWhois();
    const provider = createRegistrationClient({
      fetchImpl,
      whois,
      now: () => time,
    });

    const first = await provider.lookup(domain);
    expect(first).toEqual({
      state: "found",
      registrar: "Example Registrar, Inc.",
      registrarUrl: "https://registrar.example/",
      createdAt: "1995-08-14T04:00:00.000Z",
      updatedAt: "2025-08-14T04:00:00.000Z",
      expiresAt: "2027-08-13T04:00:00.000Z",
      statuses: ["active", "client transfer prohibited"],
      nameservers: ["ns1.example.net", "ns2.example.net"],
      dnssec: true,
      source: {
        kind: "rdap",
        name: "rdap.registry.example",
        checkedAt: "1970-01-01T00:00:01.000Z",
      },
    });
    expect(JSON.stringify(first)).not.toContain("Private Person");
    expect(JSON.stringify(first)).not.toContain("private@example.com");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://rdap.registry.example/v1/domain/example.com",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(whois.query).not.toHaveBeenCalled();

    await provider.lookup(domain);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    time += 60 * 60_000 + 1;
    await provider.lookup(domain);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("keeps the IANA bootstrap for 24 hours", async () => {
    let time = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("data.iana.org") ? json(bootstrap) : json(rdapDomain),
    );
    const provider = createRegistrationClient({
      fetchImpl,
      whois: unusedWhois(),
      now: () => time,
    });

    await provider.lookup(domain);
    time += 60 * 60_000 + 1;
    await provider.lookup(domain);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes("data.iana.org")))
      .toHaveLength(1);

    time += 24 * 60 * 60_000;
    await provider.lookup(domain);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes("data.iana.org")))
      .toHaveLength(2);
  });

  test("falls back through IANA WHOIS only when the TLD has no RDAP service", async () => {
    const whois: WhoisTransport = {
      query: vi.fn()
        .mockResolvedValueOnce("domain: AI\r\nwhois: whois.nic.ai\r\n")
        .mockResolvedValueOnce([
          "Domain Name: EXAMPLE.AI",
          "Registrar: Native Registrar",
          "Registrar URL: https://native.example",
          "Creation Date: 2020-01-02T03:04:05Z",
          "Updated Date: 2025-02-03T04:05:06Z",
          "Registry Expiry Date: 2027-01-02T03:04:05Z",
          "Domain Status: clientTransferProhibited https://icann.org/epp",
          "Name Server: NS2.EXAMPLE.NET",
          "Name Server: NS1.EXAMPLE.NET",
          "DNSSEC: signedDelegation",
          "Registrant Email: never-store@example.com",
        ].join("\r\n")),
    };
    const provider = createRegistrationClient({
      fetchImpl: vi.fn().mockResolvedValue(json({ version: "1.0", services: [] })),
      whois,
      now: () => Date.parse("2026-08-26T00:00:00Z"),
    });

    const value = await provider.lookup({ ...domain, ascii: "example.ai", tld: "ai" });
    expect(value).toMatchObject({
      state: "found",
      registrar: "Native Registrar",
      registrarUrl: "https://native.example/",
      statuses: ["clienttransferprohibited"],
      nameservers: ["ns1.example.net", "ns2.example.net"],
      dnssec: true,
      source: { kind: "whois", name: "whois.nic.ai" },
    });
    expect(JSON.stringify(value)).not.toContain("never-store@example.com");
    expect(whois.query).toHaveBeenNthCalledWith(1, "whois.iana.org", "ai", 4_000);
    expect(whois.query).toHaveBeenNthCalledWith(2, "whois.nic.ai", "example.ai", 4_000);
  });

  test("uses WHOIS after an authoritative endpoint reports unsupported", async () => {
    const whois: WhoisTransport = {
      query: vi.fn()
        .mockResolvedValueOnce("whois: whois.example.net\r\n")
        .mockResolvedValueOnce("Domain Name: EXAMPLE.COM\r\n"),
    };
    const provider = createRegistrationClient({
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(json(bootstrap))
        .mockResolvedValueOnce(json({}, 501)),
      whois,
      now: () => 0,
    });

    await expect(provider.lookup(domain)).resolves.toMatchObject({
      state: "found",
      source: { kind: "whois", name: "whois.example.net" },
    });
  });

  test("treats an authoritative 404 as not found without claiming availability", async () => {
    const whois = unusedWhois();
    const provider = createRegistrationClient({
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(json(bootstrap))
        .mockResolvedValueOnce(json({}, 404)),
      whois,
      now: () => 0,
    });

    await expect(provider.lookup(domain)).resolves.toMatchObject({
      state: "not-found",
      registrar: null,
      source: { kind: "rdap" },
    });
    expect(whois.query).not.toHaveBeenCalled();
  });

  test("does not fall back or cache malformed RDAP data", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(bootstrap))
      .mockResolvedValue(json({ objectClassName: "domain", entities: "unsafe" }));
    const whois = unusedWhois();
    const provider = createRegistrationClient({ fetchImpl, whois, now: () => 0 });

    await expect(provider.lookup(domain)).resolves.toMatchObject({ code: "malformed" });
    await expect(provider.lookup(domain)).resolves.toMatchObject({ code: "malformed" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(whois.query).not.toHaveBeenCalled();
  });
});

// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { NormalizedDomain } from "./types";
import {
  CertificateConnectionError,
  createCertificateClient,
} from "./certificate-client";

const domain: NormalizedDomain = {
  ascii: "example.com",
  unicode: "example.com",
  label: "example",
  tld: "com",
};

const peer = {
  issuer: { CN: "Example Trust CA" },
  subject: { CN: "example.com" },
  valid_from: "Aug  1 00:00:00 2026 GMT",
  valid_to: "Oct 30 23:59:59 2026 GMT",
  protocol: "TLSv1.3",
  raw: Buffer.from("certificate bytes that must not escape"),
};

describe("certificate client", () => {
  test("connects to the validated public address while preserving domain SNI", async () => {
    const resolve = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const connect = vi.fn().mockResolvedValue(peer);
    const client = createCertificateClient({
      resolve,
      connect,
      now: () => Date.parse("2026-08-26T00:00:00Z"),
    });

    const result = await client.inspect(domain);
    expect(connect).toHaveBeenCalledWith({
      host: "93.184.216.34",
      port: 443,
      servername: "example.com",
      timeoutMs: 4_000,
    });
    expect(result).toEqual({
      issuerCommonName: "Example Trust CA",
      subjectCommonName: "example.com",
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-10-30T23:59:59.000Z",
      protocol: "TLSv1.3",
      checkedAt: "2026-08-26T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("certificate bytes");
  });

  test.each([
    [["127.0.0.1"]],
    [["93.184.216.34", "10.0.0.8"]],
    [["fe80::1"]],
  ])("does not connect when DNS includes a non-public address", async (addresses) => {
    const connect = vi.fn();
    const client = createCertificateClient({
      resolve: vi.fn().mockResolvedValue(addresses),
      connect,
    });

    await expect(client.inspect(domain)).resolves.toMatchObject({
      code: "not_supported",
      retryable: false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  test("maps certificate errors safely and does not cache failures", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("CERT_HAS_EXPIRED example.com"));
    const client = createCertificateClient({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      connect,
    });

    await expect(client.inspect(domain)).resolves.toEqual({
      code: "unavailable",
      safeMessage: "Certificate enrichment is temporarily unavailable",
      retryable: true,
    });
    await client.inspect(domain);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test("maps connection timeout safely", async () => {
    const client = createCertificateClient({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      connect: vi.fn().mockRejectedValue(new CertificateConnectionError("timeout")),
    });

    await expect(client.inspect(domain)).resolves.toMatchObject({
      code: "timeout",
      retryable: true,
    });
  });

  test("normalizes Node certificates that expose more than one common name", async () => {
    const client = createCertificateClient({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      connect: vi.fn().mockResolvedValue({
        ...peer,
        issuer: { CN: ["Primary Trust CA", "Alternate Trust CA"] },
        subject: { CN: ["example.com", "www.example.com"] },
      }),
      now: () => 0,
    });

    await expect(client.inspect(domain)).resolves.toMatchObject({
      issuerCommonName: "Primary Trust CA",
      subjectCommonName: "example.com",
    });
  });

  test("caches successful certificate summaries for fifteen minutes", async () => {
    let time = 0;
    const connect = vi.fn().mockResolvedValue(peer);
    const client = createCertificateClient({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      connect,
      now: () => time,
    });

    await client.inspect(domain);
    await client.inspect(domain);
    expect(connect).toHaveBeenCalledTimes(1);

    time = 15 * 60_000 + 1;
    await client.inspect(domain);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});

import "server-only";

import { lookup } from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";

import { isPublicIp } from "./network-safety";
import { createTtlCache } from "./ttl-cache";
import type {
  CertificateSummary,
  NormalizedDomain,
  SafeProviderFailure,
} from "./types";

export type CertificateConnectionInput = {
  host: string;
  port: 443;
  servername: string;
  timeoutMs: number;
};

export type CertificatePeer = {
  issuer?: { CN?: string | string[] };
  subject?: { CN?: string | string[] };
  valid_from?: string;
  valid_to?: string;
  protocol?: string | null;
  raw?: Buffer;
};

export type CertificateClientDependencies = {
  resolve(host: string): Promise<string[]>;
  connect(input: CertificateConnectionInput): Promise<CertificatePeer>;
  now?: () => number;
};

export interface CertificateProvider {
  inspect(
    domain: NormalizedDomain,
  ): Promise<CertificateSummary | SafeProviderFailure>;
}

export class CertificateConnectionError extends Error {
  constructor(readonly code: "timeout" | "unavailable") {
    super(`Certificate connection failed: ${code}`);
    this.name = "CertificateConnectionError";
  }
}

async function resolveAddresses(host: string) {
  return (await lookup(host, { all: true, verbatim: true })).map(
    ({ address }) => address,
  );
}

function connectCertificate(
  input: CertificateConnectionInput,
): Promise<CertificatePeer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = tlsConnect({
      host: input.host,
      port: input.port,
      servername: input.servername,
      rejectUnauthorized: true,
    });

    function fail(error: CertificateConnectionError) {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    }

    socket.setTimeout(input.timeoutMs);
    socket.once("timeout", () => fail(new CertificateConnectionError("timeout")));
    socket.once("error", () => fail(new CertificateConnectionError("unavailable")));
    socket.once("secureConnect", () => {
      if (settled) return;
      const peer = socket.getPeerCertificate();
      if (!peer || !Object.keys(peer).length) {
        fail(new CertificateConnectionError("unavailable"));
        return;
      }
      settled = true;
      socket.end();
      resolve({
        issuer: peer.issuer,
        subject: peer.subject,
        valid_from: peer.valid_from,
        valid_to: peer.valid_to,
        protocol: socket.getProtocol(),
        raw: peer.raw,
      });
    });
  });
}

const nodeDependencies: CertificateClientDependencies = {
  resolve: resolveAddresses,
  connect: connectCertificate,
};

const timeoutFailure: SafeProviderFailure = {
  code: "timeout",
  safeMessage: "Certificate enrichment timed out",
  retryable: true,
};

const unavailableFailure: SafeProviderFailure = {
  code: "unavailable",
  safeMessage: "Certificate enrichment is temporarily unavailable",
  retryable: true,
};

const unsafeFailure: SafeProviderFailure = {
  code: "not_supported",
  safeMessage: "Certificate inspection is unavailable for a non-public host",
  retryable: false,
};

function isoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeText(raw: string | string[] | undefined): string | null {
  const selected = Array.isArray(raw) ? raw[0] : raw;
  if (!selected) return null;
  const value = selected.trim();
  return value && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.slice(0, 253)
    : null;
}

export function createCertificateClient(
  dependencies: CertificateClientDependencies = nodeDependencies,
): CertificateProvider {
  const now = dependencies.now ?? Date.now;
  const cache = createTtlCache<string, CertificateSummary>({
    maxEntries: 1_000,
    now,
  });

  return {
    async inspect(domain) {
      const cached = cache.get(domain.ascii);
      if (cached) return cached;

      let addresses: string[];
      try {
        addresses = await dependencies.resolve(domain.ascii);
      } catch {
        return unavailableFailure;
      }
      if (!addresses.length || addresses.some((address) => !isPublicIp(address))) {
        return unsafeFailure;
      }

      try {
        const peer = await dependencies.connect({
          host: addresses[0],
          port: 443,
          servername: domain.ascii,
          timeoutMs: 4_000,
        });
        const result: CertificateSummary = {
          issuerCommonName: safeText(peer.issuer?.CN),
          subjectCommonName: safeText(peer.subject?.CN),
          validFrom: isoDate(peer.valid_from),
          validTo: isoDate(peer.valid_to),
          protocol: safeText(peer.protocol ?? undefined),
          checkedAt: new Date(now()).toISOString(),
        };
        cache.set(domain.ascii, result, 15 * 60_000);
        return result;
      } catch (error) {
        return error instanceof CertificateConnectionError && error.code === "timeout"
          ? timeoutFailure
          : unavailableFailure;
      }
    },
  };
}

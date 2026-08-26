import "server-only";

import {
  resolve4,
  resolve6,
  resolveMx,
  resolveNs,
  resolveTxt,
} from "node:dns/promises";

import { createTtlCache } from "./ttl-cache";
import type {
  DnsSummary,
  NormalizedDomain,
  SafeProviderFailure,
} from "./types";

type MxRecord = { exchange: string; priority: number };

export type DnsClientDependencies = {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<MxRecord[]>;
  resolveTxt(host: string): Promise<string[][]>;
  resolveNs(host: string): Promise<string[]>;
  now?: () => number;
};

export interface DnsProvider {
  lookup(domain: NormalizedDomain): Promise<DnsSummary | SafeProviderFailure>;
}

const nodeDependencies: DnsClientDependencies = {
  resolve4,
  resolve6,
  resolveMx,
  resolveTxt,
  resolveNs,
};

const timeoutFailure: SafeProviderFailure = {
  code: "timeout",
  safeMessage: "DNS enrichment timed out",
  retryable: true,
};

const unavailableFailure: SafeProviderFailure = {
  code: "unavailable",
  safeMessage: "DNS enrichment is temporarily unavailable",
  retryable: true,
};

class DnsTimeoutError extends Error {}

function isNoData(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  return code === "ENODATA" || code === "ENOTFOUND";
}

async function optionalRecords<T>(operation: Promise<T[]>): Promise<T[]> {
  try {
    return await operation;
  } catch (error) {
    if (isNoData(error)) return [];
    throw error;
  }
}

function boundedStrings(values: string[], maxLength?: number): string[] {
  return Array.from(
    new Set(values.map((value) => maxLength ? value.slice(0, maxLength) : value)),
  ).sort().slice(0, 10);
}

function hostname(value: string) {
  return value.replace(/\.$/, "").toLowerCase();
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DnsTimeoutError()), 3_000);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createDnsClient(
  dependencies: DnsClientDependencies = nodeDependencies,
): DnsProvider {
  const now = dependencies.now ?? Date.now;
  const cache = createTtlCache<string, DnsSummary>({
    maxEntries: 1_000,
    now,
  });

  return {
    async lookup(domain) {
      const cached = cache.get(domain.ascii);
      if (cached) return cached;

      try {
        const [a, aaaa, mx, txt, ns] = await withTimeout(
          Promise.all([
            optionalRecords(dependencies.resolve4(domain.ascii)),
            optionalRecords(dependencies.resolve6(domain.ascii)),
            optionalRecords(dependencies.resolveMx(domain.ascii)),
            optionalRecords(dependencies.resolveTxt(domain.ascii)),
            optionalRecords(dependencies.resolveNs(domain.ascii)),
          ]),
        );
        const uniqueMx = Array.from(
          new Map(
            mx.map((record) => {
              const normalized = {
                exchange: hostname(record.exchange),
                priority: record.priority,
              };
              return [`${normalized.priority}:${normalized.exchange}`, normalized];
            }),
          ).values(),
        )
          .sort((left, right) =>
            left.priority - right.priority ||
            left.exchange.localeCompare(right.exchange),
          )
          .slice(0, 10);
        const summary: DnsSummary = {
          a: boundedStrings(a),
          aaaa: boundedStrings(aaaa),
          mx: uniqueMx,
          txt: boundedStrings(txt.map((chunks) => chunks.join("")), 512),
          ns: boundedStrings(ns.map(hostname)),
          checkedAt: new Date(now()).toISOString(),
        };
        cache.set(domain.ascii, summary, 5 * 60_000);
        return summary;
      } catch (error) {
        return error instanceof DnsTimeoutError
          ? timeoutFailure
          : unavailableFailure;
      }
    },
  };
}

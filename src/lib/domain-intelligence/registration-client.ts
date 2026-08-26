import "server-only";

import { isIP } from "node:net";
import { z } from "zod";

import { isPublicIp, normalizeWhoisHost } from "./network-safety";
import { createTtlCache } from "./ttl-cache";
import type {
  NormalizedDomain,
  RegistrationFacts,
  SafeProviderFailure,
} from "./types";
import {
  createWhoisTransport,
  WhoisTransportError,
  type WhoisTransport,
} from "./whois-transport";

const ianaBootstrapUrl = "https://data.iana.org/rdap/dns.json";

const bootstrapSchema = z.object({
  version: z.string().optional(),
  services: z.array(z.tuple([z.array(z.string()), z.array(z.string().url())])),
});

const rdapEventSchema = z.object({
  eventAction: z.string(),
  eventDate: z.string(),
});

const rdapEntitySchema = z.object({
  roles: z.array(z.string()).optional(),
  vcardArray: z.tuple([z.literal("vcard"), z.array(z.array(z.unknown()))]).optional(),
});

const rdapSchema = z.object({
  objectClassName: z.literal("domain"),
  ldhName: z.string().optional(),
  status: z.array(z.string()).optional(),
  nameservers: z.array(z.object({ ldhName: z.string() })).optional(),
  secureDNS: z.object({ delegationSigned: z.boolean().optional() }).optional(),
  events: z.array(rdapEventSchema).optional(),
  entities: z.array(rdapEntitySchema).optional(),
});

const failures = {
  malformed: {
    code: "malformed",
    safeMessage: "Registration data was not in a safe supported format",
    retryable: false,
  },
  timeout: {
    code: "timeout",
    safeMessage: "Registration lookup timed out",
    retryable: true,
  },
  unavailable: {
    code: "unavailable",
    safeMessage: "Registration data is temporarily unavailable",
    retryable: true,
  },
  not_supported: {
    code: "not_supported",
    safeMessage: "Registration data is not supported for this extension",
    retryable: false,
  },
} satisfies Record<string, SafeProviderFailure>;

export interface RegistrationProvider {
  lookup(
    domain: NormalizedDomain,
  ): Promise<RegistrationFacts | SafeProviderFailure>;
}

export type RegistrationClientDependencies = {
  fetchImpl?: typeof fetch;
  whois?: WhoisTransport;
  now?: () => number;
};

function isFailure(
  value: RegistrationFacts | SafeProviderFailure,
): value is SafeProviderFailure {
  return "code" in value;
}

function safeIso(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeRdapBase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      (isIP(url.hostname) !== 0 && !isPublicIp(url.hostname))
    ) {
      return null;
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return null;
  }
}

function emptyFacts(
  state: RegistrationFacts["state"],
  source: RegistrationFacts["source"],
): RegistrationFacts {
  return {
    state,
    registrar: null,
    registrarUrl: null,
    createdAt: null,
    updatedAt: null,
    expiresAt: null,
    statuses: [],
    nameservers: [],
    dnssec: null,
    source,
  };
}

function eventDate(
  events: z.infer<typeof rdapEventSchema>[] | undefined,
  names: string[],
): string | null {
  const event = events?.find(({ eventAction }) =>
    names.includes(eventAction.toLowerCase()),
  );
  return safeIso(event?.eventDate);
}

function vcardValue(entity: z.infer<typeof rdapEntitySchema>, name: string) {
  const rows = entity.vcardArray?.[1] ?? [];
  const row = rows.find((candidate) => candidate[0] === name);
  return typeof row?.[3] === "string" ? row[3] : null;
}

function parseRdap(
  payload: unknown,
  sourceName: string,
  checkedAt: string,
): RegistrationFacts | SafeProviderFailure {
  const parsed = rdapSchema.safeParse(payload);
  if (!parsed.success) return failures.malformed;

  const registrar = parsed.data.entities?.find((entity) =>
    entity.roles?.some((role) => role.toLowerCase() === "registrar"),
  );
  const nameservers = Array.from(
    new Set(
      (parsed.data.nameservers ?? []).map(({ ldhName }) =>
        ldhName.replace(/\.$/, "").toLowerCase(),
      ),
    ),
  ).sort();

  return {
    state: "found",
    registrar: registrar ? vcardValue(registrar, "fn") : null,
    registrarUrl: registrar ? safeUrl(vcardValue(registrar, "url")) : null,
    createdAt: eventDate(parsed.data.events, ["registration"]),
    updatedAt: eventDate(parsed.data.events, ["last changed", "last update of rdap database"]),
    expiresAt: eventDate(parsed.data.events, ["expiration"]),
    statuses: Array.from(
      new Set((parsed.data.status ?? []).map((status) => status.toLowerCase())),
    ).sort(),
    nameservers,
    dnssec: parsed.data.secureDNS?.delegationSigned ?? null,
    source: { kind: "rdap", name: sourceName, checkedAt },
  };
}

function firstWhoisValue(raw: string, field: string): string | null {
  const expression = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "im");
  return raw.match(expression)?.[1]?.trim() ?? null;
}

function allWhoisValues(raw: string, field: string): string[] {
  const expression = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "gim");
  return Array.from(raw.matchAll(expression), (match) => match[1].trim());
}

function parseWhois(raw: string, sourceName: string, checkedAt: string) {
  const domainName = firstWhoisValue(raw, "Domain Name");
  if (!domainName) return emptyFacts("not-supported", null);

  const statuses = allWhoisValues(raw, "Domain Status")
    .map((value) => value.split(/\s+/)[0].toLowerCase());
  const nameservers = allWhoisValues(raw, "Name Server")
    .map((value) => value.split(/\s+/)[0].replace(/\.$/, "").toLowerCase());
  const dnssec = firstWhoisValue(raw, "DNSSEC");

  return {
    state: "found" as const,
    registrar: firstWhoisValue(raw, "Registrar"),
    registrarUrl: safeUrl(firstWhoisValue(raw, "Registrar URL")),
    createdAt: safeIso(
      firstWhoisValue(raw, "Creation Date") ??
        firstWhoisValue(raw, "Created On") ?? undefined,
    ),
    updatedAt: safeIso(
      firstWhoisValue(raw, "Updated Date") ??
        firstWhoisValue(raw, "Last Updated On") ?? undefined,
    ),
    expiresAt: safeIso(
      firstWhoisValue(raw, "Registry Expiry Date") ??
        firstWhoisValue(raw, "Expiration Date") ?? undefined,
    ),
    statuses: Array.from(new Set(statuses)).sort(),
    nameservers: Array.from(new Set(nameservers)).sort(),
    dnssec:
      dnssec === null
        ? null
        : /^(signeddelegation|yes|signed)$/i.test(dnssec),
    source: { kind: "whois" as const, name: sourceName, checkedAt },
  };
}

function requestFailure(error: unknown): SafeProviderFailure {
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return failures.timeout;
  }
  return failures.unavailable;
}

export function createRegistrationClient(
  dependencies: RegistrationClientDependencies = {},
): RegistrationProvider {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const whois = dependencies.whois ?? createWhoisTransport();
  const now = dependencies.now ?? Date.now;
  const bootstrapCache = createTtlCache<string, z.infer<typeof bootstrapSchema>>({
    maxEntries: 1,
    now,
  });
  const factsCache = createTtlCache<string, RegistrationFacts>({
    maxEntries: 1_000,
    now,
  });

  async function fetchBootstrap() {
    const cached = bootstrapCache.get("iana-dns");
    if (cached) return cached;
    let response: Response;
    try {
      response = await fetchImpl(ianaBootstrapUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      return requestFailure(error);
    }
    if (!response.ok) return failures.unavailable;
    const parsed = bootstrapSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) return failures.malformed;
    bootstrapCache.set("iana-dns", parsed.data, 24 * 60 * 60_000);
    return parsed.data;
  }

  async function lookupWhois(
    value: NormalizedDomain,
    checkedAt: string,
  ): Promise<RegistrationFacts | SafeProviderFailure> {
    try {
      const iana = await whois.query("whois.iana.org", value.tld, 4_000);
      const referral = normalizeWhoisHost(
        iana.match(/^whois:\s*(\S+)\s*$/im)?.[1] ?? "",
      );
      if (!referral) return failures.malformed;
      const raw = await whois.query(referral, value.ascii, 4_000);
      return parseWhois(raw, referral, checkedAt);
    } catch (error) {
      if (error instanceof WhoisTransportError && error.code === "timeout") {
        return failures.timeout;
      }
      return failures.unavailable;
    }
  }

  return {
    async lookup(value) {
      const cached = factsCache.get(value.ascii);
      if (cached) return cached;
      const checkedAt = new Date(now()).toISOString();

      const bootstrap = await fetchBootstrap();
      if ("code" in bootstrap) return bootstrap;
      const service = bootstrap.services.find(([tlds]) =>
        tlds.some((tld) => tld.toLowerCase() === value.tld),
      );
      const base = service?.[1].map(safeRdapBase).find(Boolean) ?? null;
      let result: RegistrationFacts | SafeProviderFailure;

      if (!base) {
        result = await lookupWhois(value, checkedAt);
      } else {
        let response: Response;
        try {
          response = await fetchImpl(
            new URL(`domain/${encodeURIComponent(value.ascii)}`, base).toString(),
            {
              cache: "no-store",
              headers: { Accept: "application/rdap+json, application/json" },
              signal: AbortSignal.timeout(5_000),
            },
          );
        } catch (error) {
          return requestFailure(error);
        }

        const sourceName = new URL(base).hostname;
        if (response.status === 404) {
          result = emptyFacts("not-found", {
            kind: "rdap",
            name: sourceName,
            checkedAt,
          });
        } else if ([400, 405, 415, 501].includes(response.status)) {
          result = await lookupWhois(value, checkedAt);
        } else if (!response.ok) {
          result = response.status === 429
            ? { ...failures.unavailable, code: "rate_limited" }
            : failures.unavailable;
        } else {
          result = parseRdap(
            await response.json().catch(() => null),
            sourceName,
            checkedAt,
          );
        }
      }

      if (!isFailure(result)) factsCache.set(value.ascii, result, 60 * 60_000);
      return result;
    },
  };
}

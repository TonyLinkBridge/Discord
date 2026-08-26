// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import type { CertificateProvider } from "./certificate-client";
import type { DnsProvider } from "./dns-client";
import type { RayNameCommerceProvider } from "./rayname-client";
import type { RegistrationProvider } from "./registration-client";
import type { DomainQueryRepository } from "./repository";
import { createDomainIntelligenceService } from "./service";
import type {
  CertificateSummary,
  DnsSummary,
  DomainIntelligenceResult,
  RayNameCommercialResult,
  RegistrationFacts,
} from "./types";

const now = new Date("2026-08-26T00:00:00.000Z");
const guildId = "1540610722281824336";
const verifiedRoleId = "1540611679023276114";
const betaRoleId = "1541478390924837005";
const testerRoleId = "1541478390924837006";
const discordUserId = "223456789012345678";

const commercial: RayNameCommercialResult = {
  availability: "available",
  premium: false,
  premiumRenewal: null,
  registrationPrice: { amount: "12.99", currency: "USD" },
  renewalPrice: { amount: "14.99", currency: "USD" },
  transferPrice: { amount: "11.99", currency: "USD" },
  transferEligible: null,
  destination: "https://www.rayname.com/domain/search?domain=example.com",
  checkedAt: "2026-08-26T00:00:00.000Z",
};

const registration: RegistrationFacts = {
  state: "found",
  registrar: "Example Registrar",
  registrarUrl: "https://registrar.example/",
  createdAt: "1995-08-14T04:00:00.000Z",
  updatedAt: null,
  expiresAt: "2027-08-13T04:00:00.000Z",
  statuses: ["active"],
  nameservers: ["ns1.example.net"],
  dnssec: true,
  source: {
    kind: "rdap",
    name: "rdap.registry.example",
    checkedAt: "2026-08-26T00:00:00.000Z",
  },
};

const dns: DnsSummary = {
  a: ["93.184.216.34"],
  aaaa: [],
  mx: [],
  txt: [],
  ns: ["ns1.example.net"],
  checkedAt: "2026-08-26T00:00:00.000Z",
};

const certificate: CertificateSummary = {
  issuerCommonName: "Example Trust CA",
  subjectCommonName: "example.com",
  validFrom: "2026-08-01T00:00:00.000Z",
  validTo: "2026-10-30T23:59:59.000Z",
  protocol: "TLSv1.3",
  checkedAt: "2026-08-26T00:00:00.000Z",
};

function repository(
  beginResult: Awaited<ReturnType<DomainQueryRepository["begin"]>> = {
    status: "started",
    requestId: "request-1",
  },
): DomainQueryRepository {
  return {
    begin: vi.fn().mockResolvedValue(beginResult),
    succeed: vi.fn().mockResolvedValue({ used: 1, limit: 1 }),
    fail: vi.fn().mockResolvedValue(undefined),
    getOwnedQuery: vi.fn().mockResolvedValue(null),
    getQueryForOutbound: vi.fn().mockResolvedValue(null),
    recordConversion: vi.fn().mockResolvedValue("not-found"),
  };
}

function providers() {
  const commerce: RayNameCommerceProvider = {
    lookup: vi.fn().mockResolvedValue(commercial),
    listTldPrices: vi.fn().mockResolvedValue([]),
  };
  const registrationProvider: RegistrationProvider = {
    lookup: vi.fn().mockResolvedValue(registration),
  };
  const dnsProvider: DnsProvider = {
    lookup: vi.fn().mockResolvedValue(dns),
  };
  const certificateProvider: CertificateProvider = {
    inspect: vi.fn().mockResolvedValue(certificate),
  };
  return { commerce, registration: registrationProvider, dns: dnsProvider, certificate: certificateProvider };
}

function service(input: {
  mode?: "internal" | "public";
  enabled?: boolean;
  testData?: boolean;
  betaRoleIds?: string[];
  testerRoleIds?: string[];
  testerUserIds?: string[];
  repository?: DomainQueryRepository;
  providers?: ReturnType<typeof providers>;
}) {
  const external = input.providers ?? providers();
  const data = input.repository ?? repository();
  return {
    data,
    external,
    service: createDomainIntelligenceService({
      config: input.enabled === false
        ? { enabled: false }
        : {
            enabled: true,
            mode: input.mode ?? "internal",
            betaRoleIds: input.betaRoleIds ?? [betaRoleId],
            testerRoleIds: input.testerRoleIds ?? [],
            testerUserIds: input.testerUserIds ?? [],
            verifiedRoleId,
            ...(input.testData ? { testData: true as const } : {}),
          },
      repository: data,
      commerce: external.commerce,
      registration: external.registration,
      dns: external.dns,
      certificate: external.certificate,
      now: () => now,
    }),
  };
}

function searchInput(roleIds = [betaRoleId]) {
  return {
    interactionId: "interaction-1",
    guildId,
    discordUserId,
    roleIds,
    rawDomain: " Example.COM. ",
  };
}

describe("domain intelligence service search", () => {
  test("fails closed when disabled or outside the internal beta", async () => {
    const disabled = service({ enabled: false });
    await expect(disabled.service.search(searchInput())).resolves.toEqual({
      status: "not-enabled",
    });
    expect(disabled.data.begin).not.toHaveBeenCalled();
    expect(disabled.external.commerce.lookup).not.toHaveBeenCalled();

    const internal = service({});
    await expect(internal.service.search(searchInput([]))).resolves.toEqual({
      status: "not-enabled",
    });
    expect(internal.data.begin).not.toHaveBeenCalled();

    const publicService = service({ mode: "public" });
    await expect(publicService.service.search(searchInput([]))).resolves.toMatchObject({
      status: "success",
    });
  });

  test("treats the guild @everyone role as an internal beta audience", async () => {
    const internal = service({ betaRoleIds: [guildId] });

    await expect(
      internal.service.search({ ...searchInput([]), guildId }),
    ).resolves.toMatchObject({ status: "success" });
  });

  test("rejects invalid input before reserving allowance", async () => {
    const setup = service({});
    await expect(
      setup.service.search({ ...searchInput(), rawDomain: "https://example.com" }),
    ).resolves.toEqual({ status: "invalid" });
    expect(setup.data.begin).not.toHaveBeenCalled();
    expect(setup.external.commerce.lookup).not.toHaveBeenCalled();
  });

  test("uses only the configured Verified role for the 3-search tier", async () => {
    const member = service({});
    await member.service.search(searchInput([betaRoleId, "1541478305579139132"]));
    expect(member.data.begin).toHaveBeenCalledWith(expect.objectContaining({
      tier: "member",
      limit: 1,
      usageDay: "2026-08-26",
    }));

    const verified = service({});
    vi.mocked(verified.data.succeed).mockResolvedValue({ used: 1, limit: 3 });
    await verified.service.search(searchInput([betaRoleId, verifiedRoleId]));
    expect(verified.data.begin).toHaveBeenCalledWith(expect.objectContaining({
      tier: "verified",
      limit: 3,
    }));
  });

  test("returns quota rejection before any provider call", async () => {
    const data = repository({
      status: "quota-rejected",
      requestId: "request-limit",
      used: 1,
      limit: 1,
    });
    const setup = service({ repository: data });

    await expect(setup.service.search(searchInput())).resolves.toEqual({
      status: "quota-rejected",
      requestId: "request-limit",
      used: 1,
      limit: 1,
      verifyAvailable: true,
    });
    expect(setup.external.commerce.lookup).not.toHaveBeenCalled();
    expect(setup.external.registration.lookup).not.toHaveBeenCalled();
  });

  test("requires RayName commercial data and releases the reservation on failure", async () => {
    const external = providers();
    vi.mocked(external.commerce.lookup).mockResolvedValue({
      code: "unavailable",
      safeMessage: "RayName commerce is temporarily unavailable",
      retryable: true,
    });
    const setup = service({ providers: external });

    await expect(setup.service.search(searchInput())).resolves.toEqual({
      status: "unavailable",
      safeMessage: "RayName commerce is temporarily unavailable",
      retryable: true,
    });
    expect(setup.data.fail).toHaveBeenCalledWith({
      requestId: "request-1",
      code: "rayname_unavailable",
      completedAt: now,
    });
    expect(setup.data.succeed).not.toHaveBeenCalled();
  });

  test("runs providers in parallel and keeps optional failures non-fatal", async () => {
    let resolveCommerce!: (value: RayNameCommercialResult) => void;
    const external = providers();
    vi.mocked(external.commerce.lookup).mockReturnValue(
      new Promise((resolve) => { resolveCommerce = resolve; }),
    );
    vi.mocked(external.registration.lookup).mockResolvedValue({
      code: "timeout",
      safeMessage: "Registration lookup timed out",
      retryable: true,
    });
    vi.mocked(external.dns.lookup).mockRejectedValue(new Error("resolver crashed"));
    const setup = service({ providers: external });

    const pending = setup.service.search(searchInput());
    await vi.waitFor(() => {
      expect(external.registration.lookup).toHaveBeenCalledTimes(1);
      expect(external.dns.lookup).toHaveBeenCalledTimes(1);
      expect(external.certificate.inspect).toHaveBeenCalledTimes(1);
    });
    resolveCommerce(commercial);

    await expect(pending).resolves.toMatchObject({
      status: "success",
      replayed: false,
      used: 1,
      limit: 1,
      result: { registration: null, dns: null, certificate },
    });
    expect(setup.data.succeed).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      providers: {
        commerce: "rayname:2026-08-26T00:00:00.000Z",
        certificate: "tls:2026-08-26T00:00:00.000Z",
      },
    }));
  });

  test("hides fixture commerce from a community member", async () => {
    const setup = service({
      testData: true,
      betaRoleIds: [guildId],
      testerRoleIds: [testerRoleId],
    });

    await expect(setup.service.search(searchInput([]))).resolves.toMatchObject({
      status: "success",
      presentation: "public-intelligence",
    });
  });

  test("shows fixtures only to an explicit tester role or user", async () => {
    const roleTester = service({ testData: true, testerRoleIds: [testerRoleId] });
    await expect(
      roleTester.service.search(searchInput([betaRoleId, testerRoleId])),
    ).resolves.toMatchObject({
      status: "success",
      presentation: "fixture-commerce",
    });

    const userTester = service({ testData: true, testerUserIds: [discordUserId] });
    await expect(userTester.service.search(searchInput())).resolves.toMatchObject({
      status: "success",
      presentation: "fixture-commerce",
    });
  });

  test("marks configured RayName results as live commerce", async () => {
    await expect(service({}).service.search(searchInput())).resolves.toMatchObject({
      status: "success",
      presentation: "live-commerce",
    });
  });

  test("marks fixture outcomes and records the provider as fixture data", async () => {
    const setup = service({ testData: true, testerRoleIds: [testerRoleId] });

    await expect(
      setup.service.search(searchInput([betaRoleId, testerRoleId])),
    ).resolves.toMatchObject({
      status: "success",
      testData: true,
      presentation: "fixture-commerce",
    });
    expect(setup.data.succeed).toHaveBeenCalledWith(expect.objectContaining({
      providers: expect.objectContaining({
        commerce: "fixture:2026-08-26T00:00:00.000Z",
      }),
    }));
  });

  test("replays a stored result without calling any provider or consuming allowance", async () => {
    const stored: DomainIntelligenceResult = {
      domain: { ascii: "example.com", unicode: "example.com", label: "example", tld: "com" },
      commercial,
      registration,
      dns,
      certificate,
      checkedAt: "2026-08-26T00:00:00.000Z",
    };
    const data = repository({
      status: "replay",
      requestId: "request-old",
      result: stored,
      completedAt: now,
      used: 2,
    });
    const setup = service({ repository: data });

    await expect(setup.service.search(searchInput([betaRoleId, verifiedRoleId])))
      .resolves.toEqual({
        status: "success",
        requestId: "request-old",
        result: stored,
        replayed: true,
        used: 2,
        limit: 3,
        presentation: "live-commerce",
      });
    expect(setup.external.commerce.lookup).not.toHaveBeenCalled();
    expect(setup.data.succeed).not.toHaveBeenCalled();
  });
});

describe("domain intelligence service comparison", () => {
  test("requires ownership, sorts by selected price, and returns five rows per page", async () => {
    const data = repository();
    vi.mocked(data.getOwnedQuery).mockResolvedValue({
      id: "request-1",
      discordUserId: "223456789012345678",
      normalizedDomain: "example.com",
      tier: "verified",
      status: "succeeded",
      result: {
        domain: { ascii: "example.com", unicode: "example.com", label: "example", tld: "com" },
        commercial,
        registration: null,
        dns: null,
        certificate: null,
        checkedAt: commercial.checkedAt,
      },
      completedAt: now,
      used: 1,
    });
    const external = providers();
    vi.mocked(external.commerce.listTldPrices).mockResolvedValue(
      ["com", "ai", "net", "org", "io", "co"].map((tld, index) => ({
        tld: `.${tld}`,
        availability: "available" as const,
        premium: false,
        registrationPrice: { amount: String(20 - index), currency: "USD" },
        renewalPrice: { amount: String(index + 1), currency: "USD" },
        transferPrice: { amount: String(10 + index), currency: "USD" },
        destination: `https://www.rayname.com/domain/search?domain=example.${tld}`,
        checkedAt: commercial.checkedAt,
      })),
    );
    const setup = service({ repository: data, providers: external });

    await expect(setup.service.compare({
      requestId: "request-1",
      discordUserId,
      roleIds: [],
      sort: "renewal",
      page: 1,
    })).resolves.toMatchObject({
      status: "success",
      requestId: "request-1",
      sort: "renewal",
      page: 1,
      pageCount: 2,
      presentation: "live-commerce",
      rows: [
        expect.objectContaining({ tld: ".com" }),
        expect.objectContaining({ tld: ".ai" }),
        expect.objectContaining({ tld: ".net" }),
        expect.objectContaining({ tld: ".org" }),
        expect.objectContaining({ tld: ".io" }),
      ],
    });
  });

  test("marks fixture comparison rows as test data", async () => {
    const data = repository();
    vi.mocked(data.getOwnedQuery).mockResolvedValue({
      id: "request-1",
      discordUserId: "223456789012345678",
      normalizedDomain: "example.com",
      tier: "member",
      status: "succeeded",
      result: {
        domain: { ascii: "example.com", unicode: "example.com", label: "example", tld: "com" },
        commercial,
        registration: null,
        dns: null,
        certificate: null,
        checkedAt: commercial.checkedAt,
      },
      completedAt: now,
      used: 1,
    });
    const external = providers();
    vi.mocked(external.commerce.listTldPrices).mockResolvedValue([{
      tld: ".com",
      availability: "available",
      premium: false,
      registrationPrice: { amount: "12.99", currency: "USD" },
      renewalPrice: { amount: "14.99", currency: "USD" },
      transferPrice: { amount: "11.99", currency: "USD" },
      destination: "https://www.rayname.com/en/search?q=example.com",
      checkedAt: commercial.checkedAt,
    }]);
    const setup = service({
      testData: true,
      testerRoleIds: [testerRoleId],
      repository: data,
      providers: external,
    });

    await expect(setup.service.compare({
      requestId: "request-1",
      discordUserId,
      roleIds: [testerRoleId],
      sort: "registration",
      page: 1,
    })).resolves.toMatchObject({
      status: "success",
      testData: true,
      presentation: "fixture-commerce",
    });
  });

  test("rejects fixture comparison for a community member before provider access", async () => {
    const setup = service({
      testData: true,
      betaRoleIds: [guildId],
      testerRoleIds: [testerRoleId],
    });

    await expect(setup.service.compare({
      requestId: "request-1",
      discordUserId,
      roleIds: [],
      sort: "registration",
      page: 1,
    })).resolves.toEqual({
      status: "forbidden",
      safeMessage: "Test pricing is available only to RayFox internal testers",
    });
    expect(setup.data.getOwnedQuery).not.toHaveBeenCalled();
    expect(setup.external.commerce.listTldPrices).not.toHaveBeenCalled();
  });

  test("does not expose another member's query or call the provider", async () => {
    const setup = service({});
    await expect(setup.service.compare({
      requestId: "request-private",
      discordUserId: "different-user",
      roleIds: [],
      sort: "registration",
      page: 1,
    })).resolves.toEqual({
      status: "not-owned",
      safeMessage: "This result belongs to another member or has expired",
    });
    expect(setup.external.commerce.listTldPrices).not.toHaveBeenCalled();
  });
});

describe("domain intelligence service overview", () => {
  test("restores an owned result without reserving another query", async () => {
    const data = repository();
    vi.mocked(data.getOwnedQuery).mockResolvedValue({
      id: "request-1",
      discordUserId,
      normalizedDomain: "example.com",
      tier: "member",
      status: "succeeded",
      result: {
        domain: {
          ascii: "example.com",
          unicode: "example.com",
          label: "example",
          tld: "com",
        },
        commercial,
        registration,
        dns,
        certificate,
        checkedAt: now.toISOString(),
      },
      completedAt: now,
      used: 1,
    });
    const setup = service({
      testData: true,
      betaRoleIds: [guildId],
      testerRoleIds: [testerRoleId],
      repository: data,
    });

    await expect(setup.service.overview({
      requestId: "request-1",
      discordUserId,
      roleIds: [],
    })).resolves.toMatchObject({
      status: "success",
      requestId: "request-1",
      used: 1,
      limit: 1,
      restored: true,
      presentation: "public-intelligence",
    });
    expect(data.begin).not.toHaveBeenCalled();
    expect(setup.external.commerce.lookup).not.toHaveBeenCalled();
  });
});

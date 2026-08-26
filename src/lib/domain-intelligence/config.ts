import "server-only";

const discordIdPattern = /^\d{17,20}$/;

export type DomainIntelligenceConfig =
  | { configured: false; mode: "disabled"; reason: string }
  | {
      configured: true;
      mode: "internal" | "public";
      testData: boolean;
      betaRoleIds: string[];
      readonly commerceApiBaseUrl: string;
      readonly commerceApiToken: string;
      readonly domainPageBaseUrl: string;
      readonly publicBaseUrl: string;
      readonly linkSigningKey: string;
      safe: {
        mode: "internal" | "public";
        commerceHost: string;
        domainPageHost: string;
        publicHost: string;
      };
    };

function unavailable(reason: string): DomainIntelligenceConfig {
  return { configured: false, mode: "disabled", reason };
}

function isRayNameHost(hostname: string): boolean {
  return hostname === "rayname.com" || hostname.endsWith(".rayname.com");
}

function parseCommerceBaseUrl(
  raw: string,
  nodeEnv: string | undefined,
): URL | null {
  try {
    const url = new URL(raw);
    const commonInvalid =
      url.pathname !== "/" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0;
    if (commonInvalid) return null;
    if (nodeEnv === "production") {
      return url.protocol === "https:" && isRayNameHost(url.hostname)
        ? url
        : null;
    }
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port.length > 0
      ? url
      : null;
  } catch {
    return null;
  }
}

function parseDomainPageBaseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !isRayNameHost(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function parsePublicBaseUrl(
  raw: string,
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
  vercelUrl: string | undefined,
): URL | null {
  try {
    const url = new URL(raw);
    if (
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    if (nodeEnv === "production") {
      if (url.protocol !== "https:") return null;
      if (isRayNameHost(url.hostname)) return url;
      if (
        vercelEnv === "preview" &&
        vercelUrl &&
        url.hostname === vercelUrl &&
        url.hostname.endsWith(".vercel.app")
      ) {
        return url;
      }
      return null;
    }
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port.length > 0
      ? url
      : null;
  } catch {
    return null;
  }
}

function parseBetaRoleIds(raw: string | undefined): string[] | null {
  const values = [...new Set((raw ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
  return values.every((value) => discordIdPattern.test(value)) ? values : null;
}

export function getDomainIntelligenceConfig(
  env: Record<string, string | undefined>,
): DomainIntelligenceConfig {
  const mode = env.RAYFOX_DOMAIN_INTELLIGENCE_MODE?.trim() ?? "disabled";
  if (mode === "disabled") {
    return unavailable("RayFox domain intelligence is disabled");
  }
  if (mode !== "internal" && mode !== "public") {
    return unavailable("RAYFOX_DOMAIN_INTELLIGENCE_MODE is invalid");
  }

  const betaRoleIds = parseBetaRoleIds(env.RAYFOX_DOMAIN_BETA_ROLE_IDS);
  if (!betaRoleIds || (mode === "internal" && betaRoleIds.length === 0)) {
    return unavailable("RAYFOX_DOMAIN_BETA_ROLE_IDS is invalid");
  }

  const testDataSetting = env.RAYFOX_DOMAIN_TEST_DATA?.trim() ?? "disabled";
  if (testDataSetting !== "disabled" && testDataSetting !== "enabled") {
    return unavailable("RAYFOX_DOMAIN_TEST_DATA is invalid");
  }
  const testData = testDataSetting === "enabled";
  if (
    testData &&
    (mode !== "internal" ||
      env.VERCEL_ENV !== "preview" ||
      !env.VERCEL_URL?.endsWith(".vercel.app"))
  ) {
    return unavailable("RAYFOX_DOMAIN_TEST_DATA is allowed only in an internal Vercel Preview");
  }

  const commerceApiBaseUrl = env.RAYNAME_COMMERCE_API_BASE_URL?.trim() ?? "";
  const commerceUrl = testData
    ? null
    : parseCommerceBaseUrl(commerceApiBaseUrl, env.NODE_ENV);
  if (!testData && !commerceUrl) {
    return unavailable("RAYNAME_COMMERCE_API_BASE_URL is invalid");
  }

  const commerceApiToken = env.RAYNAME_COMMERCE_API_TOKEN?.trim() ?? "";
  if (!testData && commerceApiToken.length < 20) {
    return unavailable("RAYNAME_COMMERCE_API_TOKEN is invalid");
  }

  const domainPageBaseUrl = env.RAYNAME_DOMAIN_PAGE_BASE_URL?.trim() ?? "";
  const domainPageUrl = parseDomainPageBaseUrl(domainPageBaseUrl);
  if (!domainPageUrl) {
    return unavailable("RAYNAME_DOMAIN_PAGE_BASE_URL is invalid");
  }

  const publicBaseUrl = env.RAYFOX_PUBLIC_BASE_URL?.trim() ?? "";
  const publicUrl = parsePublicBaseUrl(
    publicBaseUrl,
    env.NODE_ENV,
    env.VERCEL_ENV,
    env.VERCEL_URL,
  );
  if (!publicUrl) {
    return unavailable("RAYFOX_PUBLIC_BASE_URL is invalid");
  }
  if (testData && publicUrl.hostname !== env.VERCEL_URL) {
    return unavailable("RAYFOX_PUBLIC_BASE_URL must match the Vercel Preview");
  }

  const linkSigningKey = env.RAYFOX_LINK_SIGNING_KEY?.trim() ?? "";
  if (Buffer.from(linkSigningKey, "base64").length !== 32) {
    return unavailable("RAYFOX_LINK_SIGNING_KEY is invalid");
  }

  const configured = {
    configured: true as const,
    mode,
    testData,
    betaRoleIds,
    safe: {
      mode,
      commerceHost: commerceUrl?.hostname ?? "internal-test-data",
      domainPageHost: domainPageUrl.hostname,
      publicHost: publicUrl.hostname,
    },
  } as Extract<DomainIntelligenceConfig, { configured: true }>;

  for (const [key, value] of Object.entries({
    commerceApiBaseUrl,
    commerceApiToken,
    domainPageBaseUrl,
    publicBaseUrl: publicUrl.origin,
    linkSigningKey,
  })) {
    Object.defineProperty(configured, key, {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  }

  return configured;
}

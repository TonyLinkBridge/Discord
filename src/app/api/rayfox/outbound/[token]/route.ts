import { createDatabase } from "@/lib/database/client";
import { getDatabaseConfig } from "@/lib/database/config";
import { getDomainIntelligenceConfig } from "@/lib/domain-intelligence/config";
import { verifyOutboundToken } from "@/lib/domain-intelligence/link-token";
import {
  createNeonDomainQueryRepository,
  type DomainConversionAction,
  type DomainQueryDatabase,
  type DomainQueryRepository,
  type StoredDomainQuery,
} from "@/lib/domain-intelligence/repository";
import { buildTrackedRayNameUrl } from "@/lib/tracking";

type RouteContext = { params: Promise<{ token: string }> };

const contentByAction: Record<DomainConversionAction, string> = {
  register: "register",
  transfer: "transfer",
  full_intelligence: "full-intelligence",
  continue_on_site: "limit",
};

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function continueDestination(baseUrl: string, normalizedDomain: string) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeURIComponent(normalizedDomain)}`;
  return url.toString();
}

function trustedDestination(
  query: StoredDomainQuery,
  action: DomainConversionAction,
  domainPageBaseUrl: string,
) {
  if (action === "continue_on_site") {
    return continueDestination(domainPageBaseUrl, query.normalizedDomain);
  }
  if (query.status !== "succeeded" || !query.result) return null;
  return query.result.commercial.destination;
}

export function createRayfoxOutboundGet(dependencies: {
  signingKey: string;
  domainPageBaseUrl: string;
  repository: Pick<
    DomainQueryRepository,
    "getQueryForOutbound" | "recordConversion"
  >;
  now(): Date;
}) {
  return async function GET(
    _request: Request,
    context: RouteContext,
  ): Promise<Response> {
    const { token } = await context.params;
    const occurredAt = dependencies.now();
    const payload = verifyOutboundToken({
      token,
      signingKey: dependencies.signingKey,
      now: occurredAt,
    });
    if (!payload) return notFound();

    const query = await dependencies.repository
      .getQueryForOutbound(payload.requestId)
      .catch(() => null);
    if (!query || query.id !== payload.requestId) return notFound();

    const destination = trustedDestination(
      query,
      payload.action,
      dependencies.domainPageBaseUrl,
    );
    if (!destination) return notFound();

    let trackedDestination: string;
    try {
      trackedDestination = buildTrackedRayNameUrl({
        destination,
        source: "discord",
        medium: "rayfox",
        campaign: "domain-intelligence",
        content: contentByAction[payload.action],
        attributionId: payload.requestId,
      });
    } catch {
      return notFound();
    }

    const recorded = await dependencies.repository.recordConversion({
      requestId: payload.requestId,
      action: payload.action,
      destination: trackedDestination,
      occurredAt,
    }).catch(() => "not-found" as const);
    if (recorded === "not-found") return notFound();

    return new Response(null, {
      status: 302,
      headers: {
        location: trackedDestination,
        "cache-control": "no-store",
      },
    });
  };
}

export async function GET(request: Request, context: RouteContext) {
  const domain = getDomainIntelligenceConfig(process.env);
  const database = getDatabaseConfig(process.env);
  if (!domain.configured || !database.configured) return notFound();

  const repository = createNeonDomainQueryRepository(
    createDatabase(database.url) as unknown as DomainQueryDatabase,
  );
  return createRayfoxOutboundGet({
    signingKey: domain.linkSigningKey,
    domainPageBaseUrl: domain.domainPageBaseUrl,
    repository,
    now: () => new Date(),
  })(request, context);
}

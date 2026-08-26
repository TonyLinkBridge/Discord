import "server-only";

import type { DomainSearchOutcome } from "./service";
import type { DomainConversionAction } from "./repository";
import { createOutboundToken } from "./link-token";

type OutcomeLinks = {
  primary: string | null;
  fullIntelligence: string | null;
};

function outboundUrl(input: {
  publicBaseUrl: string;
  signingKey: string;
  requestId: string;
  action: DomainConversionAction;
  now: Date;
}) {
  const token = createOutboundToken({
    requestId: input.requestId,
    action: input.action,
    now: input.now,
    signingKey: input.signingKey,
  });
  return new URL(
    `/api/rayfox/outbound/${encodeURIComponent(token)}`,
    input.publicBaseUrl,
  ).toString();
}

export function createDomainOutcomeLinks(input: {
  outcome: DomainSearchOutcome;
  publicBaseUrl: string;
  signingKey: string;
  now: Date;
}): OutcomeLinks {
  if (
    input.outcome.status !== "success" &&
    input.outcome.status !== "quota-rejected"
  ) {
    return { primary: null, fullIntelligence: null };
  }

  const requestId = input.outcome.requestId;
  if (input.outcome.status === "quota-rejected") {
    return {
      primary: outboundUrl({
        ...input,
        requestId,
        action: "continue_on_site",
      }),
      fullIntelligence: null,
    };
  }

  if (input.outcome.presentation === "public-intelligence") {
    return {
      primary: outboundUrl({
        ...input,
        requestId,
        action: "continue_on_site",
      }),
      fullIntelligence: null,
    };
  }

  const registered =
    input.outcome.result.commercial.availability === "registered";
  return {
    primary: outboundUrl({
      ...input,
      requestId,
      action: registered ? "transfer" : "register",
    }),
    fullIntelligence: registered
      ? outboundUrl({
          ...input,
          requestId,
          action: "full_intelligence",
        })
      : null,
  };
}

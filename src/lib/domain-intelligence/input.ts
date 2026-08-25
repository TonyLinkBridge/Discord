import { domainToASCII, domainToUnicode } from "node:url";

import type { NormalizedDomain } from "./types";

export type NormalizeDomainResult =
  | { valid: true; domain: NormalizedDomain }
  | { valid: false; code: "invalid_domain" };

const domainLabelPattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizeDomain(raw: string): NormalizeDomainResult {
  const trimmed = raw.trim().replace(/\.$/, "");
  const ascii = domainToASCII(trimmed).toLowerCase();
  if (!ascii || ascii.length > 253 || ascii.includes("..")) {
    return { valid: false, code: "invalid_domain" };
  }

  const labels = ascii.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !domainLabelPattern.test(label))
  ) {
    return { valid: false, code: "invalid_domain" };
  }

  return {
    valid: true,
    domain: {
      ascii,
      unicode: domainToUnicode(ascii),
      label: labels.slice(0, -1).join("."),
      tld: labels.at(-1)!,
    },
  };
}

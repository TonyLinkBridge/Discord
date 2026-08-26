import "server-only";

import type { RayNameCommerceProvider } from "./rayname-client";
import type {
  Money,
  NormalizedDomain,
  RayNameCommercialResult,
  RayNameTldPrice,
} from "./types";

const catalogue = [
  [".com", "12.99", "14.99", "11.99"],
  [".ai", "79.00", "89.00", "74.00"],
  [".io", "39.00", "44.00", "36.00"],
  [".co", "29.00", "31.00", "27.00"],
  [".xyz", "2.99", "13.99", "10.99"],
  [".net", "14.99", "16.99", "13.99"],
  [".org", "11.99", "13.99", "10.99"],
] as const;

function money(amount: string): Money {
  return { amount, currency: "USD" };
}

function destination(domain: string) {
  return `https://www.rayname.com/en/search?q=${encodeURIComponent(domain)}`;
}

function testSemantics(domain: NormalizedDomain) {
  if (domain.label.endsWith("-premium-test")) {
    return { availability: "available" as const, premium: true };
  }
  if (domain.label.endsWith("-registered-test")) {
    return { availability: "registered" as const, premium: false };
  }
  return { availability: "available" as const, premium: false };
}

export function createRayNameFixtureProvider(
  dependencies: { now(): Date } = { now: () => new Date() },
): RayNameCommerceProvider {
  return {
    async lookup(domain): Promise<RayNameCommercialResult> {
      const semantics = testSemantics(domain);
      const registered = semantics.availability === "registered";
      const premium = semantics.premium;
      return {
        ...semantics,
        premiumRenewal: premium ? false : null,
        registrationPrice: registered
          ? null
          : money(premium ? "1299.00" : "12.99"),
        renewalPrice: money(premium ? "79.00" : "14.99"),
        transferPrice: money(premium ? "1199.00" : "11.99"),
        transferEligible: registered ? true : null,
        destination: destination(domain.ascii),
        checkedAt: dependencies.now().toISOString(),
      };
    },

    async listTldPrices(label): Promise<RayNameTldPrice[]> {
      const checkedAt = dependencies.now().toISOString();
      return catalogue.map(([tld, registration, renewal, transfer]) => ({
        tld,
        availability: "available",
        premium: false,
        registrationPrice: money(registration),
        renewalPrice: money(renewal),
        transferPrice: money(transfer),
        destination: destination(`${label}${tld}`),
        checkedAt,
      }));
    },
  };
}

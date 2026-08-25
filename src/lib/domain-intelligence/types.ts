export type Money = {
  amount: string;
  currency: string;
};

export type DomainTier = "member" | "verified";

export type NormalizedDomain = {
  ascii: string;
  unicode: string;
  label: string;
  tld: string;
};

export type SafeProviderFailure = {
  code:
    | "unavailable"
    | "timeout"
    | "rate_limited"
    | "malformed"
    | "not_supported";
  safeMessage: string;
  retryable: boolean;
};

export type RayNameCommercialResult = {
  availability: "available" | "registered" | "reserved" | "unknown";
  premium: boolean;
  premiumRenewal: boolean | null;
  registrationPrice: Money | null;
  renewalPrice: Money | null;
  transferPrice: Money | null;
  transferEligible: boolean | null;
  destination: string;
  checkedAt: string;
};

export type RayNameTldPrice = {
  tld: string;
  availability: RayNameCommercialResult["availability"];
  premium: boolean;
  registrationPrice: Money | null;
  renewalPrice: Money | null;
  transferPrice: Money | null;
  destination: string;
  checkedAt: string;
};

export type RegistrationFacts = {
  state: "found" | "not-found" | "not-supported";
  registrar: string | null;
  registrarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  statuses: string[];
  nameservers: string[];
  dnssec: boolean | null;
  source: {
    kind: "rdap" | "whois";
    name: string;
    checkedAt: string;
  } | null;
};

export type DnsSummary = {
  a: string[];
  aaaa: string[];
  mx: Array<{ exchange: string; priority: number }>;
  txt: string[];
  ns: string[];
  checkedAt: string;
};

export type CertificateSummary = {
  issuerCommonName: string | null;
  subjectCommonName: string | null;
  validFrom: string | null;
  validTo: string | null;
  protocol: string | null;
  checkedAt: string;
};

export type DomainIntelligenceResult = {
  domain: NormalizedDomain;
  commercial: RayNameCommercialResult;
  registration: RegistrationFacts | null;
  dns: DnsSummary | null;
  certificate: CertificateSummary | null;
  checkedAt: string;
};

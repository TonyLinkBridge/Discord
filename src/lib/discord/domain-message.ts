import type {
  DomainComparisonOutcome,
  DomainCompareSort,
  DomainPresentation,
  DomainSearchOutcome,
} from "@/lib/domain-intelligence/service";
import type {
  DomainIntelligenceResult,
  Money,
  RayNameTldPrice,
} from "@/lib/domain-intelligence/types";

export type DiscordWebhookMessage = {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
  }>;
  components?: Array<{
    type: 1;
    components: Array<{
      type: 2;
      style: 1 | 2 | 5;
      label: string;
      custom_id?: string;
      url?: string;
      disabled?: boolean;
    }>;
  }>;
};

export type DomainMessageLinks = {
  primary: string | null;
  fullIntelligence: string | null;
  componentOwnerId?: string;
};

type Button = NonNullable<DiscordWebhookMessage["components"]>[number]["components"][number];
type Field = NonNullable<NonNullable<DiscordWebhookMessage["embeds"]>[number]["fields"]>[number];

const rayNamePurple = 0x7c3aed;

function clipped(value: string, maximum: number) {
  return value.length <= maximum
    ? value
    : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}

function field(name: string, value: string, inline = false): Field {
  return {
    name: clipped(name, 256),
    value: clipped(value || "—", 1_024),
    inline,
  };
}

function money(value: Money | null) {
  return value ? `${value.currency} ${value.amount}` : "—";
}

function date(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function linkButton(label: string, url: string): Button {
  return { type: 2, style: 5, label: clipped(label, 80), url };
}

function customButton(
  label: string,
  customId: string,
  style: 1 | 2 = 2,
  disabled = false,
): Button {
  return {
    type: 2,
    style,
    label: clipped(label, 80),
    custom_id: clipped(customId, 100),
    ...(disabled ? { disabled: true } : {}),
  };
}

function actionRows(buttons: Button[]): DiscordWebhookMessage["components"] {
  if (!buttons.length) return undefined;
  return [
    { type: 1, components: buttons.slice(0, 5) },
    ...(buttons.length > 5
      ? [{ type: 1 as const, components: buttons.slice(5, 10) }]
      : []),
  ];
}

function statusCopy(
  result: DomainIntelligenceResult,
  presentation: DomainPresentation,
) {
  if (presentation === "public-intelligence") {
    const registry = result.registration?.state === "found"
      ? "**Registry record found**"
      : result.registration?.state === "not-found"
        ? "**No registry record found**\nThis is not a purchase guarantee."
        : "**Registry status unavailable**";
    return [
      "🛰️ **Live public-domain intelligence**",
      registry,
      "Commercial availability and pricing are confirmed on RayName.",
    ].join("\n");
  }
  const status = result.commercial.availability;
  const label = status === "available"
    ? "Available"
    : status === "registered"
      ? "Registered"
      : status === "reserved"
        ? "Reserved"
        : "Status unavailable";
  return [
    ...(presentation === "fixture-commerce"
      ? ["🧪 **Internal beta · Test data**", "Prices below are fixtures—not live RayName quotes."]
      : []),
    `**${label}**`,
    ...(result.commercial.premium ? ["✨ **Premium domain**"] : []),
    `RayName pricing · checked ${result.commercial.checkedAt.slice(0, 16).replace("T", " ")} UTC`,
  ].join("\n");
}

function commerceFields(result: DomainIntelligenceResult): Field[] {
  const fields: Field[] = [
    field("Register", money(result.commercial.registrationPrice), true),
    field("Renew", money(result.commercial.renewalPrice), true),
    field("Transfer", money(result.commercial.transferPrice), true),
  ];

  if (result.commercial.premium) {
    const renewal = result.commercial.premiumRenewal === true
      ? "Premium pricing applies on renewal."
      : result.commercial.premiumRenewal === false
        ? "Renews at the standard RayName rate."
        : "Renewal treatment is confirmed on RayName.";
    fields.push(field(
      "Premium terms",
      `${renewal}\nFinal price and availability are revalidated on RayName.`,
    ));
  }

  if (result.registration?.state === "found") {
    const record = result.registration;
    fields.push(field("Registry record", [
      `Registrar: ${record.registrar ?? "Not published"}`,
      `Created: ${date(record.createdAt)} · Expires: ${date(record.expiresAt)}`,
      `Updated: ${date(record.updatedAt)}`,
    ].join("\n")));
    if (record.statuses.length) {
      fields.push(field("Domain status", record.statuses.slice(0, 5).join(" · ")));
    }
    if (record.nameservers.length || record.dnssec !== null) {
      fields.push(field("DNS", [
        ...(record.nameservers.length
          ? [record.nameservers.slice(0, 4).join(" · ")]
          : []),
        ...(record.dnssec === null
          ? []
          : [record.dnssec ? "DNSSEC signed" : "DNSSEC not signed"]),
      ].join("\n")));
    }
  } else if (result.dns && (result.dns.ns.length || result.dns.mx.length)) {
    fields.push(field("DNS", [
      ...(result.dns.ns.length ? [`NS: ${result.dns.ns.slice(0, 4).join(" · ")}`] : []),
      ...(result.dns.mx.length
        ? [`MX: ${result.dns.mx.slice(0, 3).map(({ exchange }) => exchange).join(" · ")}`]
        : []),
    ].join("\n")));
  }

  if (result.certificate) {
    fields.push(field("Certificate", [
      result.certificate.issuerCommonName ?? "Issuer not published",
      `Valid until ${date(result.certificate.validTo)}`,
      result.certificate.protocol ?? "Protocol not published",
    ].join(" · ")));
  }
  return fields.slice(0, 7);
}

function checked(value: string) {
  return value.slice(0, 16).replace("T", " ") + " UTC";
}

function publicIntelligenceFields(result: DomainIntelligenceResult): Field[] {
  const fields: Field[] = [];
  if (result.registration?.state === "found") {
    const record = result.registration;
    const source = record.source?.kind.toUpperCase() ?? "Registry";
    fields.push(field(`Registry · ${source}`, [
      `Registrar: ${record.registrar ?? "Not published"}`,
      `Created: ${date(record.createdAt)} · Expires: ${date(record.expiresAt)}`,
      ...(record.statuses.length
        ? [`Status: ${record.statuses.slice(0, 4).join(" · ")}`]
        : []),
      ...(record.nameservers.length
        ? [`NS: ${record.nameservers.slice(0, 3).join(" · ")}`]
        : []),
      ...(record.dnssec === null
        ? []
        : [record.dnssec ? "DNSSEC signed" : "DNSSEC not signed"]),
      ...(record.source
        ? [`Checked ${checked(record.source.checkedAt)}`]
        : []),
    ].join("\n")));
  }
  if (result.dns) {
    const dnsFacts = [
      ...(result.dns.ns.length
        ? [`NS: ${result.dns.ns.slice(0, 4).join(" · ")}`]
        : []),
      ...(result.dns.mx.length
        ? [`MX: ${result.dns.mx.slice(0, 3).map(({ exchange }) => exchange).join(" · ")}`]
        : []),
      ...(result.dns.a.length
        ? [`A: ${result.dns.a.slice(0, 3).join(" · ")}`]
        : []),
    ];
    if (dnsFacts.length) {
      fields.push(field(
        "DNS · Live lookup",
        [...dnsFacts, `Checked ${checked(result.dns.checkedAt)}`].join("\n"),
      ));
    }
  }
  if (result.certificate) {
    fields.push(field("Certificate · Live TLS lookup", [
      result.certificate.issuerCommonName ?? "Issuer not published",
      `Valid until ${date(result.certificate.validTo)}`,
      result.certificate.protocol ?? "Protocol not published",
      `Checked ${checked(result.certificate.checkedAt)}`,
    ].join(" · ")));
  }
  return fields.slice(0, 7);
}

function resultButtons(
  outcome: Extract<DomainSearchOutcome, { status: "success" }>,
  links: DomainMessageLinks,
) {
  const buttons: Button[] = [];
  if (links.primary) {
    buttons.push(linkButton(
      outcome.presentation === "public-intelligence"
        ? "Check live price on RayName"
        : outcome.result.commercial.availability === "registered"
        ? "Transfer to RayName"
        : "Register on RayName",
      links.primary,
    ));
  }
  if (
    outcome.presentation !== "public-intelligence" &&
    links.fullIntelligence &&
    outcome.result.commercial.availability === "registered"
  ) {
    buttons.push(linkButton("View full intelligence", links.fullIntelligence));
  }
  if (outcome.presentation !== "public-intelligence") {
    buttons.push(customButton(
      "Compare extensions",
      links.componentOwnerId
        ? `rayfox_domain:compare:${outcome.requestId}:${links.componentOwnerId}:registration:1`
        : `rayfox_domain:compare:${outcome.requestId}:registration:1`,
      1,
    ));
  }
  return buttons;
}

export function renderDomainOutcome(
  outcome: DomainSearchOutcome,
  links: DomainMessageLinks,
): DiscordWebhookMessage {
  if (outcome.status === "success") {
    return {
      embeds: [{
        title: clipped(outcome.result.domain.unicode, 256),
        description: statusCopy(outcome.result, outcome.presentation),
        color: rayNamePurple,
        fields: outcome.presentation === "public-intelligence"
          ? publicIntelligenceFields(outcome.result)
          : commerceFields(outcome.result),
        footer: {
          text: `${outcome.presentation === "fixture-commerce" ? "TEST DATA · " : outcome.presentation === "public-intelligence" ? "PUBLIC DATA · " : ""}${Math.max(0, outcome.limit - outcome.used)} of ${outcome.limit} searches left today${outcome.replayed && !outcome.restored ? " · Fresh replay" : ""}`,
        },
      }],
      components: actionRows(resultButtons(outcome, links)),
    };
  }

  if (outcome.status === "quota-rejected") {
    const buttons: Button[] = [];
    if (links.primary) {
      buttons.push(linkButton("Continue on RayName", links.primary));
    }
    if (outcome.verifyAvailable) {
      buttons.push(customButton(
        "Verify your RayName account",
        links.componentOwnerId
          ? `rayfox_domain:verify:${outcome.requestId}:${links.componentOwnerId}`
          : `rayfox_domain:verify:${outcome.requestId}`,
        1,
      ));
    }
    return {
      embeds: [{
        title: "Daily limit reached",
        description:
          "**You’re out of Discord searches for today.**\n" +
          "Keep going on RayName for live pricing, availability, and the full lookup.",
        color: rayNamePurple,
      }],
      components: actionRows(buttons),
    };
  }

  if (outcome.status === "unavailable") {
    return {
      embeds: [{
        title: "RayFox hit a snag",
        description:
          "**RayName pricing is temporarily unavailable.**\n" +
          "We didn’t count this search. Try again in a moment.",
        color: rayNamePurple,
      }],
    };
  }

  return {
    embeds: [{
      title: outcome.status === "invalid" ? "That domain doesn’t look right" : "Coming soon",
      description: outcome.status === "invalid"
        ? "Try a domain like `lucidgrid.ai` — no protocol, path, or spaces."
        : "RayFox Domain Intelligence isn’t available to this account yet.",
      color: rayNamePurple,
    }],
  };
}

function comparisonField(row: RayNameTldPrice): Field {
  const status = row.availability === "available"
    ? "Available"
    : row.availability === "registered"
      ? "Registered"
      : row.availability === "reserved"
        ? "Reserved"
        : "Unknown";
  return field(
    `${row.tld}${row.premium ? " · Premium" : ""}`,
    `${status} · Reg ${money(row.registrationPrice)} · Renew ${money(row.renewalPrice)} · Transfer ${money(row.transferPrice)}`,
  );
}

function compareId(
  requestId: string,
  ownerId: string,
  sort: DomainCompareSort,
  page: number,
) {
  return `rayfox_domain:compare:${requestId}:${ownerId}:${sort}:${page}`;
}

export function renderDomainComparison(
  outcome: DomainComparisonOutcome,
  ownerId: string,
): DiscordWebhookMessage {
  if (outcome.status !== "success") {
    return {
      embeds: [{
        title: "Price board unavailable",
        description: clipped(outcome.safeMessage, 4_096),
        color: rayNamePurple,
      }],
    };
  }

  const sorts: DomainCompareSort[] = ["registration", "renewal", "transfer"];
  const controls = sorts
    .filter((sort) => sort !== outcome.sort)
    .map((sort) => customButton(
      `Sort: ${sort}`,
      compareId(outcome.requestId, ownerId, sort, 1),
    ));
  controls.push(
    customButton(
      "Previous",
      compareId(outcome.requestId, ownerId, outcome.sort, outcome.page - 1),
      2,
      outcome.page <= 1,
    ),
    customButton(
      "Next",
      compareId(outcome.requestId, ownerId, outcome.sort, outcome.page + 1),
      1,
      outcome.page >= outcome.pageCount,
    ),
    customButton(
      "← Domain overview",
      `rayfox_domain:overview:${outcome.requestId}:${ownerId}`,
    ),
  );

  return {
    embeds: [{
      title: "Extension price board",
      description: outcome.testData
        ? "🧪 **Internal beta · Test data**\nThese are fixtures—not live RayName quotes."
        : "Live RayName prices for the same name across supported extensions.",
      color: rayNamePurple,
      fields: outcome.rows.slice(0, 5).map(comparisonField),
      footer: {
        text: `${outcome.testData ? "TEST DATA · " : ""}Page ${outcome.page} of ${outcome.pageCount} · Sorted by ${outcome.sort}`,
      },
    }],
    components: actionRows(controls),
  };
}

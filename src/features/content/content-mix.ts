import type { ContentEntry } from "@/lib/admin-data/types";

export const contentFormats = [
  { label: "Market Pulse", value: "market-pulse" },
  { label: "Domain 101", value: "domain-101" },
  { label: "Name Battle", value: "name-battle" },
  { label: "Domain Breakdown", value: "domain-breakdown" },
  { label: "Risk Check", value: "risk-check" },
  { label: "Brand Launch", value: "brand-launch" },
] as const satisfies ReadonlyArray<{ label: string; value: ContentEntry["format"] }>;

export type ContentMix = {
  education: number;
  soft: number;
  direct: number;
  compliant: boolean;
};

export function summarizeContentMix(
  entries: readonly ContentEntry["conversionLevel"][],
): ContentMix {
  const summary = entries.reduce<Omit<ContentMix, "compliant">>(
    (counts, entry) => ({ ...counts, [entry]: counts[entry] + 1 }),
    { education: 0, soft: 0, direct: 0 },
  );

  return {
    ...summary,
    compliant: summary.education === 4 && summary.soft === 2 && summary.direct === 1,
  };
}

export function validateContentEntry(input: Readonly<Pick<ContentEntry, "title" | "ctas">>):
  | { success: true }
  | { success: false; issues: string[] } {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push("Enter a title");
  if (input.ctas.length !== 1 || !input.ctas[0]?.trim()) {
    issues.push("Each post must have exactly one CTA");
  }

  return issues.length ? { success: false, issues } : { success: true };
}

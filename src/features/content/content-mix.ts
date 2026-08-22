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

export type ContentCycle = {
  number: number;
  entries: ContentEntry[];
  mix: ContentMix;
  complete: boolean;
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

export function partitionContentCycles(entries: readonly ContentEntry[]): ContentCycle[] {
  const orderedEntries = [...entries].sort((left, right) => {
    const dateOrder = left.publishAt.localeCompare(right.publishAt);
    return dateOrder || left.id.localeCompare(right.id);
  });
  const cycles: ContentCycle[] = [];

  for (let start = 0; start < orderedEntries.length; start += 7) {
    const cycleEntries = orderedEntries.slice(start, start + 7);
    const mix = summarizeContentMix(cycleEntries.map((entry) => entry.conversionLevel));
    const complete = cycleEntries.length === 7;
    cycles.push({
      number: cycles.length + 1,
      entries: cycleEntries,
      mix,
      complete,
      compliant: complete && mix.compliant,
    });
  }

  return cycles;
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

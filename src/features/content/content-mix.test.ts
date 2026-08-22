import { describe, expect, test } from "vitest";
import type { ContentEntry } from "@/lib/admin-data/types";
import { partitionContentCycles, summarizeContentMix, validateContentEntry } from "./content-mix";

const entry = (
  id: string,
  publishAt: string,
  conversionLevel: ContentEntry["conversionLevel"],
): ContentEntry => ({
  ctas: ["Read more"],
  format: "market-pulse",
  id,
  publishAt,
  status: "scheduled",
  title: id,
  conversionLevel,
});

describe("summarizeContentMix", () => {
  test("accepts four educational, two soft, and one direct post", () => {
    expect(summarizeContentMix([
      "education",
      "education",
      "education",
      "education",
      "soft",
      "soft",
      "direct",
    ])).toEqual({ education: 4, soft: 2, direct: 1, compliant: true });
  });

  test("rejects a cycle whose literal counts do not match 4:2:1", () => {
    expect(summarizeContentMix([
      "education",
      "education",
      "education",
      "soft",
      "soft",
      "direct",
      "direct",
    ])).toEqual({ education: 3, soft: 2, direct: 2, compliant: false });
  });
});

describe("partitionContentCycles", () => {
  test("sorts deterministically and evaluates each seven-post cycle independently", () => {
    const levels: ContentEntry["conversionLevel"][] = [
      "education", "education", "education", "education", "soft", "soft", "direct",
    ];
    const entries = Array.from({ length: 14 }, (_, index) => entry(
      `post-${String(index + 1).padStart(2, "0")}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T13:00:00Z`,
      levels[index % 7],
    )).reverse();

    const cycles = partitionContentCycles(entries);

    expect(cycles).toHaveLength(2);
    expect(cycles.map((cycle) => cycle.entries.map((item) => item.id))).toEqual([
      ["post-01", "post-02", "post-03", "post-04", "post-05", "post-06", "post-07"],
      ["post-08", "post-09", "post-10", "post-11", "post-12", "post-13", "post-14"],
    ]);
    expect(cycles.map((cycle) => ({
      complete: cycle.complete,
      compliant: cycle.compliant,
      mix: cycle.mix,
      number: cycle.number,
    }))).toEqual([
      {
        complete: true,
        compliant: true,
        mix: { education: 4, soft: 2, direct: 1, compliant: true },
        number: 1,
      },
      {
        complete: true,
        compliant: true,
        mix: { education: 4, soft: 2, direct: 1, compliant: true },
        number: 2,
      },
    ]);
  });

  test("identifies an incomplete trailing cycle without calling it compliant", () => {
    const entries = [
      ...["education", "education", "education", "education", "soft", "soft", "direct"]
        .map((level, index) => entry(
          `post-${index + 1}`,
          `2026-08-${String(index + 1).padStart(2, "0")}T13:00:00Z`,
          level as ContentEntry["conversionLevel"],
        )),
      entry("post-8", "2026-08-08T13:00:00Z", "education"),
    ];

    expect(partitionContentCycles(entries)[1]).toMatchObject({
      complete: false,
      compliant: false,
      number: 2,
      mix: { education: 1, soft: 0, direct: 0, compliant: false },
    });
  });
});

describe("validateContentEntry", () => {
  test("rejects an entry with more than one CTA", () => {
    expect(validateContentEntry({ title: "Transfer guide", ctas: ["Read", "Transfer"] }))
      .toEqual({ success: false, issues: ["Each post must have exactly one CTA"] });
  });

  test("rejects an entry without a usable title or CTA", () => {
    expect(validateContentEntry({ title: " ", ctas: [" "] })).toEqual({
      success: false,
      issues: ["Enter a title", "Each post must have exactly one CTA"],
    });
  });

  test("accepts a titled entry with exactly one CTA", () => {
    expect(validateContentEntry({ title: "Transfer guide", ctas: ["Read the guide"] }))
      .toEqual({ success: true });
  });
});

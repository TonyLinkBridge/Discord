import { describe, expect, test } from "vitest";
import { summarizeContentMix, validateContentEntry } from "./content-mix";

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

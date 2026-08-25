import { describe, expect, test } from "vitest";

import { normalizeDomain } from "./input";

describe("normalizeDomain", () => {
  test.each([
    [" Example.COM. ", "example.com"],
    ["münchen.de", "xn--mnchen-3ya.de"],
  ])("normalizes %s to the provider-safe ASCII domain", (raw, ascii) => {
    expect(normalizeDomain(raw)).toMatchObject({
      valid: true,
      domain: { ascii },
    });
  });

  test.each([
    "",
    "localhost",
    "a..com",
    "-bad.com",
    "bad-.com",
    "https://rayname.com",
    `${"a".repeat(64)}.com`,
  ])("rejects invalid domain input: %s", (raw) => {
    expect(normalizeDomain(raw)).toEqual({
      valid: false,
      code: "invalid_domain",
    });
  });
});

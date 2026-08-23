import { describe, expect, test } from "vitest";

import {
  normalizeVerificationDomain,
  normalizeVerificationEmail,
  verificationSubmissionSchema,
} from "./input";

describe("verification input", () => {
  test("normalizes the registered email for storage and lookup", () => {
    expect(normalizeVerificationEmail("  USER@Example.COM ")).toBe(
      "user@example.com",
    );
  });

  test("normalizes a hostname to lowercase ASCII without a trailing dot", () => {
    expect(normalizeVerificationDomain("  BÜCHER.DE. ")).toBe(
      "xn--bcher-kva.de",
    );
  });

  test.each([
    "https://example.com/path",
    "example com",
    "127.0.0.1",
    "2001:db8::1",
    "-example.com",
    "example-.com",
    "example..com",
    `${"a".repeat(64)}.com`,
  ])("rejects unsafe domain input %s", (domain) => {
    expect(() => normalizeVerificationDomain(domain)).toThrow(
      "Enter a valid domain name",
    );
  });

  test("accepts only the strict Discord modal payload", () => {
    const result = verificationSubmissionSchema.parse({
      discordUserId: "123456789012345678",
      guildId: "1540610722281824336",
      displayName: " RayName User ",
      discordHandle: " rayname.user ",
      email: " USER@Example.COM ",
      domain: " Example.COM. ",
    });

    expect(result).toEqual({
      discordUserId: "123456789012345678",
      guildId: "1540610722281824336",
      displayName: "RayName User",
      discordHandle: "rayname.user",
      email: "user@example.com",
      domain: "example.com",
    });
  });

  test("rejects invalid IDs, email, and extra browser-controlled fields", () => {
    expect(() =>
      verificationSubmissionSchema.parse({
        discordUserId: "local-ray",
        guildId: "1540610722281824336",
        displayName: "Ray",
        discordHandle: "ray",
        email: "not-an-email",
        domain: "example.com",
        actorId: "spoofed-admin",
      }),
    ).toThrow();
  });

  test("turns an empty optional domain into null", () => {
    const result = verificationSubmissionSchema.parse({
      discordUserId: "123456789012345678",
      guildId: "1540610722281824336",
      displayName: "Ray",
      discordHandle: "ray",
      email: "ray@example.com",
      domain: "   ",
    });

    expect(result.domain).toBeNull();
  });
});

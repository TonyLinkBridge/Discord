import { describe, expect, test } from "vitest";

import { getDatabaseConfig } from "./config";

describe("getDatabaseConfig", () => {
  test("keeps the database unavailable when DATABASE_URL is missing", () => {
    expect(getDatabaseConfig({})).toEqual({
      configured: false,
      reason: "DATABASE_URL is not configured",
    });
  });

  test("accepts a Postgres URL without serializing its credentials", () => {
    const value = "postgresql://rayname:secret@example.neon.tech/neondb?sslmode=require";

    const result = getDatabaseConfig({ DATABASE_URL: value });

    expect(result).toMatchObject({
      configured: true,
      safe: { host: "example.neon.tech", database: "neondb" },
    });
    expect(JSON.stringify(result)).not.toContain("rayname");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test.each([
    "https://example.com/database",
    "postgresql://",
    "postgresql://example.neon.tech/",
    "not-a-url",
  ])("rejects invalid database URL %s", (DATABASE_URL) => {
    expect(getDatabaseConfig({ DATABASE_URL })).toEqual({
      configured: false,
      reason: "DATABASE_URL is invalid",
    });
  });
});

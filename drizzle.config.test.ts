import { afterEach, describe, expect, test, vi } from "vitest";

describe("drizzle migration config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("passes DATABASE_URL to Drizzle Kit for PostgreSQL migrations", async () => {
    const databaseUrl =
      "postgresql://rayname:secret@example.neon.tech/neondb?sslmode=require";
    vi.stubEnv("DATABASE_URL", databaseUrl);

    const { default: config } = await import("./drizzle.config");

    expect(config).toMatchObject({
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl },
    });
  });
});

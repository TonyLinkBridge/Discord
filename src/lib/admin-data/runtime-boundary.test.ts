import { globSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production admin data boundary", () => {
  test("keeps deterministic fixtures outside the production dependency graph", () => {
    const files = globSync("src/{app,components,features,lib}/**/*.{ts,tsx}")
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("test/fixtures/admin-state")
        || source.includes("admin-data/seed")
        || source.includes("createLocalAdminDataProvider()");
    });

    expect(offenders).toEqual([]);
  });
});

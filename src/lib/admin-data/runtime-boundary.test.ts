import { globSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const forbiddenTestImport = /(?:from\s+|import\s*(?:\(\s*)?)["'](?:@\/test\/|(?:\.\.\/)+test\/|src\/test\/)/;

function hasForbiddenRuntimeDependency(source: string) {
  return source.includes("test/fixtures/admin-state")
    || source.includes("admin-data/seed")
    || source.includes("createLocalAdminDataProvider()")
    || source.includes("VERIFICATION_E2E")
    || source.includes("@electric-sql/pglite")
    || forbiddenTestImport.test(source);
}

describe("production admin data boundary", () => {
  test.each([
    'import { repo } from "@/test/verification-repository";',
    'import { repo } from "../../test/verification-repository";',
    'const repo = await import("@/test/verification-repository");',
    'import "@/test/verification-repository";',
  ])("recognizes test-only runtime imports: %s", (source) => {
    expect(hasForbiddenRuntimeDependency(source)).toBe(true);
  });

  test("keeps deterministic fixtures outside the production dependency graph", () => {
    const files = globSync("src/{app,components,features,lib}/**/*.{ts,tsx}")
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return hasForbiddenRuntimeDependency(source);
    });

    expect(offenders).toEqual([]);
  });
});

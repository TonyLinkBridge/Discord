import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

test("keeps linked worktrees outside the root test project", () => {
  const configSource = readFileSync(
    join(process.cwd(), "vitest.config.ts"),
    "utf8",
  );

  expect(configSource).toContain('"**/.worktrees/**"');
});

test("keeps linked worktrees outside the root lint project", () => {
  const configSource = readFileSync(
    join(process.cwd(), "eslint.config.mjs"),
    "utf8",
  );

  expect(configSource).toContain('".worktrees/**"');
});

test("keeps private browser audit evidence out of version control", () => {
  const ignoreSource = readFileSync(join(process.cwd(), ".gitignore"), "utf8");

  expect(ignoreSource.split(/\r?\n/)).toContain(".audit/");
});

import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("Neon HTTP migration command", () => {
  test("fails safely when DATABASE_URL is missing", () => {
    const result = spawnSync("npm", ["run", "db:migrate"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "DATABASE_URL is required to run database migrations",
    );
  });

  test("fails safely when the baseline command has no DATABASE_URL", () => {
    const result = spawnSync("npm", ["run", "db:baseline"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "DATABASE_URL is required to baseline database migrations",
    );
  });
});

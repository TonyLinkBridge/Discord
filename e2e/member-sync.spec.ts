import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { resetMemberSyncE2e } from "../scripts/verification-e2e-fixtures.mjs";
import { expect, test } from "./fixtures";

const enabled = Boolean(
  process.env.VERIFICATION_TEST_DATABASE_URL &&
    process.env.VERIFICATION_TEST_BRANCH_ID &&
    process.env.VERIFICATION_PRODUCTION_BRANCH_ID,
);

test.skip(!enabled, "requires the disposable Neon verification test branch");
test.describe.configure({ mode: "serial" });

async function control(path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:3114${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(response.status).toBe(204);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, nodes }) => ({
        id,
        targets: nodes.flatMap((node) =>
          node.target.map((target) => String(target)),
        ),
      })),
  ).toEqual([]);
}

test.beforeEach(async () => {
  await resetMemberSyncE2e(process.env);
  await control("/__test/reset");
});

test.afterAll(async () => {
  await resetMemberSyncE2e(process.env);
  await control("/__test/reset");
});

test("synchronizes, persists, and updates truthful Discord facts", async ({ page }) => {
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Discord member sync" }))
    .toBeVisible();
  await expect(page.getByText("Never synced")).toBeVisible();

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synced 3 members successfully",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Member directory" }))
    .toBeVisible();
  await expect(page.getByText("Alpha Builder")).toBeVisible();
  await expect(page.getByText("Beta Domains")).toBeVisible();
  await expect(page.getByText("RayFox", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Alpha Builder")).toBeVisible();
  await expect(page.getByText("Beta Domains")).toBeVisible();

  await control("/__test/member-sync/version", { version: 2 });
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synced 3 members successfully",
  );
  await page.reload();
  await expect(page.getByText("Alpha Renamed")).toBeVisible();
  await expect(page.getByText("Gamma Domains")).toBeVisible();
  await expect(page.getByRole("row", { name: /Beta Domains/ })).toContainText("left");
  await expectAccessible(page);

  await page.goto("/");
  await expect(page.getByText("Discord data connected · RayName Marketing API pending"))
    .toBeVisible();
  await expect(page.getByText("$18,420")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "RayName Marketing API pending" }))
    .toBeVisible();
  await expectAccessible(page);

  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "Role distribution" }))
    .toBeVisible();
  await expect(page.getByText("Admin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channel activity unavailable" }))
    .toBeVisible();
  await expect(page.getByText(/community-to-customer conversion/)).toHaveCount(0);
  await expectAccessible(page);
});

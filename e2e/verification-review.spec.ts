import AxeBuilder from "@axe-core/playwright";

import {
  readVerificationE2eState,
  seedVerificationE2e,
  verificationE2eRequests,
} from "../scripts/verification-e2e-fixtures.mjs";
import { expect, test } from "./fixtures";

const verificationE2eEnabled = Boolean(
  process.env.VERIFICATION_TEST_DATABASE_URL &&
    process.env.VERIFICATION_TEST_BRANCH_ID &&
    process.env.VERIFICATION_PRODUCTION_BRANCH_ID,
);

test.skip(
  !verificationE2eEnabled,
  "requires the disposable Neon verification test branch",
);
test.describe.configure({ mode: "serial" });

async function resetDiscordStub() {
  const response = await fetch("http://127.0.0.1:3114/__test/reset", {
    method: "POST",
  });
  expect(response.status).toBe(204);
}

test.beforeEach(async () => {
  await seedVerificationE2e(process.env);
  await resetDiscordStub();
});

test.afterAll(async () => {
  await seedVerificationE2e(process.env, { include: [] });
  await resetDiscordStub();
});

test("shows an honest connected-empty verification queue", async ({ page }) => {
  await seedVerificationE2e(process.env, { include: [] });
  await page.goto("/members");

  await expect(
    page.getByRole("heading", { name: "Customer verification queue" }),
  ).toBeVisible();
  await expect(page.getByText("0 real requests from Discord")).toBeVisible();
  await expect(page.getByText("No verification requests yet")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Member data is not connected" }),
  ).toBeVisible();
});

test("keeps decrypted applicant data inside a keyboard-safe review dialog", async ({ page }) => {
  await page.goto("/members");
  const opener = page.getByRole("button", { name: "Review DomainNomad" });

  await expect(page.getByText(verificationE2eRequests.success.email)).toHaveCount(0);
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Review DomainNomad" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(verificationE2eRequests.success.email)).toBeVisible();
  await expect(dialog.getByText(verificationE2eRequests.success.domain)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close review" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("allows two concurrent approvals but persists one role operation", async ({ context, page }) => {
  const competingPage = await context.newPage();
  await Promise.all([page.goto("/members"), competingPage.goto("/members")]);
  await Promise.all([
    page.getByRole("button", { name: "Review DomainNomad" }).click(),
    competingPage.getByRole("button", { name: "Review DomainNomad" }).click(),
  ]);
  const dialog = page.getByRole("dialog", { name: "Review DomainNomad" });
  const competingDialog = competingPage.getByRole("dialog", {
    name: "Review DomainNomad",
  });
  const approve = dialog.getByRole("button", {
    name: "Approve and assign Verified Customer",
  });
  const competingApprove = competingDialog.getByRole("button", {
    name: "Approve and assign Verified Customer",
  });
  const status = dialog.getByRole("status");
  await Promise.all([approve.click(), competingApprove.click()]);
  await expect.poll(async () =>
    (await readVerificationE2eState(
      process.env,
      verificationE2eRequests.success.id,
    ))?.status,
  ).toBe("approved");
  await expect(status).toContainText(
    /Verified Customer role assigned|no longer reviewable/,
  );

  await page.reload();
  await page.getByRole("button", { name: "Review DomainNomad" }).click();
  await expect(
    page.getByRole("button", { name: "Approve and assign Verified Customer" }),
  ).toHaveCount(0);
  const state = await readVerificationE2eState(
    process.env,
    verificationE2eRequests.success.id,
  );
  expect(state).toMatchObject({
    status: "approved",
    roleOperationCount: 1,
    successAuditCount: 1,
  });
  expect(state?.roleAssignedAt).toBeTruthy();

  const callsResponse = await fetch("http://127.0.0.1:3114/__test/calls");
  const calls = (await callsResponse.json()) as {
    calls: Array<{ method: string; path: string }>;
  };
  expect(
    calls.calls.filter(({ method, path }) =>
      method === "PUT" && path.endsWith(`/roles/900000000000000010`),
    ),
  ).toHaveLength(1);
  await competingPage.close();
});

test("keeps permission failure durable and never claims a false success", async ({ page }) => {
  await page.goto("/members");
  await page.getByRole("button", { name: "Review Permission Test" }).click();
  const dialog = page.getByRole("dialog", { name: "Review Permission Test" });
  await dialog
    .getByRole("button", { name: "Approve and assign Verified Customer" })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Move the bot role above Verified Customer",
  );
  await expect(dialog.getByRole("status")).not.toContainText("role assigned");

  await page.reload();
  await page.getByRole("button", { name: "Review Permission Test" }).click();
  await expect(page.getByRole("button", { name: "Retry role assignment" })).toBeVisible();
  expect(
    await readVerificationE2eState(
      process.env,
      verificationE2eRequests.forbidden.id,
    ),
  ).toMatchObject({ status: "role_failed", roleOperationCount: 1 });
});

test("retries a temporary Discord failure using the same role operation", async ({ page }) => {
  await page.goto("/members");
  await page.getByRole("button", { name: "Review Retry Test" }).click();
  const dialog = page.getByRole("dialog", { name: "Review Retry Test" });
  await dialog
    .getByRole("button", { name: "Approve and assign Verified Customer" })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Discord is rate limiting role updates",
  );

  await page.reload();
  await page.getByRole("button", { name: "Review Retry Test" }).click();
  const retryDialog = page.getByRole("dialog", { name: "Review Retry Test" });
  await retryDialog.getByRole("button", { name: "Retry role assignment" }).click();
  await expect(retryDialog.getByRole("status")).toContainText(
    "Verified Customer role assigned.",
  );
  expect(
    await readVerificationE2eState(process.env, verificationE2eRequests.retry.id),
  ).toMatchObject({
    status: "approved",
    roleOperationCount: 1,
    successAuditCount: 1,
  });
});

test("rejects with a reason and removes mutation controls", async ({ page }) => {
  await page.goto("/members");
  await page.getByRole("button", { name: "Review Permission Test" }).click();
  const dialog = page.getByRole("dialog", { name: "Review Permission Test" });
  await dialog.getByLabel("Rejection reason").fill("Account details did not match");
  await dialog.getByRole("button", { name: "Reject request" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Verification request rejected.",
  );

  await page.reload();
  await page.getByRole("button", { name: "Review Permission Test" }).click();
  await expect(page.getByRole("button", { name: "Reject request" })).toHaveCount(0);
  expect(
    await readVerificationE2eState(
      process.env,
      verificationE2eRequests.forbidden.id,
    ),
  ).toMatchObject({ status: "rejected" });
});

for (const viewport of [
  { width: 1180, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`verification queue is responsive and accessible at ${viewport.width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => {
        window.localStorage.setItem("rayname-theme", value);
      }, theme);
      await page.goto("/members");
      await expect(
        page.getByRole("heading", { name: "Customer verification queue" }),
      ).toBeVisible();
      const overflow = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.width > 0 && bounds.right > viewportWidth + 1;
          })
          .slice(0, 12)
          .map((element) => ({
            className: element.className,
            right: Math.round(element.getBoundingClientRect().right),
            tag: element.tagName,
            text: element.textContent?.trim().slice(0, 60) ?? "",
          }));
      });
      expect(overflow).toEqual([]);
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
    });
  }
}

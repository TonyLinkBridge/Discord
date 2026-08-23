import { expect, test } from "./fixtures";

test("operator reviews setup state and changes theme without fabricated actions", async ({ page }) => {
  const verificationConnected = Boolean(
    process.env.VERIFICATION_TEST_DATABASE_URL &&
      process.env.VERIFICATION_TEST_BRANCH_ID &&
      process.env.VERIFICATION_PRODUCTION_BRANCH_ID,
  );
  await page.goto("/");

  const metrics = page.getByRole("region", { name: "Overview metrics" });
  await expect(metrics.getByText("Registrations")).toBeVisible();
  await expect(metrics.getByText("—").first()).toBeVisible();
  await expect(page.getByText("Data source not connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Date range/ })).toBeDisabled();

  await page.getByRole("link", { name: "Bot & Automations" }).click();
  await expect(page.getByText("Discord bot").locator("../..")).toContainText(
    verificationConnected ? "Connected" : "Discord bot is not connected",
  );
  await expect(page.getByText("No operational activity is available until integrations are connected.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create tracked link" })).toHaveCount(0);

  const theme = page.getByRole("button", { name: /Theme settings/ });
  await theme.focus();
  await theme.press("Enter");
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Discord OAuth").locator("../..")).toContainText("Configured");
  await expect(page.getByText("Database").locator("../..")).toContainText(
    verificationConnected ? "Connected" : "Not connected",
  );
  await expect(page.getByText("RayName Marketing API").locator("../..")).toContainText("Awaiting access");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

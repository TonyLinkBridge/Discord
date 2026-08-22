import { expect, test } from "./fixtures";

test("operator completes a lead action and switches theme without losing state", async ({ page }) => {
  await page.goto("/");
  const metrics = page.getByRole("region", { name: "Overview metrics" });
  const registrationMetric = metrics.getByText("Registrations").locator("..");
  await expect(registrationMetric).toContainText("168");
  await expect(registrationMetric).toContainText("162.5%");
  await expect(page.getByRole("heading", { name: "Today's priorities" })).toBeVisible();

  const followUpPriority = page.getByText("Follow up with 7 high-intent leads");
  await expect(followUpPriority).toBeVisible();
  await page.getByRole("button", { name: "Open leads Follow up with 7 high-intent leads" }).click();
  await page.getByRole("menuitem", { name: "Mark complete" }).click();
  await expect(followUpPriority).toBeHidden();

  await page.getByRole("link", { name: "View all leads" }).click();
  await page.getByLabel("Segment").selectOption("investor");
  await page.getByLabel("Intent").selectOption("very-high");
  await page.getByRole("button", { name: "Open Alex Chen" }).click();
  const dialog = page.getByRole("dialog", { name: "Alex Chen" });
  await page.getByLabel("Next action").selectOption("follow-up");
  await page.getByRole("button", { name: "Mark follow-up complete" }).click();
  await expect(dialog.getByRole("status")).toHaveText("follow-up completed for Alex Chen");
  await page.getByRole("button", { name: "Create tracked link" }).click();
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
  const darkTheme = dialog.getByRole("button", { name: "Use dark theme" });
  await darkTheme.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.getByLabel("Segment")).toHaveValue("investor");
  await expect(page.getByLabel("Intent")).toHaveValue("very-high");
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
  await expect(dialog.getByText("Follow up complete")).toBeVisible();
  await expect(darkTheme).toBeFocused();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);

  const backgroundTheme = page.locator('button[aria-label^="Theme settings"]');
  expect(await backgroundTheme.evaluate((element) => {
    (element as HTMLElement).focus();
    return document.activeElement === element;
  })).toBe(false);
  await expect(darkTheme).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await page.getByRole("button", { name: "Close lead details" }).click();
  await expect(page.getByRole("row", { name: /Alex Chen/ })).toContainText("Follow up complete");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Follow up with 7 high-intent leads")).toBeHidden();
  await expect(page.getByRole("row", { name: /Alex Chen/ })).toContainText("Follow up complete");
});

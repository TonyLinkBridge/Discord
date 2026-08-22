import { expect, test } from "./fixtures";

test("operator completes a lead action and switches theme without losing state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Segment").selectOption("investor");
  await page.getByRole("button", { name: "Open Alex Chen" }).click();
  await page.getByRole("button", { name: "Create tracked link" }).click();
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
  await page.getByRole("button", { name: /theme/i }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
});

import { expect, test } from "./fixtures";

test("operator completes a lead action and switches theme without losing state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Segment").selectOption("investor");
  await page.getByRole("button", { name: "Open Alex Chen" }).click();
  const dialog = page.getByRole("dialog", { name: "Alex Chen" });
  await page.getByRole("button", { name: "Create tracked link" }).click();
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
  const darkTheme = dialog.getByRole("button", { name: "Use dark theme" });
  await darkTheme.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
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
});

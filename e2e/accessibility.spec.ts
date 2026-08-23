import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const routes = [
  "/", "/community", "/members", "/leads", "/campaigns", "/offers", "/content",
  "/bot-automations", "/analytics", "/settings", "/sign-in", "/access-denied",
] as const;
const themes = ["light", "dark"] as const;

async function loadTheme(page: Page, route: string, theme: (typeof themes)[number]) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("rayname-theme", selectedTheme);
  }, theme);
  await page.goto(route);
  await expect(page.locator("html")).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
  await expect(page.getByRole("main")).toBeVisible();
}

for (const route of routes) {
  for (const theme of themes) {
    test(`${route} has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
      await loadTheme(page, route, theme);
      const results = await new AxeBuilder({ page }).analyze();
      const seriousViolations = results.violations.filter(
        (item) => item.impact === "serious" || item.impact === "critical",
      );
      expect(seriousViolations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.flatMap((node) => node.target.map((target) => String(target))),
      }))).toEqual([]);
    });
  }
}

test("global search supports keyboard discovery, truthful absence, and dismissal", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Search members, domains, leads, campaigns/ });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("searchbox", { name: "Search members, domains, leads, campaigns" });
  const dialog = page.getByRole("dialog", { name: "Global search" });
  await expect(search).toBeFocused();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await search.fill("Alex");
  await expect(page.getByText("Search is available after a data source is connected")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("theme menu supports keyboard selection", async ({ page }) => {
  await loadTheme(page, "/", "light");
  const trigger = page.getByRole("button", { name: /theme/i });
  await trigger.focus();
  await trigger.press("Enter");
  const darkOption = page.getByRole("menuitemradio", { name: "Dark" });
  await expect(darkOption).toBeVisible();
  await page.keyboard.press("End");
  await expect(darkOption).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

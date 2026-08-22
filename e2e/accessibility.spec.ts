import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const routes = [
  "/",
  "/community",
  "/members",
  "/leads",
  "/campaigns",
  "/offers",
  "/content",
  "/bot-automations",
  "/analytics",
  "/settings",
  "/sign-in",
  "/access-denied",
];
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

test("global search supports keyboard discovery and dismissal", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const search = page.getByRole("searchbox", { name: "Search members, domains, leads, campaigns" });
  await expect(search).toBeFocused();
  await search.fill("Alex");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await search.press("Escape");
  await expect(page.getByRole("dialog", { name: "Global search" })).toBeHidden();
});

test("global search activates Alex Chen in the canonical lead dialog", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const search = page.getByRole("searchbox", { name: "Search members, domains, leads, campaigns" });
  await search.fill("Alex");
  await page.getByRole("option", { name: /Alex Chen.*Lead/i }).click();

  await expect(page).toHaveURL(/\/leads\?lead=alex-chen$/);
  await expect(page.getByRole("dialog", { name: "Alex Chen" })).toBeVisible();
});

test("every Overview chart tab shows seven non-overlapping date labels at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");

  for (const metric of ["Registrations", "Transfers", "Renewals"]) {
    await page.getByRole("tab", { name: metric }).click();
    const chart = page.getByRole("img", {
      name: `${metric} line chart for Aug 16–22, 2026`,
    });
    const labels = chart.locator("svg text").filter({ hasText: /^Aug \d{2}/ });

    await expect(labels).toHaveCount(7);
    expect(await labels.allTextContents()).toEqual([
      "Aug 16Sun",
      "Aug 17Mon",
      "Aug 18Tue",
      "Aug 19Wed",
      "Aug 20Thu",
      "Aug 21Fri",
      "Aug 22Sat",
    ]);
    const boxes = await labels.evaluateAll((elements) => elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    }));
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index - 1].right).toBeLessThanOrEqual(boxes[index].left);
    }
  }
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

test("chart tabs support arrow-key selection", async ({ page }) => {
  await page.goto("/");
  const registrations = page.getByRole("tab", { name: "Registrations" });
  const transfers = page.getByRole("tab", { name: "Transfers" });

  await registrations.focus();
  await registrations.press("ArrowRight");
  await expect(transfers).toBeFocused();
  await expect(transfers).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Transfers");
});

test("lead filters can be changed from the keyboard", async ({ page }) => {
  await page.goto("/leads");
  const segment = page.getByLabel("Segment");

  await segment.focus();
  await segment.press("i");
  await expect(segment).toHaveValue("investor");
  await expect(page.getByRole("button", { name: "Open Alex Chen" })).toBeVisible();
});

test("lead detail drawer traps focus and restores its opener", async ({ page }) => {
  await page.goto("/leads");
  await page.getByLabel("Segment").selectOption("investor");
  const opener = page.getByRole("button", { name: "Open Alex Chen" });

  await opener.focus();
  await opener.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Alex Chen" });
  const close = page.getByRole("button", { name: "Close lead details" });
  const lastControl = page.getByRole("button", { name: "Create tracked link" });
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(close).toBeFocused();

  const backgroundMemberLink = page.locator('nav[aria-label="Primary"] a[href="/members"]');
  expect(await backgroundMemberLink.evaluate((element) => {
    (element as HTMLElement).focus();
    return document.activeElement === element;
  })).toBe(false);
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastControl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("action menu supports arrow navigation and Escape", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Actions for Alex Chen" });

  await trigger.focus();
  await trigger.press("ArrowDown");
  const firstAction = page.getByRole("menuitem", { name: "Follow up" });
  const secondAction = page.getByRole("menuitem", { name: "Mark converted" });
  await expect(firstAction).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(secondAction).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu", { name: "Actions for Alex Chen actions" })).toBeHidden();
});

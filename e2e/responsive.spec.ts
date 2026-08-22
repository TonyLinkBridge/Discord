import { expect, test } from "./fixtures";

const navLabels = [
  "Overview",
  "Community",
  "Members",
  "Leads",
  "Campaigns",
  "Offers",
  "Content",
  "Analytics",
  "Bot & Automations",
  "Settings",
];

for (const viewport of [
  { width: 1440, height: 1024 },
  { width: 1180, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`keeps admin controls usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const navigation = page.getByRole("navigation", { name: "Primary" });
    await expect(navigation).toBeVisible();
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    ))).toBe(true);

    const contentFitsViewport = await page.locator("main").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth;
    });
    expect(contentFitsViewport).toBe(true);

    if (viewport.width === 1440) {
      for (const label of navLabels) {
        await expect(navigation.getByRole("link", { name: label }).locator("span").last()).toBeVisible();
      }
    }

    if (viewport.width === 1180) {
      const navigationBounds = await navigation.boundingBox();
      expect(navigationBounds?.width).toBeLessThanOrEqual(64);
      for (const label of navLabels) {
        const link = navigation.getByRole("link", { name: label });
        await expect(link).toBeVisible();
        await expect(link.locator("span").last()).toBeHidden();
      }
    }

    if (viewport.width === 1024) {
      const lowerSections = await Promise.all([
        page.getByRole("heading", { name: "Conversion funnel" }).locator("..").boundingBox(),
        page.getByRole("heading", { name: "High-intent leads" }).locator("..").boundingBox(),
        page.getByRole("heading", { name: "Campaign performance" }).locator("..").boundingBox(),
      ]);
      expect(lowerSections.every(Boolean)).toBe(true);
      expect(lowerSections[1]!.y).toBeGreaterThan(lowerSections[0]!.y);
      expect(lowerSections[2]!.y).toBeGreaterThan(lowerSections[1]!.y);
    }
  });
}

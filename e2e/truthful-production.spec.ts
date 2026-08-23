import { expect, test } from "./fixtures";

const unavailableRoutes = [
  ["/", "Data source not connected"],
  ["/community", "Community data is not connected"],
  ["/members", "Member data is not connected"],
  ["/leads", "Lead data is not connected"],
  ["/campaigns", "Campaign data is not connected"],
  ["/offers", "Offer data is not connected"],
  ["/content", "Content data is not connected"],
  ["/bot-automations", "No operational activity is available until integrations are connected."],
  ["/analytics", "Analytics data is not connected"],
  ["/settings", "Connection states"],
] as const;

test("every production-like route is honest and non-fabricated", async ({ page }) => {
  for (const [route, explanation] of unavailableRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} response`).not.toBe(404);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(explanation, { exact: true })).toBeVisible();
    await expect(page.getByText(/Alex Chen|DomainNomad|Sarah K\.|Web3Builder/)).toHaveCount(0);
    await expect(page.getByText(/1,248|\$18,420|91\.4%/)).toHaveCount(0);
    await expect(page.getByText("All systems operational", { exact: true })).toHaveCount(0);
  }
});

test("global controls expose only real setup actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "View all priorities" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Notifications" })).toHaveCount(0);
  await expect(page.getByText("Account settings", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Date range/ })).toBeDisabled();

  const searchTrigger = page.getByRole("button", { name: /Search members, domains, leads, campaigns/ });
  await searchTrigger.click();
  const search = page.getByRole("searchbox");
  await search.fill("Alex");
  await expect(page.getByText("Search is available after a data source is connected")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.press("Escape");

  const theme = page.getByRole("button", { name: /Theme settings/ });
  await theme.click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  const operator = page.getByRole("button", { name: "Operator menu" });
  await operator.click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  const signOutRequest = page.waitForRequest((request) => request.url().includes("/api/auth/signout"));
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await signOutRequest;
});

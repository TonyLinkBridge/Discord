import { screen } from "@testing-library/react";
import { renderAdmin } from "@/test/render";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { testRuntimeConfig } from "@/test/admin-data";
import { createVerificationAvailability } from "@/lib/admin-data/availability";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import { SettingsScreen } from "./settings-screen";

test("shows provider connection state without exposing configured secret values", async () => {
  renderAdmin(<SettingsScreen />);

  expect((await screen.findByText("Discord OAuth")).closest("article")).toHaveTextContent("Configured");
  expect(screen.getByText("RayName Marketing API").closest("article")).toHaveTextContent("Connected");
  expect(screen.getByText("RayName Discord Community")).toBeVisible();
  expect(screen.getByText("1 operator configured")).toBeVisible();
  expect(document.body.innerHTML).not.toContain("discord-oauth-client-secret");
  expect(document.body.innerHTML).not.toContain("AUTH_SECRET");
  expect(screen.queryByRole("textbox", { name: /secret/i })).not.toBeInTheDocument();
});

test("shows safe partial-live Discord and database facts with verification retention", async () => {
  const availability = createVerificationAvailability({
    ...testRuntimeConfig,
    discordBotConfigured: true,
    databaseStatus: "connected",
  });
  const provider = createUnavailableAdminDataStore(availability, {
    ...testRuntimeConfig,
    operatorAllowlist: [...testRuntimeConfig.operatorAllowlist],
  });
  renderAdmin(<SettingsScreen />, { provider });

  expect((await screen.findByText("Discord bot")).closest("article")).toHaveTextContent("Configured");
  expect(screen.getByText("Database").closest("article")).toHaveTextContent("Connected");
  expect(screen.getByText("Verification request data").closest("section")).toHaveTextContent("90 days");
  expect(screen.getByText("RayName Marketing API").closest("article")).toHaveTextContent("Awaiting access");
  expect(document.body.innerHTML).not.toContain("DISCORD_BOT_TOKEN");
  expect(document.body.innerHTML).not.toContain("DATABASE_URL");
});

test("shows only safe configured facts when live providers are unavailable", async () => {
  renderAdmin(<SettingsScreen />, { provider: createUnavailableTestAdminDataStore() });

  expect((await screen.findByText("Discord OAuth")).closest("article")).toHaveTextContent("Configured");
  expect(screen.getByText("Database").closest("article")).toHaveTextContent("Not connected");
  expect(screen.getByText("RayName Marketing API").closest("article")).toHaveTextContent("Awaiting access");
  expect(screen.queryByRole("heading", { name: /Notifications/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Daily summary")).not.toBeInTheDocument();
  expect(screen.queryByText("Failed jobs")).not.toBeInTheDocument();
});

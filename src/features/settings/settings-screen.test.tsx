import { screen } from "@testing-library/react";
import { renderAdmin } from "@/test/render";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { SettingsScreen } from "./settings-screen";

test("shows provider connection state without exposing configured secret values", async () => {
  renderAdmin(<SettingsScreen />);

  expect(await screen.findByText("Discord OAuth")).toBeVisible();
  expect(screen.getByText("Configured")).toBeVisible();
  expect(screen.getByText("RayName Marketing API").closest("article")).toHaveTextContent("Connected");
  expect(screen.getByText("RayName Discord Community")).toBeVisible();
  expect(screen.getByText("1 operator configured")).toBeVisible();
  expect(document.body.innerHTML).not.toContain("discord-oauth-client-secret");
  expect(document.body.innerHTML).not.toContain("AUTH_SECRET");
  expect(screen.queryByRole("textbox", { name: /secret/i })).not.toBeInTheDocument();
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

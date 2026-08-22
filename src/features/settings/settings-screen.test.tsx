import { screen } from "@testing-library/react";
import { renderAdmin } from "@/test/render";
import { SettingsScreen } from "./settings-screen";

test("shows provider connection state without exposing configured secret values", async () => {
  renderAdmin(<SettingsScreen />);

  expect(await screen.findByText("Discord OAuth")).toBeVisible();
  expect(screen.getByText("Configured")).toBeVisible();
  expect(screen.getByText("Awaiting access")).toBeVisible();
  expect(screen.getByText("RayName Discord Community")).toBeVisible();
  expect(screen.getByText("1 operator configured")).toBeVisible();
  expect(document.body.innerHTML).not.toContain("discord-oauth-client-secret");
  expect(document.body.innerHTML).not.toContain("AUTH_SECRET");
  expect(screen.queryByRole("textbox", { name: /secret/i })).not.toBeInTheDocument();
});

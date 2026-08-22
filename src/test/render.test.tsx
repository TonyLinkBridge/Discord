import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { renderAdmin } from "./render";

test("renders the shared ThemeProvider with deterministic storage and persists a choice", async () => {
  const user = userEvent.setup();

  expect(Object.getOwnPropertyDescriptor(globalThis, "localStorage")?.value).toBeDefined();

  renderAdmin(<ThemeSelector />);

  await user.click(screen.getByRole("button", { name: /theme/i }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

  expect(globalThis.localStorage.getItem("rayname-theme")).toBe("dark");
});

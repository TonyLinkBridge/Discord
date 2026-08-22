import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { RayNameThemeProvider } from "./theme-provider";
import { ThemeSelector } from "./theme-selector";

const storedValues = new Map<string, string>();
const themeStorage: Storage = {
  clear: () => storedValues.clear(),
  getItem: (key) => storedValues.get(key) ?? null,
  key: (index) => [...storedValues.keys()][index] ?? null,
  get length() {
    return storedValues.size;
  },
  removeItem: (key) => storedValues.delete(key),
  setItem: (key, value) => storedValues.set(key, value),
};

function renderWithTheme(ui: React.ReactNode) {
  return render(<RayNameThemeProvider>{ui}</RayNameThemeProvider>);
}

async function openThemeMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /theme/i }));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", themeStorage);
  themeStorage.clear();
  document.documentElement.classList.remove("light", "dark");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

test("selects dark mode and preserves the three-mode contract", async () => {
  const user = userEvent.setup();

  renderWithTheme(<ThemeSelector />);

  await openThemeMenu(user);
  expect(screen.getByRole("menuitemradio", { name: "System" })).toBeVisible();

  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

  expect(document.documentElement).toHaveClass("dark");
  expect(themeStorage.getItem("rayname-theme")).toBe("dark");
});

test("uses System as the selected mode for a fresh visitor", async () => {
  const user = userEvent.setup();

  renderWithTheme(<ThemeSelector />);

  await openThemeMenu(user);

  expect(document.documentElement).toHaveClass("light");
  expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("restores a persisted manual theme choice", async () => {
  const user = userEvent.setup();
  themeStorage.setItem("rayname-theme", "dark");

  renderWithTheme(<ThemeSelector />);

  await openThemeMenu(user);

  expect(document.documentElement).toHaveClass("dark");
  expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("selects the focused theme with the keyboard", async () => {
  const user = userEvent.setup();

  renderWithTheme(<ThemeSelector />);

  await openThemeMenu(user);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

  expect(document.documentElement).toHaveClass("dark");
  await openThemeMenu(user);
  expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

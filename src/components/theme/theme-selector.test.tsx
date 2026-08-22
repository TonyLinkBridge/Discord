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

  await user.click(screen.getByRole("button", { name: /theme/i }));
  expect(screen.getByRole("menuitemradio", { name: "System" })).toBeVisible();

  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

  expect(document.documentElement).toHaveClass("dark");
  expect(themeStorage.getItem("rayname-theme")).toBe("dark");
});

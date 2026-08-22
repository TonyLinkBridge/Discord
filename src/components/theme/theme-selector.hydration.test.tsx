import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

import { ThemeSelector } from "./theme-selector";

let root: Root | undefined;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  useThemeMock.mockReset();
});

afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("hydrates System-dark without a mismatch and then exposes the dark current state", async () => {
  useThemeMock.mockReturnValueOnce({
    theme: "system",
    resolvedTheme: undefined,
    setTheme: vi.fn(),
  });
  const serverHtml = renderToString(<ThemeSelector />);
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.append(container);

  useThemeMock.mockReturnValue({
    theme: "system",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await act(async () => {
    root = hydrateRoot(container, <ThemeSelector />);
    await Promise.resolve();
  });

  expect(consoleError).not.toHaveBeenCalled();
  expect(container.querySelector("button")).toHaveAttribute(
    "aria-label",
    "Theme settings, current: dark",
  );
});

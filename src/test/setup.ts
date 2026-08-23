import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

const storedValues = new Map<string, string>();
const testStorage: Storage = {
  clear: () => storedValues.clear(),
  getItem: (key) => storedValues.get(key) ?? null,
  key: (index) => [...storedValues.keys()][index] ?? null,
  get length() {
    return storedValues.size;
  },
  removeItem: (key) => storedValues.delete(key),
  setItem: (key, value) => storedValues.set(key, value),
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testStorage,
  });
}

beforeEach(() => {
  testStorage.clear();
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

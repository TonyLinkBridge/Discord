import { describe, expect, test } from "vitest";

import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  test("returns values only before their expiry", () => {
    let now = 1_000;
    const cache = createTtlCache<string, string>({
      maxEntries: 2,
      now: () => now,
    });

    cache.set("domain", "available", 60_000);
    expect(cache.get("domain")).toBe("available");
    now = 61_000;
    expect(cache.get("domain")).toBeUndefined();
  });

  test("evicts the entry with the oldest expiry when bounded capacity is exceeded", () => {
    const cache = createTtlCache<string, number>({
      maxEntries: 2,
      now: () => 0,
    });

    cache.set("long", 1, 3_000);
    cache.set("short", 2, 1_000);
    cache.set("middle", 3, 2_000);

    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe(1);
    expect(cache.get("middle")).toBe(3);
  });

  test("overwrites and clears values without retaining old entries", () => {
    const cache = createTtlCache<string, number>({
      maxEntries: 2,
      now: () => 0,
    });

    cache.set("price", 10, 1_000);
    cache.set("price", 12, 2_000);
    expect(cache.get("price")).toBe(12);
    cache.clear();
    expect(cache.get("price")).toBeUndefined();
  });
});

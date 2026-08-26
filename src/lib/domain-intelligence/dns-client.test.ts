// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest";

import type { NormalizedDomain } from "./types";
import { createDnsClient } from "./dns-client";

const domain: NormalizedDomain = {
  ascii: "example.com",
  unicode: "example.com",
  label: "example",
  tld: "com",
};

function dependencies() {
  return {
    resolve4: vi.fn().mockResolvedValue(["8.8.8.8"]),
    resolve6: vi.fn().mockResolvedValue(["2606:4700:4700::1111"]),
    resolveMx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
    resolveTxt: vi.fn().mockResolvedValue([["v=spf1 ", "-all"]]),
    resolveNs: vi.fn().mockResolvedValue(["ns1.example.com"]),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DNS client", () => {
  test("runs all record lookups and returns sorted deduplicated bounded data", async () => {
    const deps = dependencies();
    deps.resolve4.mockResolvedValue([
      "9.9.9.9", "8.8.8.8", "9.9.9.9", "7.7.7.7", "6.6.6.6",
      "5.5.5.5", "4.4.4.4", "3.3.3.3", "2.2.2.2", "1.1.1.1",
      "11.11.11.11", "12.12.12.12",
    ]);
    deps.resolveMx.mockResolvedValue([
      { exchange: "MAIL2.EXAMPLE.COM.", priority: 20 },
      { exchange: "mail1.example.com", priority: 10 },
      { exchange: "mail1.example.com", priority: 10 },
    ]);
    deps.resolveTxt.mockResolvedValue([
      ["z"],
      ["a"],
      ["x".repeat(600)],
      ["a"],
    ]);
    deps.resolveNs.mockResolvedValue(["NS2.EXAMPLE.COM.", "ns1.example.com"]);

    const client = createDnsClient({ ...deps, now: () => 1_000 });
    await expect(client.lookup(domain)).resolves.toEqual({
      a: [
        "1.1.1.1", "11.11.11.11", "12.12.12.12", "2.2.2.2", "3.3.3.3",
        "4.4.4.4", "5.5.5.5", "6.6.6.6", "7.7.7.7", "8.8.8.8",
      ],
      aaaa: ["2606:4700:4700::1111"],
      mx: [
        { exchange: "mail1.example.com", priority: 10 },
        { exchange: "mail2.example.com", priority: 20 },
      ],
      txt: ["a", "x".repeat(512), "z"],
      ns: ["ns1.example.com", "ns2.example.com"],
      checkedAt: "1970-01-01T00:00:01.000Z",
    });
  });

  test("treats ENODATA and ENOTFOUND as empty record sets", async () => {
    const deps = dependencies();
    deps.resolve4.mockRejectedValue(Object.assign(new Error("none"), { code: "ENODATA" }));
    deps.resolveTxt.mockRejectedValue(Object.assign(new Error("none"), { code: "ENOTFOUND" }));

    await expect(createDnsClient(deps).lookup(domain)).resolves.toMatchObject({
      a: [],
      txt: [],
      aaaa: ["2606:4700:4700::1111"],
    });
  });

  test("maps a resolver failure safely and does not cache it", async () => {
    const deps = dependencies();
    deps.resolveMx.mockRejectedValue(new Error("SERVFAIL internal details"));
    const client = createDnsClient(deps);

    await expect(client.lookup(domain)).resolves.toEqual({
      code: "unavailable",
      safeMessage: "DNS enrichment is temporarily unavailable",
      retryable: true,
    });
    await client.lookup(domain);
    expect(deps.resolveMx).toHaveBeenCalledTimes(2);
  });

  test("returns a safe timeout after three seconds", async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    deps.resolve4.mockReturnValue(new Promise(() => undefined));
    const pending = createDnsClient(deps).lookup(domain);

    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toMatchObject({ code: "timeout", retryable: true });
  });

  test("caches only successful summaries for five minutes", async () => {
    let time = 0;
    const deps = dependencies();
    const client = createDnsClient({ ...deps, now: () => time });

    await client.lookup(domain);
    await client.lookup(domain);
    expect(deps.resolve4).toHaveBeenCalledTimes(1);

    time = 5 * 60_000 + 1;
    await client.lookup(domain);
    expect(deps.resolve4).toHaveBeenCalledTimes(2);
  });
});

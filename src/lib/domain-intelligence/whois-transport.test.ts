// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import {
  createWhoisTransport,
  WhoisTransportError,
} from "./whois-transport";

describe("WHOIS transport", () => {
  test("resolves first and sends one bounded CRLF query to port 43", async () => {
    const resolve = vi.fn().mockResolvedValue(["8.8.8.8", "1.1.1.1"]);
    const connect = vi.fn().mockResolvedValue("Domain Name: EXAMPLE.COM\r\n");
    const transport = createWhoisTransport({ resolve, connect });

    await expect(transport.query("whois.example.com", "example.com", 8_000))
      .resolves.toBe("Domain Name: EXAMPLE.COM\r\n");
    expect(resolve).toHaveBeenCalledWith("whois.example.com");
    expect(connect).toHaveBeenCalledWith({
      host: "8.8.8.8",
      port: 43,
      timeoutMs: 4_000,
      query: "example.com\r\n",
      maxBytes: 256 * 1_024,
    });
  });

  test("does not connect when any resolved address is private", async () => {
    const connect = vi.fn();
    const transport = createWhoisTransport({
      resolve: vi.fn().mockResolvedValue(["8.8.8.8", "127.0.0.1"]),
      connect,
    });

    await expect(transport.query("whois.example.com", "example.com", 4_000))
      .rejects.toMatchObject({ code: "unsafe_host" });
    expect(connect).not.toHaveBeenCalled();
  });

  test("rejects control characters before resolving", async () => {
    const resolve = vi.fn();
    const transport = createWhoisTransport({ resolve, connect: vi.fn() });

    await expect(transport.query("whois.example.com", "example.com\nHELP", 4_000))
      .rejects.toMatchObject({ code: "unsafe_query" });
    expect(resolve).not.toHaveBeenCalled();
  });

  test("rejects oversized responses even when the socket adapter misbehaves", async () => {
    const transport = createWhoisTransport({
      resolve: vi.fn().mockResolvedValue(["8.8.8.8"]),
      connect: vi.fn().mockResolvedValue("x".repeat(256 * 1_024 + 1)),
    });

    await expect(transport.query("whois.example.com", "example.com", 4_000))
      .rejects.toMatchObject({ code: "response_too_large" });
  });

  test.each([
    ["timeout", new WhoisTransportError("timeout")],
    ["socket error", new Error("ECONNRESET")],
  ])("returns a safe typed failure for %s", async (_name, error) => {
    const transport = createWhoisTransport({
      resolve: vi.fn().mockResolvedValue(["8.8.8.8"]),
      connect: vi.fn().mockRejectedValue(error),
    });

    await expect(transport.query("whois.example.com", "example.com", 4_000))
      .rejects.toBeInstanceOf(WhoisTransportError);
  });
});

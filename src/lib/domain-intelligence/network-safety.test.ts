// @vitest-environment node

import { describe, expect, test } from "vitest";

import { isPublicIp, normalizeWhoisHost } from "./network-safety";

describe("isPublicIp", () => {
  test.each([
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
  ])("accepts the public address %s", (address) => {
    expect(isPublicIp(address)).toBe(true);
  });

  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "100.64.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "0.0.0.0",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("rejects the non-public address %s", (address) => {
    expect(isPublicIp(address)).toBe(false);
  });
});

describe("normalizeWhoisHost", () => {
  test.each([
    ["whois.verisign-grs.com", "whois.verisign-grs.com"],
    ["WHOIS://whois.nic.ai:43", "whois.nic.ai"],
    [" whois.nic.io ", "whois.nic.io"],
  ])("accepts a safe port-43 referral", (raw, expected) => {
    expect(normalizeWhoisHost(raw)).toBe(expected);
  });

  test.each([
    "whois://user:pass@whois.example:43",
    "whois.example:44",
    "whois://whois.example/path",
    "whois.example/path",
    "whois.example\nmalicious",
    "-whois.example",
    "whois_example.com",
    "localhost",
    "",
  ])("rejects the unsafe referral %s", (raw) => {
    expect(normalizeWhoisHost(raw)).toBeNull();
  });
});

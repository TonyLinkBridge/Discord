import { isIP } from "node:net";
import { domainToASCII } from "node:url";

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".").map(Number);
  return parts.length === 4 ? parts : null;
}

function publicIpv4(address: string): boolean {
  const bytes = parseIpv4(address);
  if (!bytes) return false;
  const [a, b, c] = bytes;

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string): number[] | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;

  let normalized = address.toLowerCase();
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const bytes = parseIpv4(ipv4Tail);
    if (!bytes) return null;
    normalized = normalized.slice(0, -ipv4Tail.length) +
      `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every((part) => Number.isFinite(part))
    ? groups
    : null;
}

export function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) return publicIpv4(address);
  const groups = parseIpv6(address);
  if (!groups) return false;

  const [a, b, c, d, e, f, g, h] = groups;
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) {
    if (f === 0xffff) {
      return publicIpv4(`${g >> 8}.${g & 255}.${h >> 8}.${h & 255}`);
    }
    return false;
  }

  return !(
    (a & 0xfe00) === 0xfc00 ||
    (a & 0xffc0) === 0xfe80 ||
    (a & 0xff00) === 0xff00 ||
    (a === 0x2001 && b === 0x0db8) ||
    (a === 0x0100 && b === 0 && c === 0 && d === 0) ||
    (a === 0x2001 && b === 0) ||
    (a === 0x2001 && b === 2) ||
    (a === 0x2001 && ((b & 0xfff0) === 0x0010 || (b & 0xfff0) === 0x0020)) ||
    a < 0x2000 ||
    a > 0x3fff
  );
}

function normalizeHostname(raw: string): string | null {
  const ascii = domainToASCII(raw.replace(/\.$/, "")).toLowerCase();
  if (!ascii || ascii.length > 253) return null;
  const labels = ascii.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  ) {
    return null;
  }
  return ascii;
}

export function normalizeWhoisHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  if (/^whois:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (
        url.protocol !== "whois:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "43") ||
        (url.pathname && url.pathname !== "/") ||
        url.search ||
        url.hash
      ) {
        return null;
      }
      return normalizeHostname(url.hostname);
    } catch {
      return null;
    }
  }

  if (/[@/\\?#\s]/.test(trimmed)) return null;
  const host = trimmed.toLowerCase().endsWith(":43")
    ? trimmed.slice(0, -3)
    : trimmed;
  if (host.includes(":")) return null;
  return normalizeHostname(host);
}

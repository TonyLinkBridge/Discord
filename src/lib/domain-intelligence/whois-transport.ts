import "server-only";

import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";

import { isPublicIp, normalizeWhoisHost } from "./network-safety";

export type WhoisTransportErrorCode =
  | "unsafe_host"
  | "unsafe_query"
  | "timeout"
  | "response_too_large"
  | "unavailable";

export class WhoisTransportError extends Error {
  constructor(readonly code: WhoisTransportErrorCode) {
    super(`WHOIS transport failed: ${code}`);
    this.name = "WhoisTransportError";
  }
}

export type WhoisConnectionInput = {
  host: string;
  port: 43;
  timeoutMs: number;
  query: string;
  maxBytes: number;
};

export type WhoisTransportDependencies = {
  resolve(host: string): Promise<string[]>;
  connect(input: WhoisConnectionInput): Promise<string>;
};

export interface WhoisTransport {
  query(host: string, value: string, timeoutMs: number): Promise<string>;
}

const maxResponseBytes = 256 * 1_024;

async function resolvePublicAddresses(host: string): Promise<string[]> {
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
}

function connectToWhois(input: WhoisConnectionInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let bytes = 0;
    let settled = false;
    const socket = createConnection({ host: input.host, port: input.port });

    function fail(error: WhoisTransportError) {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    }

    socket.setEncoding("utf8");
    socket.setTimeout(input.timeoutMs);
    socket.once("connect", () => socket.write(input.query));
    socket.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > input.maxBytes) {
        fail(new WhoisTransportError("response_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    socket.once("timeout", () => fail(new WhoisTransportError("timeout")));
    socket.once("error", () => fail(new WhoisTransportError("unavailable")));
    socket.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(chunks.join(""));
    });
  });
}

const nodeDependencies: WhoisTransportDependencies = {
  resolve: resolvePublicAddresses,
  connect: connectToWhois,
};

export function createWhoisTransport(
  dependencies: WhoisTransportDependencies = nodeDependencies,
): WhoisTransport {
  return {
    async query(host, value, timeoutMs) {
      const safeHost = normalizeWhoisHost(host);
      if (!safeHost) throw new WhoisTransportError("unsafe_host");
      if (!value || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new WhoisTransportError("unsafe_query");
      }

      let addresses: string[];
      try {
        addresses = await dependencies.resolve(safeHost);
      } catch {
        throw new WhoisTransportError("unavailable");
      }
      if (!addresses.length || addresses.some((address) => !isPublicIp(address))) {
        throw new WhoisTransportError("unsafe_host");
      }

      try {
        const response = await dependencies.connect({
          host: addresses[0],
          port: 43,
          timeoutMs: Math.min(Math.max(timeoutMs, 1), 4_000),
          query: `${value}\r\n`,
          maxBytes: maxResponseBytes,
        });
        if (Buffer.byteLength(response) > maxResponseBytes) {
          throw new WhoisTransportError("response_too_large");
        }
        return response;
      } catch (error) {
        if (error instanceof WhoisTransportError) throw error;
        throw new WhoisTransportError("unavailable");
      }
    },
  };
}

import "server-only";

export type DatabaseConfig =
  | { configured: false; reason: string }
  | {
      configured: true;
      readonly url: string;
      safe: { host: string; database: string };
    };

export function getDatabaseConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    return { configured: false, reason: "DATABASE_URL is not configured" };
  }

  try {
    const url = new URL(raw);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname === "/"
    ) {
      return { configured: false, reason: "DATABASE_URL is invalid" };
    }

    const configured = {
      configured: true as const,
      safe: {
        host: url.hostname,
        database: decodeURIComponent(url.pathname.slice(1)),
      },
    } as Omit<Extract<DatabaseConfig, { configured: true }>, "url"> & {
      readonly url: string;
    };

    Object.defineProperty(configured, "url", {
      configurable: false,
      enumerable: false,
      value: raw,
      writable: false,
    });

    return configured;
  } catch {
    return { configured: false, reason: "DATABASE_URL is invalid" };
  }
}

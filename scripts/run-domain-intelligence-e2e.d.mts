export const domainIntelligenceE2ePorts: Readonly<{
  app: number;
  discord: number;
  rayName: number;
}>;

export function createDomainIntelligenceE2eEnvironment(
  source: Record<string, string | undefined>,
): Record<string, string | undefined>;

export function startDomainIntelligenceE2eServices(
  source: Record<string, string | undefined>,
  dependencies?: {
    assertEnvironment(
      source: Record<string, string | undefined>,
    ): Promise<unknown>;
    startDiscord(options: {
      host: string;
      port: number;
    }): Promise<{ close(): Promise<void> }>;
    startRayName(options: {
      host: string;
      port: number;
    }): Promise<{ close(): Promise<void> }>;
    spawn(
      command: string,
      args: string[],
      options: {
        env: Record<string, string | undefined>;
        stdio: "inherit";
      },
    ): {
      killed: boolean;
      kill(signal?: string): boolean;
      once(event: string, listener: (...args: unknown[]) => void): unknown;
    };
  },
): Promise<{
  child: {
    killed: boolean;
    kill(signal?: string): boolean;
    once(event: string, listener: (...args: unknown[]) => void): unknown;
  };
  close(signal?: string): Promise<void>;
}>;

export function runDomainIntelligenceE2e(
  source: Record<string, string | undefined>,
  dependencies?: {
    assertEnvironment(
      source: Record<string, string | undefined>,
    ): Promise<unknown>;
    spawn(
      command: string,
      args: string[],
      options: {
        env: Record<string, string | undefined>;
        stdio: "inherit";
      },
    ): {
      once(event: string, listener: (...args: unknown[]) => void): unknown;
    };
  },
): Promise<number>;

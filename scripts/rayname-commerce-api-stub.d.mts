export type RayNameCommerceStubMode =
  | "available"
  | "registered"
  | "premium"
  | "malformed"
  | "rate-limited"
  | "unavailable";

export const rayNameCommerceStubToken: string;

export function createRayNameCommerceApiStub(): {
  handle(request: Request): Promise<Response>;
  calls(): Array<{ method: string; path: string; status: number }>;
  reset(): void;
};

export function startRayNameCommerceApiStub(options?: {
  host?: string;
  port?: number;
}): Promise<
  ReturnType<typeof createRayNameCommerceApiStub> & { close(): Promise<void> }
>;

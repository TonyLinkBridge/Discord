import { timingSafeEqual } from "node:crypto";

import { createVerificationRuntime } from "@/lib/verification/runtime";

function authorized(actual: string | null, secret: string): boolean {
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  const actualBytes = Buffer.from(actual ?? "");
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function createVerificationRetentionGet(dependencies: {
  getSecret(): string | undefined;
  purge(): Promise<number>;
}) {
  return async function GET(request: Request): Promise<Response> {
    const secret = dependencies.getSecret()?.trim();
    if (!secret) {
      return Response.json({ error: "Retention cleanup unavailable" }, { status: 503 });
    }
    if (!authorized(request.headers.get("authorization"), secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return Response.json({ purged: await dependencies.purge() });
    } catch {
      return Response.json({ error: "Retention cleanup unavailable" }, { status: 503 });
    }
  };
}

export const GET = createVerificationRetentionGet({
  getSecret: () => process.env.CRON_SECRET,
  async purge() {
    const runtime = createVerificationRuntime();
    if (!runtime.ready) throw new Error("Verification runtime is not connected");
    return runtime.service.purgeExpiredSensitiveData();
  },
});

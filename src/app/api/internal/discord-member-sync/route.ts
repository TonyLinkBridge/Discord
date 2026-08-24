import { timingSafeEqual } from "node:crypto";

import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import type { MemberSyncRunResult } from "@/lib/member-sync/types";

export const dynamic = "force-dynamic";

function authorized(actual: string | null, secret: string): boolean {
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  const actualBytes = Buffer.from(actual ?? "");
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function createDiscordMemberSyncGet(dependencies: {
  getSecret(): string | undefined;
  run(): Promise<MemberSyncRunResult>;
}) {
  return async function GET(request: Request): Promise<Response> {
    const secret = dependencies.getSecret();
    if (secret === undefined || secret.length === 0) {
      return Response.json(
        { error: "Member synchronization unavailable" },
        { status: 503 },
      );
    }
    if (!authorized(request.headers.get("authorization"), secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const result = await dependencies.run();
      if (result.status === "already-running") {
        return Response.json(result, { status: 409 });
      }
      if (result.status === "failed") {
        return Response.json(result, { status: 503 });
      }
      return Response.json(result);
    } catch {
      return Response.json(
        { error: "Member synchronization unavailable" },
        { status: 503 },
      );
    }
  };
}

export const GET = createDiscordMemberSyncGet({
  getSecret: () => process.env.CRON_SECRET,
  async run() {
    const runtime = createMemberSyncRuntime();
    if (!runtime.ready) {
      throw new Error("Member synchronization runtime is not connected");
    }
    return runtime.service.sync({ trigger: "cron", requestedBy: null });
  },
});

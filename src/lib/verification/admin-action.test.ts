import { describe, expect, test, vi } from "vitest";

import { executeVerificationReview } from "./admin-action";
import type { VerificationService } from "./service";

function createDependencies() {
  const service = {
    approve: vi.fn().mockResolvedValue({ status: "approved" }),
    reject: vi.fn().mockResolvedValue({ status: "rejected" }),
    retryRole: vi.fn().mockResolvedValue({ status: "approved" }),
  } as unknown as VerificationService;
  return {
    service,
    requireActor: vi.fn().mockResolvedValue("323456789012345678"),
    revalidate: vi.fn(),
  };
}

describe("executeVerificationReview", () => {
  test("rejects a spoofed actor before resolving trusted auth context", async () => {
    const dependencies = createDependencies();

    await expect(
      executeVerificationReview(
        {
          kind: "approve-verification",
          requestId: "72345678-1234-4234-8234-123456789012",
          actorId: "attacker",
        },
        dependencies,
      ),
    ).rejects.toThrow();
    expect(dependencies.requireActor).not.toHaveBeenCalled();
    expect(dependencies.service.approve).not.toHaveBeenCalled();
  });

  test.each([
    {
      command: {
        kind: "approve-verification",
        requestId: "72345678-1234-4234-8234-123456789012",
      },
      method: "approve" as const,
      args: ["72345678-1234-4234-8234-123456789012", "323456789012345678"],
    },
    {
      command: {
        kind: "reject-verification",
        requestId: "72345678-1234-4234-8234-123456789012",
        reason: "Account details did not match",
      },
      method: "reject" as const,
      args: [
        "72345678-1234-4234-8234-123456789012",
        "323456789012345678",
        "Account details did not match",
      ],
    },
    {
      command: {
        kind: "retry-verification-role",
        requestId: "72345678-1234-4234-8234-123456789012",
      },
      method: "retryRole" as const,
      args: ["72345678-1234-4234-8234-123456789012", "323456789012345678"],
    },
  ])("binds the trusted actor for $method", async ({ command, method, args }) => {
    const dependencies = createDependencies();

    await expect(
      executeVerificationReview(command, dependencies),
    ).resolves.toMatchObject({ ok: true });
    expect(dependencies.requireActor).toHaveBeenCalledOnce();
    expect(dependencies.service[method]).toHaveBeenCalledWith(...args);
    expect(dependencies.revalidate).toHaveBeenCalledWith("/members");
  });

  test("revalidates the durable role-failed state without claiming success", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.service.approve).mockResolvedValue({
      status: "role-failed",
      message: "Move the bot role above Verified Customer",
      retryable: false,
    });

    await expect(
      executeVerificationReview(
        {
          kind: "approve-verification",
          requestId: "72345678-1234-4234-8234-123456789012",
        },
        dependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      status: "role-failed",
      message: "Move the bot role above Verified Customer",
    });
    expect(dependencies.revalidate).toHaveBeenCalledWith("/members");
  });
});

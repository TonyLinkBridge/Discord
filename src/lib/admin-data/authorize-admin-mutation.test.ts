import { expect, test, vi } from "vitest";

import { authorizeAdminMutationRequest } from "./authorize-admin-mutation";

const command = { kind: "complete-priority", priorityId: "verify-new-members" } as const;

test("returns the current trusted actor only after validating the command", async () => {
  const requireActor = vi.fn().mockResolvedValue("42");

  await expect(authorizeAdminMutationRequest(command, requireActor)).resolves.toEqual({
    actorId: "42",
    command,
  });
  expect(requireActor).toHaveBeenCalledOnce();
});

test("rejects a spoofed actor before resolving trusted actor context", async () => {
  const requireActor = vi.fn().mockResolvedValue("42");

  await expect(authorizeAdminMutationRequest(
    { ...command, actorId: "attacker" },
    requireActor,
  )).rejects.toThrow();
  expect(requireActor).not.toHaveBeenCalled();
});

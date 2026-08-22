import { adminMutationCommandSchema, type AuthorizedAdminMutation } from "./mutation-command";

export async function authorizeAdminMutationRequest(
  input: unknown,
  requireActor: () => Promise<string>,
): Promise<AuthorizedAdminMutation> {
  const command = adminMutationCommandSchema.parse(input);
  const actorId = await requireActor();

  return { actorId, command };
}

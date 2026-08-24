export type DiscordStubFixture = {
  guildId: string;
  successUserId: string;
  forbiddenUserId: string;
  retryUserId: string;
  roleId: string;
  adminRoleId: string;
  vipRoleId: string;
  botRoleId: string;
  memberAlphaId: string;
  memberBetaId: string;
  botUserId: string;
  memberGammaId: string;
};

export const discordStubFixture: Readonly<DiscordStubFixture>;

export function createDiscordApiStub(fixture?: DiscordStubFixture): {
  handle(request: Request): Promise<Response>;
  calls(): Array<{ method: string; path: string; status: number }>;
  reset(): void;
};

export function startDiscordApiStub(options?: {
  host?: string;
  port?: number;
  fixture?: DiscordStubFixture;
}): Promise<ReturnType<typeof createDiscordApiStub> & { close(): Promise<void> }>;

export type DiscordGuildCommand = {
  name: string;
  description: string;
  type: number;
  dm_permission: boolean;
};

export function buildGuildCommands(): DiscordGuildCommand[];

export function registerGuildCommands(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): Promise<{ registered: string[] }>;

const discordApiBaseUrl = "https://discord.com/api/v10";

export function buildGuildCommands() {
  return [
    {
      name: "verify",
      description: "Request RayName customer verification",
      type: 1,
      dm_permission: false,
    },
  ];
}

export async function registerGuildCommands(env, fetchImpl = fetch) {
  const applicationId = env.DISCORD_APPLICATION_ID?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim();
  const botToken = env.DISCORD_BOT_TOKEN?.trim();
  if (!/^\d{17,20}$/.test(applicationId ?? "")) {
    throw new Error("DISCORD_APPLICATION_ID is missing or invalid");
  }
  if (!/^\d{17,20}$/.test(guildId ?? "")) {
    throw new Error("DISCORD_GUILD_ID is missing or invalid");
  }
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN is missing");

  const response = await fetchImpl(
    `${discordApiBaseUrl}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildGuildCommands()),
    },
  );
  if (!response.ok) {
    throw new Error(`Discord command registration failed with status ${response.status}`);
  }
  const commands = await response.json();
  if (!Array.isArray(commands)) {
    throw new Error("Discord returned an invalid command registration response");
  }
  return {
    registered: commands
      .map((command) => command && typeof command === "object" && "name" in command ? command.name : null)
      .filter((name) => typeof name === "string"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  registerGuildCommands(process.env)
    .then(({ registered }) => {
      process.stdout.write(`Registered guild commands: ${registered.join(", ")}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Command registration failed"}\n`);
      process.exitCode = 1;
    });
}

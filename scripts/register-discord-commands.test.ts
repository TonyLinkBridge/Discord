// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import {
  buildGuildCommands,
  registerGuildCommands,
} from "./register-discord-commands.mjs";

describe("Discord guild command registration", () => {
  test("registers the private guild-scoped verify and domain commands", () => {
    expect(buildGuildCommands()).toEqual([
      {
        name: "verify",
        description: "Request RayName customer verification",
        type: 1,
        dm_permission: false,
      },
      {
        name: "domain",
        description: "Check a domain with RayName Intelligence",
        type: 1,
        dm_permission: false,
        options: [
          {
            type: 3,
            name: "domain",
            description: "Domain name, for example lucidgrid.ai",
            required: true,
            min_length: 3,
            max_length: 253,
          },
        ],
      },
    ]);
  });

  test("uses PUT without exposing the bot token in output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "1", name: "verify" },
          { id: "2", name: "domain" },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const result = await registerGuildCommands(
      {
        DISCORD_APPLICATION_ID: "1541013436098682942",
        DISCORD_GUILD_ID: "1540610722281824336",
        DISCORD_BOT_TOKEN: "private-test-token-never-log",
      },
      fetchMock,
    );

    expect(result).toEqual({ registered: ["verify", "domain"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/applications/1541013436098682942/guilds/1540610722281824336/commands",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.stringify(result)).not.toContain("private-test-token");
  });
});

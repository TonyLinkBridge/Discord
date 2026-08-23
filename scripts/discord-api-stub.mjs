import { createServer } from "node:http";

export const discordStubFixture = Object.freeze({
  guildId: "900000000000000000",
  successUserId: "900000000000000001",
  forbiddenUserId: "900000000000000002",
  retryUserId: "900000000000000003",
  roleId: "900000000000000010",
});

function json(value, status = 200) {
  return Response.json(value, { status });
}

export function createDiscordApiStub(fixture = discordStubFixture) {
  const assignedRoles = new Map();
  const retryAttempts = new Map();
  const recordedCalls = [];
  const allowedMembers = new Set([
    fixture.successUserId,
    fixture.forbiddenUserId,
    fixture.retryUserId,
  ]);

  function finish(request, response) {
    recordedCalls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
    });
    return response;
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (url.hostname === "127.0.0.1" && url.pathname === "/__test/calls") {
      return json({ calls: structuredClone(recordedCalls) });
    }
    if (
      url.hostname === "127.0.0.1" &&
      url.pathname === "/__test/reset" &&
      request.method === "POST"
    ) {
      assignedRoles.clear();
      retryAttempts.clear();
      recordedCalls.length = 0;
      return new Response(null, { status: 204 });
    }
    if (!request.headers.get("authorization")?.startsWith("Bot ")) {
      return finish(request, json({ error: "Unauthorized" }, 401));
    }

    const memberMatch = url.pathname.match(
      /^\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/,
    );
    if (memberMatch) {
      const [, guildId, memberId, roleId] = memberMatch;
      if (
        guildId !== fixture.guildId ||
        !allowedMembers.has(memberId) ||
        (roleId && roleId !== fixture.roleId)
      ) {
        return finish(request, json({ error: "Not found" }, 404));
      }
      if (request.method === "GET" && !roleId) {
        return finish(request, json({ roles: [...(assignedRoles.get(memberId) ?? [])] }));
      }
      if (request.method === "PUT" && roleId) {
        if (memberId === fixture.forbiddenUserId) {
          return finish(request, json({ error: "Missing permissions" }, 403));
        }
        if (memberId === fixture.retryUserId) {
          const attempt = (retryAttempts.get(memberId) ?? 0) + 1;
          retryAttempts.set(memberId, attempt);
          if (attempt === 1) {
            return finish(request, json({ retry_after: 0.01 }, 429));
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 180));
        assignedRoles.set(memberId, new Set([fixture.roleId]));
        return finish(request, new Response(null, { status: 204 }));
      }
    }

    if (url.pathname === "/users/@me/channels" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const userId = body && typeof body === "object" ? body.recipient_id : null;
      if (typeof userId !== "string" || !allowedMembers.has(userId)) {
        return finish(request, json({ error: "Not found" }, 404));
      }
      return finish(request, json({ id: `dm-${userId}` }));
    }

    if (/^\/channels\/dm-\d+\/messages$/.test(url.pathname) && request.method === "POST") {
      return finish(request, json({ id: "message-1" }));
    }

    return finish(request, json({ error: "Not found" }, 404));
  }

  return {
    handle,
    calls: () => structuredClone(recordedCalls),
    reset() {
      assignedRoles.clear();
      retryAttempts.clear();
      recordedCalls.length = 0;
    },
  };
}

export async function startDiscordApiStub({
  host = "127.0.0.1",
  port = 3114,
  fixture = discordStubFixture,
} = {}) {
  if (host !== "127.0.0.1") {
    throw new Error("Discord API stub may bind only to 127.0.0.1");
  }
  const stub = createDiscordApiStub(fixture);
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${host}:${port}${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers: incoming.headers,
      body,
    });
    const response = await stub.handle(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    ...stub,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

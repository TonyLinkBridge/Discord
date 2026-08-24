import { createServer } from "node:http";

export const discordStubFixture = Object.freeze({
  guildId: "900000000000000000",
  successUserId: "900000000000000001",
  forbiddenUserId: "900000000000000002",
  retryUserId: "900000000000000003",
  roleId: "900000000000000010",
  adminRoleId: "900000000000000011",
  vipRoleId: "900000000000000012",
  botRoleId: "900000000000000013",
  memberAlphaId: "900000000000000021",
  memberBetaId: "900000000000000022",
  botUserId: "900000000000000023",
  memberGammaId: "900000000000000024",
});

const testBotAuthorization = "Bot local-e2e-dummy-token-never-production";

function role(id, name, position, managed = false) {
  return { id, name, color: 0, position, managed, permissions: "0" };
}

function member({ id, username, nick, roles, bot = false, joinedAt }) {
  return {
    avatar: null,
    joined_at: joinedAt,
    nick,
    roles,
    user: {
      id,
      username,
      global_name: null,
      avatar: null,
      bot,
    },
  };
}

function memberSyncRoles(fixture) {
  return [
    role(fixture.guildId, "@everyone", 0),
    role(fixture.roleId, "Verified Customer", 4),
    role(fixture.adminRoleId, "Admin", 5),
    role(fixture.vipRoleId, "VIP", 3),
    role(fixture.botRoleId, "RayFox", 6, true),
  ];
}

function memberSyncSnapshot(fixture, version) {
  const alpha = member({
    id: fixture.memberAlphaId,
    username: version === 1 ? "alpha.builder" : "alpha.renamed",
    nick: version === 1 ? "Alpha Builder" : "Alpha Renamed",
    roles:
      version === 1
        ? [fixture.roleId, fixture.vipRoleId]
        : [fixture.roleId, fixture.adminRoleId],
    joinedAt: "2026-08-20T05:00:00.000Z",
  });
  const rayFox = member({
    id: fixture.botUserId,
    username: "rayfox",
    nick: "RayFox",
    roles: [fixture.botRoleId],
    bot: true,
    joinedAt: "2026-08-20T05:00:00.000Z",
  });
  if (version === 2) {
    return [
      alpha,
      rayFox,
      member({
        id: fixture.memberGammaId,
        username: "gamma.domains",
        nick: "Gamma Domains",
        roles: [fixture.vipRoleId],
        joinedAt: "2026-08-24T06:00:00.000Z",
      }),
    ];
  }
  return [
    alpha,
    member({
      id: fixture.memberBetaId,
      username: "beta.domains",
      nick: "Beta Domains",
      roles: [fixture.vipRoleId],
      joinedAt: "2026-08-21T05:00:00.000Z",
    }),
    rayFox,
  ];
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

export function createDiscordApiStub(fixture = discordStubFixture) {
  const assignedRoles = new Map();
  const retryAttempts = new Map();
  const recordedCalls = [];
  let memberSyncVersion = 1;
  let memberSyncMode = "ok";
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
      memberSyncVersion = 1;
      memberSyncMode = "ok";
      return new Response(null, { status: 204 });
    }
    if (
      url.hostname === "127.0.0.1" &&
      url.pathname === "/__test/member-sync/version" &&
      request.method === "POST"
    ) {
      const body = await request.json().catch(() => null);
      if (!body || ![1, 2].includes(body.version)) {
        return json({ error: "Invalid version" }, 400);
      }
      memberSyncVersion = body.version;
      return new Response(null, { status: 204 });
    }
    if (
      url.hostname === "127.0.0.1" &&
      url.pathname === "/__test/member-sync/mode" &&
      request.method === "POST"
    ) {
      const body = await request.json().catch(() => null);
      const modes = ["ok", "unauthorized", "forbidden", "rate-limited", "unavailable"];
      if (!body || !modes.includes(body.mode)) {
        return json({ error: "Invalid mode" }, 400);
      }
      memberSyncMode = body.mode;
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("authorization") !== testBotAuthorization) {
      return finish(request, json({ error: "Unauthorized" }, 401));
    }

    const apiPath = url.pathname.replace(/^\/api\/v10/, "");
    const snapshotPath = `/guilds/${fixture.guildId}`;
    if (
      request.method === "GET" &&
      (apiPath === `${snapshotPath}/roles` ||
        apiPath === `${snapshotPath}/members`)
    ) {
      const failureStatus = {
        unauthorized: 401,
        forbidden: 403,
        "rate-limited": 429,
        unavailable: 503,
      }[memberSyncMode];
      if (failureStatus) {
        return finish(
          request,
          json(
            memberSyncMode === "rate-limited"
              ? { retry_after: 0.01 }
              : { error: "Test member-sync failure" },
            failureStatus,
          ),
        );
      }
      if (apiPath.endsWith("/roles")) {
        return finish(request, json(memberSyncRoles(fixture)));
      }

      const snapshot = memberSyncSnapshot(fixture, memberSyncVersion);
      const limit = Math.max(1, Math.min(1_000, Number(url.searchParams.get("limit")) || 1_000));
      const after = url.searchParams.get("after");
      const start = after
        ? Math.max(0, snapshot.findIndex((item) => item.user.id === after) + 1)
        : 0;
      return finish(request, json(snapshot.slice(start, start + limit)));
    }

    const memberMatch = apiPath.match(
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
      memberSyncVersion = 1;
      memberSyncMode = "ok";
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

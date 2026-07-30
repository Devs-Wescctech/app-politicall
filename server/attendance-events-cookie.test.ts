import { createServer, type Server } from "node:http";
import { connect as connectSocket, type Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, type RawData } from "ws";
import { issueAccessToken } from "./security/auth-cookies";
import {
  ATTENDANCE_HEARTBEAT_INTERVAL_MS,
  closeAttendanceRealtime,
  setupAttendanceRealtime,
} from "./attendance-events";

vi.mock("./storage", () => ({
  storage: { getUser: vi.fn() },
}));

const ORIGIN = "https://app.example.test";
const SESSION_SECRET = "attendance-cookie-test-session-secret";
const originalSessionSecret = process.env.SESSION_SECRET;
const originalPublicAppUrl = process.env.PUBLIC_APP_URL;
const servers: Server[] = [];
const clients: WebSocket[] = [];
const rawSockets: Socket[] = [];
const receivedPackets = new WeakMap<WebSocket, Record<string, unknown>[]>();

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    familyId: "family-1",
    accountId: "account-1",
    userId: "user-1",
    globalAdminPrincipalId: null,
    principalId: "user-1",
    principalType: "user",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    accountId: "account-1",
    email: "user@example.test",
    name: "User",
    role: "assessor",
    permissions: {},
    ...overrides,
  };
}

function accessCookie(sessionId = "session-1"): string {
  return `politicall_access=${issueAccessToken({ sid: sessionId, kind: "user" })}`;
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return address.port;
}

function websocketUrl(port: number, suffix = ""): string {
  return `ws://127.0.0.1:${port}/api/attendance/realtime${suffix}`;
}

function openClient(
  url: string,
  options: { origin?: string; cookie?: string; authorization?: string } = {},
): Promise<WebSocket> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.authorization) headers.Authorization = options.authorization;
  const client = new WebSocket(url, {
    ...(options.origin ? { origin: options.origin } : {}),
    headers,
  });
  clients.push(client);
  receivedPackets.set(client, []);
  client.on("message", (data) => {
    try {
      const packet = JSON.parse(data.toString());
      if (packet && typeof packet === "object" && !Array.isArray(packet)) {
        receivedPackets.get(client)?.push(packet);
      }
    } catch {
      // Packet-specific assertions decide whether malformed data is relevant.
    }
  });
  return new Promise((resolve, reject) => {
    client.once("open", () => resolve(client));
    client.once("error", reject);
  });
}

function rejectedStatus(
  url: string,
  options: { origin?: string; cookie?: string; authorization?: string } = {},
): Promise<number> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.authorization) headers.Authorization = options.authorization;
  const client = new WebSocket(url, {
    ...(options.origin ? { origin: options.origin } : {}),
    headers,
  });
  clients.push(client);
  client.on("error", () => undefined);
  return new Promise((resolve, reject) => {
    client.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    client.once("open", () => reject(new Error("WebSocket unexpectedly opened")));
    setTimeout(() => reject(new Error("Timed out waiting for WebSocket rejection")), 1_000).unref();
  });
}

function pendingClient(url: string, sessionId = "session-1"): WebSocket {
  const client = new WebSocket(url, {
    origin: ORIGIN,
    headers: { Cookie: accessCookie(sessionId) },
  });
  clients.push(client);
  client.on("error", () => undefined);
  return client;
}

function rawUpgradeStatus(port: number, target: string): Promise<number> {
  const socket = connectSocket({ host: "127.0.0.1", port });
  rawSockets.push(socket);
  socket.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let response = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out rejecting target ${target}`)), 1_000);
    timeout.unref();
    socket.on("data", (chunk) => {
      response += chunk;
      const match = /^HTTP\/1\.1 (\d{3}) /m.exec(response);
      if (!match) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve(Number(match[1]));
    });
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\n`
        + `Host: 127.0.0.1:${port}\r\n`
        + `Origin: ${ORIGIN}\r\n`
        + `Cookie: ${accessCookie()}\r\n`
        + "Connection: Upgrade\r\n"
        + "Upgrade: websocket\r\n"
        + "Sec-WebSocket-Version: 13\r\n"
        + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        + "\r\n",
      );
    });
  });
}

function packetOfType(client: WebSocket, type: string): Promise<Record<string, unknown>> {
  const packets = receivedPackets.get(client) ?? [];
  const existingIndex = packets.findIndex((packet) => packet.type === type);
  if (existingIndex >= 0) return Promise.resolve(packets.splice(existingIndex, 1)[0]);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 1_000);
    timeout.unref();
    const onMessage = (data: RawData) => {
      try {
        const packet = JSON.parse(data.toString()) as Record<string, unknown>;
        if (packet.type !== type) return;
        clearTimeout(timeout);
        client.off("message", onMessage);
        resolve(packet);
      } catch {
        // Continue waiting for a valid packet of the requested type.
      }
    };
    client.on("message", onMessage);
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.PUBLIC_APP_URL = ORIGIN;
});

afterEach(async () => {
  for (const socket of rawSockets.splice(0)) {
    if (!socket.destroyed) socket.destroy();
  }
  for (const client of clients.splice(0)) {
    if (client.readyState !== WebSocket.CLOSED) client.terminate();
  }
  await closeAttendanceRealtime();
  await Promise.all(servers.splice(0).map((server) => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  vi.restoreAllMocks();
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("attendance realtime cookie authentication", () => {
  it("opens only from a valid user cookie and authoritative session/account handshake", async () => {
    const server = createServer();
    const resolveAccessSession = vi.fn(async () => activeSession());
    const getUser = vi.fn(async () => user());
    setupAttendanceRealtime(server, { resolveAccessSession, getUser });
    const port = await listen(server);

    const client = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie() });
    const connected = await packetOfType(client, "attendance.realtime.connected");

    expect(resolveAccessSession).toHaveBeenCalledWith({ kind: "user", sessionId: "session-1" });
    expect(getUser).toHaveBeenCalledWith("user-1");
    expect(connected).toMatchObject({
      type: "attendance.realtime.connected",
      userId: "user-1",
      accountId: "account-1",
      heartbeatIntervalMs: ATTENDANCE_HEARTBEAT_INTERVAL_MS,
      createdAt: expect.any(String),
      connectionId: expect.any(String),
    });
    expect(String(connected.connectionId)).not.toBe("session-1");
    expect(JSON.stringify(connected)).not.toContain(SESSION_SECRET);
    expect(JSON.stringify(connected)).not.toContain(accessCookie());
  });

  it("emits a fresh connection identifier for every accepted connection", async () => {
    const server = createServer();
    setupAttendanceRealtime(server, {
      resolveAccessSession: async () => activeSession(),
      getUser: async () => user(),
    });
    const port = await listen(server);

    const first = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie() });
    const firstPacket = await packetOfType(first, "attendance.realtime.connected");
    const second = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie() });
    const secondPacket = await packetOfType(second, "attendance.realtime.connected");

    expect(firstPacket.connectionId).not.toBe(secondPacket.connectionId);
  });

  it.each(["?token=legacy", "?access_token=legacy", "?sessionId=session-1"])(
    "rejects query credentials even with a valid cookie: %s",
    async (query) => {
      const server = createServer();
      const resolveAccessSession = vi.fn(async () => activeSession());
      setupAttendanceRealtime(server, {
        resolveAccessSession,
        getUser: async () => user(),
      });
      const port = await listen(server);

      expect(await rejectedStatus(websocketUrl(port, query), {
        origin: ORIGIN,
        cookie: accessCookie(),
      })).toBe(401);
      expect(resolveAccessSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", undefined],
    ["wrong", "https://evil.example.test"],
  ])("rejects a %s Origin before authoritative session lookup", async (_label, origin) => {
    const server = createServer();
    const resolveAccessSession = vi.fn(async () => activeSession());
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
    });
    const port = await listen(server);

    expect(await rejectedStatus(websocketUrl(port), {
      ...(origin ? { origin } : {}),
      cookie: accessCookie(),
    })).toBe(403);
    expect(resolveAccessSession).not.toHaveBeenCalled();
  });

  it("rejects missing, invalid, admin, and legacy Bearer credentials", async () => {
    const server = createServer();
    const resolveAccessSession = vi.fn(async () => activeSession());
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
    });
    const port = await listen(server);
    const adminAccess = issueAccessToken({ sid: "admin-session", kind: "admin" });

    const statuses = await Promise.all([
      rejectedStatus(websocketUrl(port), { origin: ORIGIN }),
      rejectedStatus(websocketUrl(port), { origin: ORIGIN, cookie: "politicall_access=invalid" }),
      rejectedStatus(websocketUrl(port), { origin: ORIGIN, cookie: `politicall_admin_access=${adminAccess}` }),
      rejectedStatus(websocketUrl(port), { origin: ORIGIN, authorization: "Bearer legacy-token" }),
    ]);

    expect(statuses).toEqual([401, 401, 401, 401]);
    expect(resolveAccessSession).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["revoked", activeSession({ revokedAt: new Date() })],
    ["expired", activeSession({ expiresAt: new Date(Date.now() - 1) })],
    ["admin principal", activeSession({
      principalType: "global_admin",
      principalId: "admin-1",
      accountId: null,
      userId: null,
      globalAdminPrincipalId: "admin-1",
    })],
  ])("rejects a %s authoritative session", async (_label, session) => {
    const server = createServer();
    const getUser = vi.fn(async () => user());
    setupAttendanceRealtime(server, {
      resolveAccessSession: async () => session as any,
      getUser,
    });
    const port = await listen(server);

    expect(await rejectedStatus(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie(),
    })).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["session id mismatch", activeSession({ id: "session-2" }), user()],
    ["session user mismatch", activeSession({ userId: "user-2" }), user()],
    ["session account mismatch", activeSession({ accountId: "account-2" }), user()],
    ["reloaded user mismatch", activeSession(), user({ id: "user-2" })],
    ["reloaded account mismatch", activeSession(), user({ accountId: "account-2" })],
  ])("rejects %s", async (_label, session, reloadedUser) => {
    const server = createServer();
    setupAttendanceRealtime(server, {
      resolveAccessSession: async () => session as any,
      getUser: async () => reloadedUser as any,
    });
    const port = await listen(server);

    expect(await rejectedStatus(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie(),
    })).toBe(401);
  });

  it("emits bounded observable heartbeats with connection and account scope", async () => {
    const server = createServer();
    setupAttendanceRealtime(server, {
      resolveAccessSession: async () => activeSession(),
      getUser: async () => user(),
      heartbeatIntervalMs: 20,
    });
    const port = await listen(server);
    const client = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie() });
    const connected = await packetOfType(client, "attendance.realtime.connected");
    const heartbeat = await packetOfType(client, "attendance.realtime.heartbeat");

    expect(connected.heartbeatIntervalMs).toBe(20);
    expect(heartbeat).toMatchObject({
      type: "attendance.realtime.heartbeat",
      connectionId: connected.connectionId,
      accountId: "account-1",
      createdAt: expect.any(String),
    });
    expect(heartbeat).not.toHaveProperty("sessionId");
    expect(heartbeat).not.toHaveProperty("userId");
  });

  it.each([
    "/api/attendance/realtime?",
    "/api/attendance/realtime?token=legacy",
    "/api/attendance/realtime#fragment",
    "/api/attendance/realtime/",
    "http://app.example.test/api/attendance/realtime",
  ])("rejects every non-literal raw request target: %s", async (target) => {
    const server = createServer();
    const resolveAccessSession = vi.fn(async () => activeSession());
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
    });
    const port = await listen(server);

    expect(await rawUpgradeStatus(port, target)).toBe(404);
    expect(resolveAccessSession).not.toHaveBeenCalled();
  });

  it("enforces the global pending-auth limit and releases capacity after close", async () => {
    const server = createServer();
    const resolveAccessSession = vi.fn(() => new Promise<any>(() => undefined));
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
      authenticationTimeoutMs: 1_000,
      maxPendingUpgrades: 1,
      maxPendingUpgradesPerSession: 1,
    });
    const port = await listen(server);
    const first = pendingClient(websocketUrl(port), "session-1");
    await vi.waitFor(() => expect(resolveAccessSession).toHaveBeenCalledTimes(1));

    expect(await rejectedStatus(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie("session-2"),
    })).toBe(503);
    expect(resolveAccessSession).toHaveBeenCalledTimes(1);

    first.terminate();
    const replacement = pendingClient(websocketUrl(port), "session-2");
    await vi.waitFor(() => expect(resolveAccessSession).toHaveBeenCalledTimes(2));
    replacement.terminate();
  });

  it("enforces the per-session pending-auth limit without blocking another session", async () => {
    const server = createServer();
    const resolveAccessSession = vi.fn(() => new Promise<any>(() => undefined));
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
      authenticationTimeoutMs: 1_000,
      maxPendingUpgrades: 2,
      maxPendingUpgradesPerSession: 1,
    });
    const port = await listen(server);
    const first = pendingClient(websocketUrl(port), "session-1");
    await vi.waitFor(() => expect(resolveAccessSession).toHaveBeenCalledTimes(1));

    expect(await rejectedStatus(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie("session-1"),
    })).toBe(429);

    const otherSession = pendingClient(websocketUrl(port), "session-2");
    await vi.waitFor(() => expect(resolveAccessSession).toHaveBeenCalledTimes(2));
    const firstClosed = new Promise<void>((resolve) => first.once("close", () => resolve()));
    first.terminate();
    await firstClosed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const sameSessionReplacement = pendingClient(websocketUrl(port), "session-1");
    await vi.waitFor(() => expect(resolveAccessSession).toHaveBeenCalledTimes(3));
    otherSession.terminate();
    sameSessionReplacement.terminate();
  });

  it("releases admission after successful upgrades while connected clients remain open", async () => {
    const server = createServer();
    setupAttendanceRealtime(server, {
      resolveAccessSession: async ({ sessionId }) => activeSession({ id: sessionId }),
      getUser: async () => user(),
      maxPendingUpgrades: 1,
      maxPendingUpgradesPerSession: 1,
    });
    const port = await listen(server);

    const first = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie("session-1") });
    const second = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie("session-2") });

    expect(first.readyState).toBe(WebSocket.OPEN);
    expect(second.readyState).toBe(WebSocket.OPEN);
  });

  it("times out authentication, releases admission, and ignores a late result", async () => {
    const server = createServer();
    let resolveFirst!: (session: any) => void;
    const firstSession = new Promise<any>((resolve) => {
      resolveFirst = resolve;
    });
    const resolveAccessSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
      if (sessionId === "session-1") return firstSession;
      return activeSession({ id: sessionId });
    });
    setupAttendanceRealtime(server, {
      resolveAccessSession,
      getUser: async () => user(),
      authenticationTimeoutMs: 20,
      maxPendingUpgrades: 1,
      maxPendingUpgradesPerSession: 1,
    });
    const port = await listen(server);

    expect(await rejectedStatus(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie("session-1"),
    })).toBe(503);

    const accepted = await openClient(websocketUrl(port), {
      origin: ORIGIN,
      cookie: accessCookie("session-2"),
    });
    resolveFirst(activeSession());
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(accepted.readyState).toBe(WebSocket.OPEN);
    expect(resolveAccessSession).toHaveBeenCalledTimes(2);
  });

  it("releases pending admission on shutdown before a new instance starts", async () => {
    const serverA = createServer();
    const pendingLookup = vi.fn(() => new Promise<any>(() => undefined));
    setupAttendanceRealtime(serverA, {
      resolveAccessSession: pendingLookup,
      getUser: async () => user(),
      maxPendingUpgrades: 1,
      maxPendingUpgradesPerSession: 1,
    });
    const portA = await listen(serverA);
    pendingClient(websocketUrl(portA));
    await vi.waitFor(() => expect(pendingLookup).toHaveBeenCalledTimes(1));

    await closeAttendanceRealtime();

    const serverB = createServer();
    setupAttendanceRealtime(serverB, {
      resolveAccessSession: async () => activeSession(),
      getUser: async () => user(),
      maxPendingUpgrades: 1,
      maxPendingUpgradesPerSession: 1,
    });
    const portB = await listen(serverB);
    const accepted = await openClient(websocketUrl(portB), { origin: ORIGIN, cookie: accessCookie() });

    expect(accepted.readyState).toBe(WebSocket.OPEN);
  });

  it("closes oversized inbound payloads and negotiates no compression", async () => {
    const server = createServer();
    setupAttendanceRealtime(server, {
      resolveAccessSession: async () => activeSession(),
      getUser: async () => user(),
    });
    const port = await listen(server);
    const client = await openClient(websocketUrl(port), { origin: ORIGIN, cookie: accessCookie() });
    const closed = new Promise<number>((resolve) => client.once("close", resolve));

    client.send(Buffer.alloc(4_097));

    expect(await closed).toBe(1009);
    expect(client.extensions).toBe("");
  });
});

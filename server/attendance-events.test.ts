import { createServer } from "node:http";
import { connect as connectSocket, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { closeAttendanceRealtime, setupAttendanceRealtime } from "./attendance-events";
import { issueAccessToken } from "./security/auth-cookies";
import { storage } from "./storage";

vi.mock("./storage", () => ({
  storage: { getUser: vi.fn() },
}));

const servers: ReturnType<typeof createServer>[] = [];
const rawSockets: Socket[] = [];
const serverUpgradeSockets: Duplex[] = [];
const websocketClients: WebSocket[] = [];
const originalSessionSecret = process.env.SESSION_SECRET;
const ORIGIN = "https://app.example.test";

function activeSession() {
  return {
    id: "session-1",
    accountId: "account-1",
    userId: "user-1",
    globalAdminPrincipalId: null,
    principalId: "user-1",
    principalType: "user",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
}

function cookieHeader(): string {
  return `politicall_access=${issueAccessToken({ sid: "session-1", kind: "user" })}`;
}

afterEach(async () => {
  for (const socket of rawSockets.splice(0)) {
    if (!socket.destroyed) socket.destroy();
  }
  for (const socket of serverUpgradeSockets.splice(0)) {
    if (!socket.destroyed) socket.destroy();
  }
  for (const client of websocketClients.splice(0)) {
    if (client.readyState !== WebSocket.CLOSED) client.terminate();
  }
  await closeAttendanceRealtime();
  await Promise.all(servers.splice(0).map((server) => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  vi.clearAllMocks();
  if (originalSessionSecret === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = originalSessionSecret;
  }
});

describe("attendance realtime lifecycle", () => {
  it("removes its upgrade listener, closes the websocket server, and can be set up again", async () => {
    const server = createServer();
    servers.push(server);
    const first = setupAttendanceRealtime(server);
    const close = vi.spyOn(first, "close");

    expect(server.listenerCount("upgrade")).toBe(1);
    expect(setupAttendanceRealtime(server)).toBe(first);

    await closeAttendanceRealtime();

    expect(close).toHaveBeenCalledTimes(1);
    expect(server.listenerCount("upgrade")).toBe(0);
    expect(setupAttendanceRealtime(server)).not.toBe(first);
    expect(server.listenerCount("upgrade")).toBe(1);
  });

  it("terminates connected clients during shutdown", async () => {
    const server = createServer();
    servers.push(server);
    const sessionSecret = "test-session-secret";
    process.env.SESSION_SECRET = sessionSecret;
    vi.mocked(storage.getUser).mockResolvedValue({ id: "user-1", accountId: "account-1" } as any);
    setupAttendanceRealtime(server, {
      allowedOrigins: [ORIGIN],
      resolveAccessSession: async () => activeSession() as any,
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const client = new WebSocket(`ws://127.0.0.1:${address.port}/api/attendance/realtime`, {
      origin: ORIGIN,
      headers: { Cookie: cookieHeader() },
    });
    websocketClients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await closeAttendanceRealtime();
    await closed;

    expect(client.readyState).toBe(WebSocket.CLOSED);
  });

  it("destroys an upgrade waiting on authentication and ignores its late result", async () => {
    const server = createServer();
    servers.push(server);
    const sessionSecret = "test-session-secret";
    process.env.SESSION_SECRET = sessionSecret;
    let resolveUser!: (user: any) => void;
    const pendingUser = new Promise<any>((resolve) => {
      resolveUser = resolve;
    });
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      markLookupStarted = resolve;
    });
    vi.mocked(storage.getUser).mockImplementation(async () => {
      markLookupStarted();
      return pendingUser;
    });
    setupAttendanceRealtime(server, {
      allowedOrigins: [ORIGIN],
      resolveAccessSession: async () => activeSession() as any,
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const client = new WebSocket(`ws://127.0.0.1:${address.port}/api/attendance/realtime`, {
      origin: ORIGIN,
      headers: { Cookie: cookieHeader() },
    });
    websocketClients.push(client);
    client.on("error", () => undefined);
    await lookupStarted;

    await closeAttendanceRealtime();
    const closedBeforeAuthenticationCompleted = await Promise.race([
      new Promise<boolean>((resolve) => {
        if (client.readyState === WebSocket.CLOSED) {
          resolve(true);
          return;
        }
        client.once("close", () => resolve(true));
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    resolveUser({ id: "user-1", accountId: "account-1" });

    expect(closedBeforeAuthenticationCompleted).toBe(true);
    await vi.waitFor(() => {
      expect(client.readyState).toBe(WebSocket.CLOSED);
    }, { timeout: 500, interval: 10 });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(client.readyState).toBe(WebSocket.CLOSED);
  });

  it("passes unrelated upgrades to other websocket handlers", async () => {
    const server = createServer();
    servers.push(server);
    setupAttendanceRealtime(server);
    let handledByOtherListener = false;
    server.on("upgrade", (request, socket) => {
      if (request.url !== "/unsupported-realtime") return;
      handledByOtherListener = true;
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const socket = connectSocket({ host: "127.0.0.1", port: address.port });
    rawSockets.push(socket);
    socket.setEncoding("utf8");
    let response = "";
    socket.on("data", (chunk) => {
      response += chunk;
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(
      "GET /unsupported-realtime HTTP/1.1\r\n"
      + `Host: 127.0.0.1:${address.port}\r\n`
      + "Connection: Upgrade\r\n"
      + "Upgrade: websocket\r\n"
      + "Sec-WebSocket-Version: 13\r\n"
      + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
      + "\r\n",
    );
    const socketClosed = new Promise<void>((resolve) => {
      if (socket.destroyed) {
        resolve();
        return;
      }
      socket.once("close", () => resolve());
    });
    const closedWithoutIntervention = await Promise.race([
      socketClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);

    if (!socket.destroyed) socket.destroy();
    let serverCloseFinished = false;
    const serverClosed = new Promise<void>((resolve) => {
      server.close(() => {
        serverCloseFinished = true;
        resolve();
      });
    });
    await serverClosed;

    expect(closedWithoutIntervention).toBe(true);
    expect(serverCloseFinished).toBe(true);
    expect(handledByOtherListener).toBe(true);
    expect(socket.destroyed).toBe(true);
    expect(response).toMatch(/^HTTP\/1\.1 426 /);
  });

  it("rejects setup while the previous realtime instance is closing", async () => {
    const serverA = createServer();
    const serverB = createServer();
    servers.push(serverA, serverB);
    setupAttendanceRealtime(serverA);

    const closingA = closeAttendanceRealtime();
    let setupError: unknown;
    try {
      setupAttendanceRealtime(serverB);
    } catch (error) {
      setupError = error;
    }
    const listenersInstalledDuringClose = serverB.listenerCount("upgrade");
    await closingA;

    expect(setupError).toBeInstanceOf(Error);
    expect((setupError as Error).message).toBe("Attendance realtime is unavailable");
    expect(listenersInstalledDuringClose).toBe(0);

    const realtimeB = setupAttendanceRealtime(serverB);
    const closeB = vi.spyOn(realtimeB, "close");
    expect(serverB.listenerCount("upgrade")).toBe(1);

    await closeAttendanceRealtime();

    expect(closeB).toHaveBeenCalledTimes(1);
    expect(serverB.listenerCount("upgrade")).toBe(0);
  });
});

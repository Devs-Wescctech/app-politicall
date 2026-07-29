import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { closeAttendanceRealtime, setupAttendanceRealtime } from "./attendance-events";
import { storage } from "./storage";

vi.mock("./storage", () => ({
  storage: { getUser: vi.fn() },
}));

const servers: ReturnType<typeof createServer>[] = [];
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(async () => {
  await closeAttendanceRealtime();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
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
    setupAttendanceRealtime(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const token = jwt.sign({ userId: "user-1", accountId: "account-1" }, sessionSecret);
    const client = new WebSocket(`ws://127.0.0.1:${address.port}/api/attendance/realtime?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await closeAttendanceRealtime();
    await closed;

    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
});

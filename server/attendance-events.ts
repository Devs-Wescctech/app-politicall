import type { Server } from "http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { storage } from "./storage";

type AttendanceRealtimeClient = WebSocket & {
  accountId?: string;
  userId?: string;
  isAlive?: boolean;
};

export type AttendanceRealtimeEvent = {
  type: string;
  accountId: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, any>;
  createdAt?: string;
};

const clientsByAccount = new Map<string, Set<AttendanceRealtimeClient>>();
let websocketServer: WebSocketServer | null = null;
let realtimeServer: Server | null = null;
let upgradeListener: ((request: any, socket: any, head: Buffer) => void) | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let closePromise: Promise<void> | null = null;

function addClient(ws: AttendanceRealtimeClient, accountId: string) {
  let clients = clientsByAccount.get(accountId);
  if (!clients) {
    clients = new Set();
    clientsByAccount.set(accountId, clients);
  }
  clients.add(ws);
}

function removeClient(ws: AttendanceRealtimeClient) {
  if (!ws.accountId) return;
  const clients = clientsByAccount.get(ws.accountId);
  clients?.delete(ws);
  if (clients?.size === 0) clientsByAccount.delete(ws.accountId);
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export function publishAttendanceEvent(event: AttendanceRealtimeEvent) {
  const clients = clientsByAccount.get(event.accountId);
  if (!clients || clients.size === 0) return;

  const payload = {
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
  };

  for (const client of clients) {
    sendJson(client, payload);
  }
}

export function setupAttendanceRealtime(server: Server) {
  if (websocketServer) return websocketServer;

  const realtime = new WebSocketServer({ noServer: true });
  websocketServer = realtime;
  realtimeServer = server;

  upgradeListener = async (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/attendance/realtime") return;

    const token = url.searchParams.get("token");
    if (!token || !process.env.SESSION_SECRET) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET) as { userId: string; accountId: string };
      const user = await storage.getUser(decoded.userId);
      if (!user || user.accountId !== decoded.accountId) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      realtime.handleUpgrade(request, socket, head, (ws) => {
        const client = ws as AttendanceRealtimeClient;
        client.accountId = user.accountId;
        client.userId = user.id;
        client.isAlive = true;
        addClient(client, user.accountId);

        client.on("pong", () => {
          client.isAlive = true;
        });
        client.on("close", () => removeClient(client));
        client.on("error", () => removeClient(client));

        sendJson(client, {
          type: "attendance.realtime.connected",
          accountId: user.accountId,
          userId: user.id,
          createdAt: new Date().toISOString(),
        });
      });
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
    }
  };
  server.on("upgrade", upgradeListener);

  heartbeat = setInterval(() => {
    for (const clients of clientsByAccount.values()) {
      for (const client of clients) {
        if (client.isAlive === false) {
          client.terminate();
          removeClient(client);
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }
  }, 30_000);
  heartbeat.unref?.();

  return realtime;
}

function closeWebSocketServer(server: WebSocketServer | null): Promise<void> {
  if (!server) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

export function closeAttendanceRealtime(): Promise<void> {
  if (closePromise) return closePromise;

  const activeWebsocketServer = websocketServer;
  const activeServer = realtimeServer;
  const activeUpgradeListener = upgradeListener;

  websocketServer = null;
  realtimeServer = null;
  upgradeListener = null;

  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }

  if (activeServer && activeUpgradeListener) {
    activeServer.off("upgrade", activeUpgradeListener);
  }

  for (const clients of clientsByAccount.values()) {
    for (const client of clients) {
      try {
        client.close();
      } catch {
        // Continue closing the remaining realtime clients.
      }

      try {
        client.terminate();
      } catch {
        // A closed client cannot be terminated again.
      }
    }
  }
  clientsByAccount.clear();

  closePromise = closeWebSocketServer(activeWebsocketServer).finally(() => {
    closePromise = null;
  });
  return closePromise;
}

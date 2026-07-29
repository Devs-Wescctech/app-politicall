import type { IncomingMessage, Server } from "http";
import type { Duplex } from "node:stream";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { storage } from "./storage";

type AttendanceRealtimeClient = WebSocket & {
  accountId?: string;
  userId?: string;
  isAlive?: boolean;
};

type AttendanceUpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

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
let upgradeListener: AttendanceUpgradeListener | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let closePromise: Promise<void> | null = null;
const pendingUpgradeSockets = new Set<Duplex>();

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

  const listener: AttendanceUpgradeListener = async (request, socket, head) => {
    pendingUpgradeSockets.add(socket);
    const stopTrackingSocket = () => {
      pendingUpgradeSockets.delete(socket);
      socket.off("close", stopTrackingSocket);
    };
    const rejectUpgrade = (status: "401 Unauthorized" | "403 Forbidden") => {
      stopTrackingSocket();
      if (socket.destroyed) return;
      socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
      socket.destroy();
    };
    socket.once("close", stopTrackingSocket);

    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/attendance/realtime") {
      stopTrackingSocket();
      return;
    }

    const token = url.searchParams.get("token");
    if (!token || !process.env.SESSION_SECRET) {
      rejectUpgrade("401 Unauthorized");
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET) as { userId: string; accountId: string };
      const user = await storage.getUser(decoded.userId);
      const realtimeIsActive = websocketServer === realtime
        && realtimeServer === server
        && upgradeListener === listener;
      if (!realtimeIsActive || !pendingUpgradeSockets.has(socket) || socket.destroyed) {
        stopTrackingSocket();
        if (!socket.destroyed) socket.destroy();
        return;
      }

      if (!user || user.accountId !== decoded.accountId) {
        rejectUpgrade("403 Forbidden");
        return;
      }

      realtime.handleUpgrade(request, socket, head, (ws) => {
        stopTrackingSocket();
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
      rejectUpgrade("403 Forbidden");
    }
  };
  upgradeListener = listener;
  server.on("upgrade", listener);

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

  for (const socket of pendingUpgradeSockets) {
    try {
      socket.destroy();
    } catch {
      // Continue destroying the remaining pending upgrades.
    }
  }
  pendingUpgradeSockets.clear();

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

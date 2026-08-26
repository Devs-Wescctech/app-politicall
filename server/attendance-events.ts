import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  ATTENDANCE_HEARTBEAT_INTERVAL_MS,
  type AttendanceConnectedPacket,
  type AttendanceHeartbeatPacket,
} from "@shared/attendance-realtime";
import { getAuthAllowedOrigins } from "./routes/auth-session-routes";
import { readAccessToken } from "./security/auth-cookies";
import {
  resolveAccessSession,
  type AuthSessionRecord,
} from "./services/auth-session-store";
import { storage } from "./storage";

type AttendanceRealtimeClient = WebSocket & {
  accountId?: string;
  userId?: string;
  connectionId?: string;
  isAlive?: boolean;
};

type AttendanceUpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

type ClosingRealtimeState = {
  instance: {
    websocketServer: WebSocketServer | null;
    httpServer: Server | null;
  };
  promise: Promise<void>;
};

type PendingUpgradeAdmission = {
  sessionId: string;
  timeout: NodeJS.Timeout;
};

export type AttendanceRealtimeEvent = {
  type: string;
  accountId: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, any>;
  createdAt?: string;
};

type AttendanceRealtimeUser = {
  id: string;
  accountId: string;
};

export type AttendanceRealtimeDependencies = {
  allowedOrigins?: readonly string[];
  resolveAccessSession?: (input: {
    kind: "user";
    sessionId: string;
  }) => Promise<AuthSessionRecord | undefined>;
  getUser?: (userId: string) => Promise<AttendanceRealtimeUser | undefined>;
  createConnectionId?: () => string;
  now?: () => Date;
  heartbeatIntervalMs?: number;
  authenticationTimeoutMs?: number;
  maxPendingUpgrades?: number;
  maxPendingUpgradesPerSession?: number;
};

export { ATTENDANCE_HEARTBEAT_INTERVAL_MS };

export const ATTENDANCE_AUTHENTICATION_TIMEOUT_MS = 8_000;
export const ATTENDANCE_MAX_PENDING_UPGRADES = 128;
export const ATTENDANCE_MAX_PENDING_UPGRADES_PER_SESSION = 8;
export const ATTENDANCE_MAX_PAYLOAD_BYTES = 4 * 1024;
const ATTENDANCE_REALTIME_PATH = "/api/attendance/realtime";

const clientsByAccount = new Map<string, Set<AttendanceRealtimeClient>>();
let websocketServer: WebSocketServer | null = null;
let realtimeServer: Server | null = null;
let upgradeListener: AttendanceUpgradeListener | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let closingRealtime: ClosingRealtimeState | null = null;
const pendingUpgradeSockets = new Set<Duplex>();
const pendingUpgradeAdmissions = new Map<Duplex, PendingUpgradeAdmission>();
const pendingUpgradeCountBySession = new Map<string, number>();

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

function isActiveUserSession(
  session: AuthSessionRecord | undefined,
  sessionId: string,
): session is AuthSessionRecord & { accountId: string; userId: string } {
  return !!session
    && session.id === sessionId
    && session.principalType === "user"
    && typeof session.accountId === "string"
    && session.accountId.length > 0
    && typeof session.userId === "string"
    && session.userId.length > 0
    && session.principalId === session.userId
    && session.globalAdminPrincipalId === null
    && session.revokedAt === null
    && session.expiresAt > new Date();
}

function validHeartbeatInterval(value: number | undefined): number {
  if (value === undefined) return ATTENDANCE_HEARTBEAT_INTERVAL_MS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > ATTENDANCE_HEARTBEAT_INTERVAL_MS) {
    throw new Error("Attendance realtime heartbeat interval is invalid");
  }
  return value;
}

function boundedPositiveInteger(value: number | undefined, defaultValue: number, maximum: number, name: string): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function isAttendanceRealtimeCandidate(target: string | undefined): boolean {
  if (!target) return false;
  if (target === ATTENDANCE_REALTIME_PATH
    || target.startsWith(`${ATTENDANCE_REALTIME_PATH}?`)
    || target.startsWith(`${ATTENDANCE_REALTIME_PATH}#`)
    || target.startsWith(`${ATTENDANCE_REALTIME_PATH}/`)) return true;
  try {
    const url = new URL(target);
    return url.pathname === ATTENDANCE_REALTIME_PATH || url.pathname.startsWith(`${ATTENDANCE_REALTIME_PATH}/`);
  } catch {
    return false;
  }
}

function releasePendingAdmission(socket: Duplex): void {
  const admission = pendingUpgradeAdmissions.get(socket);
  if (!admission) return;
  pendingUpgradeAdmissions.delete(socket);
  clearTimeout(admission.timeout);
  const nextSessionCount = (pendingUpgradeCountBySession.get(admission.sessionId) ?? 1) - 1;
  if (nextSessionCount <= 0) pendingUpgradeCountBySession.delete(admission.sessionId);
  else pendingUpgradeCountBySession.set(admission.sessionId, nextSessionCount);
}

export function setupAttendanceRealtime(
  server: Server,
  dependencies: AttendanceRealtimeDependencies = {},
) {
  if (closingRealtime) {
    throw new Error("Attendance realtime is unavailable");
  }
  if (websocketServer) return websocketServer;

  const allowedOrigins = new Set(dependencies.allowedOrigins ?? getAuthAllowedOrigins());
  const resolveSession = dependencies.resolveAccessSession ?? resolveAccessSession;
  const getUser = dependencies.getUser ?? ((userId: string) => storage.getUser(userId));
  const createConnectionId = dependencies.createConnectionId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const heartbeatIntervalMs = validHeartbeatInterval(dependencies.heartbeatIntervalMs);
  const authenticationTimeoutMs = boundedPositiveInteger(
    dependencies.authenticationTimeoutMs,
    ATTENDANCE_AUTHENTICATION_TIMEOUT_MS,
    ATTENDANCE_AUTHENTICATION_TIMEOUT_MS,
    "Attendance realtime authentication timeout",
  );
  const maxPendingUpgrades = boundedPositiveInteger(
    dependencies.maxPendingUpgrades,
    ATTENDANCE_MAX_PENDING_UPGRADES,
    ATTENDANCE_MAX_PENDING_UPGRADES,
    "Attendance realtime pending-upgrade limit",
  );
  const maxPendingUpgradesPerSession = boundedPositiveInteger(
    dependencies.maxPendingUpgradesPerSession,
    ATTENDANCE_MAX_PENDING_UPGRADES_PER_SESSION,
    ATTENDANCE_MAX_PENDING_UPGRADES_PER_SESSION,
    "Attendance realtime per-session pending-upgrade limit",
  );
  if (maxPendingUpgradesPerSession > maxPendingUpgrades) {
    throw new Error("Attendance realtime per-session limit exceeds the global limit");
  }
  const realtime = new WebSocketServer({
    noServer: true,
    maxPayload: ATTENDANCE_MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  websocketServer = realtime;
  realtimeServer = server;

  realtime.on("connection", (socket) => {
    const client = socket as AttendanceRealtimeClient;
    if (!client.accountId || !client.userId || !client.connectionId) {
      client.terminate();
      return;
    }
    addClient(client, client.accountId);

    client.on("pong", () => {
      client.isAlive = true;
    });
    client.on("close", () => removeClient(client));
    client.on("error", () => removeClient(client));

    const connected: AttendanceConnectedPacket = {
      type: "attendance.realtime.connected",
      connectionId: client.connectionId,
      accountId: client.accountId,
      userId: client.userId,
      heartbeatIntervalMs,
      createdAt: now().toISOString(),
    };
    sendJson(client, connected);
  });

  const listener: AttendanceUpgradeListener = async (request, socket, head) => {
    if (!isAttendanceRealtimeCandidate(request.url)) return;

    pendingUpgradeSockets.add(socket);
    let tracking = true;
    const stopTrackingSocket = () => {
      if (!tracking) return;
      tracking = false;
      releasePendingAdmission(socket);
      pendingUpgradeSockets.delete(socket);
      socket.off("close", onSocketClose);
      socket.off("end", onSocketEnd);
      socket.off("error", onSocketError);
    };
    const onSocketClose = () => {
      stopTrackingSocket();
    };
    const onSocketEnd = () => {
      stopTrackingSocket();
      if (!socket.destroyed) socket.destroy();
    };
    const onSocketError = () => {
      stopTrackingSocket();
      if (!socket.destroyed) socket.destroy();
    };
    const rejectUpgrade = (status:
      | "401 Unauthorized"
      | "403 Forbidden"
      | "404 Not Found"
      | "429 Too Many Requests"
      | "503 Service Unavailable") => {
      if (socket.destroyed) {
        stopTrackingSocket();
        return;
      }
      stopTrackingSocket();
      const destroyOnError = () => {
        if (!socket.destroyed) socket.destroy();
      };
      socket.once("error", destroyOnError);
      try {
        socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`, () => {
          socket.off("error", destroyOnError);
          if (!socket.destroyed) socket.destroy();
        });
      } catch {
        socket.destroy();
      }
    };
    socket.once("close", onSocketClose);
    socket.once("end", onSocketEnd);
    socket.on("error", onSocketError);

    try {
      if (request.url !== ATTENDANCE_REALTIME_PATH) {
        rejectUpgrade("404 Not Found");
        return;
      }

      const origin = request.headers.origin;
      if (typeof origin !== "string" || !allowedOrigins.has(origin)) {
        rejectUpgrade("403 Forbidden");
        return;
      }

      const access = readAccessToken(request, "user");
      if (!access) {
        rejectUpgrade("401 Unauthorized");
        return;
      }

      if (pendingUpgradeAdmissions.size >= maxPendingUpgrades) {
        rejectUpgrade("503 Service Unavailable");
        return;
      }
      const sessionPending = pendingUpgradeCountBySession.get(access.sid) ?? 0;
      if (sessionPending >= maxPendingUpgradesPerSession) {
        rejectUpgrade("429 Too Many Requests");
        return;
      }
      const authenticationTimeout = setTimeout(() => {
        rejectUpgrade("503 Service Unavailable");
      }, authenticationTimeoutMs);
      authenticationTimeout.unref?.();
      pendingUpgradeAdmissions.set(socket, {
        sessionId: access.sid,
        timeout: authenticationTimeout,
      });
      pendingUpgradeCountBySession.set(access.sid, sessionPending + 1);

      const session = await resolveSession({ kind: "user", sessionId: access.sid });
      const realtimeIsActive = websocketServer === realtime
        && realtimeServer === server
        && upgradeListener === listener;
      if (!realtimeIsActive || !pendingUpgradeSockets.has(socket) || socket.destroyed) {
        stopTrackingSocket();
        if (!socket.destroyed) socket.destroy();
        return;
      }

      if (!isActiveUserSession(session, access.sid)) {
        rejectUpgrade("401 Unauthorized");
        return;
      }

      const user = await getUser(session.userId);
      const realtimeStillActive = websocketServer === realtime
        && realtimeServer === server
        && upgradeListener === listener;
      if (!realtimeStillActive || !pendingUpgradeSockets.has(socket) || socket.destroyed) {
        stopTrackingSocket();
        if (!socket.destroyed) socket.destroy();
        return;
      }

      if (!user || user.id !== session.userId || user.accountId !== session.accountId) {
        rejectUpgrade("401 Unauthorized");
        return;
      }

      stopTrackingSocket();
      realtime.handleUpgrade(request, socket, head, (ws) => {
        const client = ws as AttendanceRealtimeClient;
        client.accountId = user.accountId;
        client.userId = user.id;
        client.connectionId = createConnectionId();
        client.isAlive = true;
        realtime.emit("connection", client, request);
      });
    } catch {
      rejectUpgrade("401 Unauthorized");
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
        const applicationHeartbeat: AttendanceHeartbeatPacket = {
          type: "attendance.realtime.heartbeat",
          connectionId: client.connectionId!,
          accountId: client.accountId!,
          createdAt: now().toISOString(),
        };
        sendJson(client, applicationHeartbeat);
        client.isAlive = false;
        client.ping();
      }
    }
  }, heartbeatIntervalMs);
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
  if (closingRealtime) return closingRealtime.promise;

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
    releasePendingAdmission(socket);
    try {
      socket.destroy();
    } catch {
      // Continue destroying the remaining pending upgrades.
    }
  }
  pendingUpgradeSockets.clear();
  for (const admission of pendingUpgradeAdmissions.values()) {
    clearTimeout(admission.timeout);
  }
  pendingUpgradeAdmissions.clear();
  pendingUpgradeCountBySession.clear();

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

  const closingInstance = {
    websocketServer: activeWebsocketServer,
    httpServer: activeServer,
  };
  const closePromise = closeWebSocketServer(activeWebsocketServer).finally(() => {
    if (closingRealtime?.instance === closingInstance) {
      closingRealtime = null;
    }
  });
  closingRealtime = {
    instance: closingInstance,
    promise: closePromise,
  };
  return closePromise;
}

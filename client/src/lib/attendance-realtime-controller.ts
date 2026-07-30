import type { QueryClient } from "@tanstack/react-query";
import {
  attendanceConnectionReducer,
  initialAttendanceConnectionState,
  nextReconnectDelay,
  type AttendanceConnectionState,
  type AttendanceConnectionMode,
} from "@/lib/attendance-connection-state";
import {
  applyAttendanceRealtimeEvent,
  type AttendanceRealtimeEvent,
} from "@/lib/attendance-reconciliation";
import {
  ATTENDANCE_HEARTBEAT_INTERVAL_MS,
  ATTENDANCE_HEARTBEAT_TIMEOUT_MS,
  type AttendanceConnectedPacket,
  type AttendanceHeartbeatPacket,
} from "@shared/attendance-realtime";

export { ATTENDANCE_HEARTBEAT_TIMEOUT_MS };

export interface AttendanceRealtimeSocket {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

type EventTargetLike = Pick<EventTarget, "addEventListener" | "removeEventListener">;

type RealtimeLocation = {
  protocol: string;
  host: string;
};

export type AttendanceRealtimeSnapshot = {
  mode: AttendanceConnectionMode;
  isConnected: boolean;
};

export type AttendanceRealtimeControllerDependencies = {
  location: RealtimeLocation;
  createSocket(url: string): AttendanceRealtimeSocket;
  networkTarget: EventTargetLike;
  visibilityTarget: EventTargetLike;
  isOnline(): boolean;
  visibilityState(): DocumentVisibilityState;
  queryClient: QueryClient;
  random?: () => number;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
};

export type AttendanceRealtimeController = {
  start(): void;
  stop(): void;
  reconnectNow(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): AttendanceRealtimeSnapshot;
};

type ConnectionScope = {
  connectionId: string;
  accountId: string;
  userId: string;
};

const BUSINESS_PACKET_TYPES = new Set([
  "attendance.message.created",
  "attendance.conversation.updated",
  "attendance.settings.updated",
]);

const SETTINGS_QUERY_KEYS = [
  "/api/attendance/connections",
  "/api/attendance/sectors",
  "/api/attendance/queues",
  "/api/attendance/quick-replies",
  "/api/attendance/automation-settings",
];

function realtimeUrl(location: RealtimeLocation): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/attendance/realtime`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function connectedPacket(value: Record<string, unknown>): AttendanceConnectedPacket | undefined {
  if (
    value.type !== "attendance.realtime.connected"
    || !isNonEmptyString(value.connectionId)
    || !isNonEmptyString(value.userId)
    || !isNonEmptyString(value.accountId)
    || value.heartbeatIntervalMs !== ATTENDANCE_HEARTBEAT_INTERVAL_MS
    || !hasValidTimestamp(value.createdAt)
  ) {
    return undefined;
  }
  return value as AttendanceConnectedPacket;
}

function heartbeatPacket(value: Record<string, unknown>): AttendanceHeartbeatPacket | undefined {
  if (
    value.type !== "attendance.realtime.heartbeat"
    || !isNonEmptyString(value.connectionId)
    || !isNonEmptyString(value.accountId)
    || !hasValidTimestamp(value.createdAt)
  ) {
    return undefined;
  }
  return value as AttendanceHeartbeatPacket;
}

function parsePacket(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const value = JSON.parse(data);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function publicSnapshot(state: AttendanceConnectionState): AttendanceRealtimeSnapshot {
  return {
    mode: state.mode,
    isConnected: state.mode === "connected",
  };
}

function sameSnapshot(left: AttendanceRealtimeSnapshot, right: AttendanceRealtimeSnapshot): boolean {
  return left.mode === right.mode && left.isConnected === right.isConnected;
}

export function createAttendanceRealtimeController(
  dependencies: AttendanceRealtimeControllerDependencies,
): AttendanceRealtimeController {
  const random = dependencies.random ?? Math.random;
  const now = dependencies.now ?? Date.now;
  const scheduleTimeout = dependencies.setTimeout ?? globalThis.setTimeout;
  const cancelTimeout = dependencies.clearTimeout ?? globalThis.clearTimeout;
  const subscribers = new Set<() => void>();

  let state = { ...initialAttendanceConnectionState };
  let snapshot = publicSnapshot(state);
  let active = false;
  let disposed = false;
  let socket: AttendanceRealtimeSocket | null = null;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let lastHeartbeatAt = 0;
  let connectionScope: ConnectionScope | null = null;

  const dispatch = (event: Parameters<typeof attendanceConnectionReducer>[1]) => {
    const nextState = attendanceConnectionReducer(state, event);
    if (nextState === state) return;
    state = nextState;
    const nextSnapshot = publicSnapshot(state);
    if (sameSnapshot(snapshot, nextSnapshot)) return;
    snapshot = nextSnapshot;
    for (const subscriber of subscribers) subscriber();
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer === undefined) return;
    cancelTimeout(reconnectTimer);
    reconnectTimer = undefined;
  };

  const clearHeartbeatTimer = () => {
    if (heartbeatTimer === undefined) return;
    cancelTimeout(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  const detachSocket = (target: AttendanceRealtimeSocket) => {
    target.onopen = null;
    target.onmessage = null;
    target.onclose = null;
    target.onerror = null;
  };

  const closeCurrentSocket = () => {
    const current = socket;
    socket = null;
    connectionScope = null;
    clearHeartbeatTimer();
    if (!current) return;
    detachSocket(current);
    current.close();
  };

  const isCurrentGeneration = (target: AttendanceRealtimeSocket, generation: number) =>
    active && socket === target && state.connectionGeneration === generation;

  const scheduleReconnect = () => {
    if (!active || !state.online || reconnectTimer !== undefined || socket) return;
    const attempt = state.reconnectAttempt ?? 0;
    reconnectTimer = scheduleTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, nextReconnectDelay(attempt, random()));
  };

  const failCurrentSocket = (
    target: AttendanceRealtimeSocket,
    generation: number,
    event: "socket.close" | "heartbeat.failed",
  ) => {
    if (!isCurrentGeneration(target, generation)) return;
    socket = null;
    connectionScope = null;
    clearHeartbeatTimer();
    detachSocket(target);
    if (target.readyState < 2) target.close();
    dispatch({ type: event, generation });
    scheduleReconnect();
  };

  const armHeartbeatTimeout = (target: AttendanceRealtimeSocket, generation: number) => {
    clearHeartbeatTimer();
    if (!isCurrentGeneration(target, generation) || !state.visible) return;
    const remaining = Math.max(0, ATTENDANCE_HEARTBEAT_TIMEOUT_MS - (now() - lastHeartbeatAt));
    heartbeatTimer = scheduleTimeout(() => {
      heartbeatTimer = undefined;
      if (!isCurrentGeneration(target, generation) || !state.visible) return;
      if (now() - lastHeartbeatAt >= ATTENDANCE_HEARTBEAT_TIMEOUT_MS) {
        failCurrentSocket(target, generation, "heartbeat.failed");
        return;
      }
      armHeartbeatTimeout(target, generation);
    }, remaining);
  };

  const handlePacket = (
    target: AttendanceRealtimeSocket,
    generation: number,
    data: unknown,
  ) => {
    if (!isCurrentGeneration(target, generation)) return;
    const packet = parsePacket(data);
    if (!packet) return;

    if (packet.type === "attendance.realtime.connected") {
      if (connectionScope) return;
      const acknowledgement = connectedPacket(packet);
      if (!acknowledgement) return;
      connectionScope = {
        connectionId: acknowledgement.connectionId,
        accountId: acknowledgement.accountId,
        userId: acknowledgement.userId,
      };
      lastHeartbeatAt = now();
      dispatch({ type: "socket.healthy", generation });
      armHeartbeatTimeout(target, generation);
      return;
    }

    if (packet.type === "attendance.realtime.heartbeat") {
      const heartbeat = heartbeatPacket(packet);
      if (
        !connectionScope
        || !heartbeat
        || heartbeat.connectionId !== connectionScope.connectionId
        || heartbeat.accountId !== connectionScope.accountId
      ) {
        return;
      }
      lastHeartbeatAt = now();
      dispatch({ type: "socket.healthy", generation });
      armHeartbeatTimeout(target, generation);
      return;
    }

    if (
      !connectionScope
      || !BUSINESS_PACKET_TYPES.has(String(packet.type))
      || packet.accountId !== connectionScope.accountId
    ) {
      return;
    }

    const event = packet as AttendanceRealtimeEvent;
    applyAttendanceRealtimeEvent(dependencies.queryClient, event);
    if (event.type === "attendance.settings.updated") {
      for (const queryKey of SETTINGS_QUERY_KEYS) {
        dependencies.queryClient.invalidateQueries({ queryKey: [queryKey] });
      }
    }
  };

  function connect() {
    if (!active || !state.online || socket) return;
    clearReconnectTimer();
    const generation = state.connectionGeneration + 1;
    dispatch({ type: "socket.connecting", generation });

    let candidate: AttendanceRealtimeSocket;
    try {
      candidate = dependencies.createSocket(realtimeUrl(dependencies.location));
    } catch {
      dispatch({ type: "socket.close", generation });
      scheduleReconnect();
      return;
    }
    socket = candidate;
    connectionScope = null;

    candidate.onopen = () => {
      if (!isCurrentGeneration(candidate, generation)) return;
      dispatch({ type: "socket.open", generation });
      lastHeartbeatAt = now();
      armHeartbeatTimeout(candidate, generation);
    };
    candidate.onmessage = (event) => handlePacket(candidate, generation, event.data);
    candidate.onclose = () => failCurrentSocket(candidate, generation, "socket.close");
    candidate.onerror = () => failCurrentSocket(candidate, generation, "socket.close");
  }

  const onOffline = () => {
    if (!active || !state.online) return;
    clearReconnectTimer();
    closeCurrentSocket();
    dispatch({ type: "network.offline" });
  };

  const onOnline = () => {
    if (!active || state.online || !dependencies.isOnline()) return;
    dispatch({ type: "network.online" });
    connect();
  };

  const onVisibilityChange = () => {
    if (!active) return;
    const visible = dependencies.visibilityState() === "visible";
    dispatch({ type: "visibility.changed", visible });
    if (!visible) {
      clearHeartbeatTimer();
      return;
    }
    if (socket && state.socketOpen) {
      if (now() - lastHeartbeatAt >= ATTENDANCE_HEARTBEAT_TIMEOUT_MS) {
        failCurrentSocket(socket, state.connectionGeneration, "heartbeat.failed");
      } else {
        armHeartbeatTimeout(socket, state.connectionGeneration);
      }
      return;
    }
    if (state.online && !socket) {
      clearReconnectTimer();
      connect();
    }
  };

  return {
    start() {
      if (active || disposed) return;
      active = true;
      dependencies.networkTarget.addEventListener("online", onOnline);
      dependencies.networkTarget.addEventListener("offline", onOffline);
      dependencies.visibilityTarget.addEventListener("visibilitychange", onVisibilityChange);
      dispatch({
        type: "visibility.changed",
        visible: dependencies.visibilityState() === "visible",
      });
      if (!dependencies.isOnline()) {
        dispatch({ type: "network.offline" });
        return;
      }
      connect();
    },

    stop() {
      if (disposed) return;
      disposed = true;
      active = false;
      dependencies.networkTarget.removeEventListener("online", onOnline);
      dependencies.networkTarget.removeEventListener("offline", onOffline);
      dependencies.visibilityTarget.removeEventListener("visibilitychange", onVisibilityChange);
      clearReconnectTimer();
      closeCurrentSocket();
      subscribers.clear();
    },

    reconnectNow() {
      if (!active || !dependencies.isOnline() || (state.mode === "connected" && state.socketOpen)) return;
      clearReconnectTimer();
      closeCurrentSocket();
      dispatch({ type: "reconnect.reset" });
      connect();
    },

    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

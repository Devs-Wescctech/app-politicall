export type AttendanceConnectionMode = "connected" | "reconnecting" | "fallback";

export interface AttendanceConnectionState {
  mode: AttendanceConnectionMode;
  online: boolean;
  visible: boolean;
  reconnectAttempt: number;
  socketOpen: boolean;
  socketPending: boolean;
  connectionGeneration: number;
  stabilityConfirmations: number;
}

export type AttendanceConnectionEvent =
  | { type: "socket.connecting"; generation: number }
  | { type: "socket.open"; generation: number }
  | { type: "socket.close"; generation: number }
  | { type: "socket.healthy"; generation: number }
  | { type: "heartbeat.failed"; generation: number }
  | { type: "network.offline" }
  | { type: "network.online" }
  | { type: "visibility.changed"; visible: boolean }
  | { type: "reconnect.reset" };

export const initialAttendanceConnectionState: AttendanceConnectionState = {
  mode: "reconnecting",
  online: true,
  visible: true,
  reconnectAttempt: 0,
  socketOpen: false,
  socketPending: false,
  connectionGeneration: 0,
  stabilityConfirmations: 0,
};

const MAX_RECONNECT_DELAY_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const REQUIRED_STABILITY_CONFIRMATIONS = 2;

function isCurrentSocketEvent(state: AttendanceConnectionState, generation: number): boolean {
  return state.connectionGeneration === generation;
}

function invalidateSocketGeneration(state: AttendanceConnectionState): number {
  return state.connectionGeneration + 1;
}

export function attendanceConnectionReducer(
  state: AttendanceConnectionState,
  event: AttendanceConnectionEvent,
): AttendanceConnectionState {
  switch (event.type) {
    case "socket.connecting":
      if (!state.online || !Number.isSafeInteger(event.generation) || event.generation <= state.connectionGeneration) {
        return state;
      }
      return {
        ...state,
        mode: "reconnecting",
        connectionGeneration: event.generation,
        socketOpen: false,
        socketPending: true,
        stabilityConfirmations: 0,
      };

    case "socket.open":
      if (!isCurrentSocketEvent(state, event.generation) || !state.online || !state.socketPending) return state;
      return {
        ...state,
        mode: "fallback",
        reconnectAttempt: 0,
        socketOpen: true,
        socketPending: false,
        stabilityConfirmations: 0,
      };

    case "socket.close":
      if (!isCurrentSocketEvent(state, event.generation) || !state.online || (!state.socketPending && !state.socketOpen)) {
        return state;
      }
      return {
        ...state,
        mode: "fallback",
        reconnectAttempt: state.reconnectAttempt + 1,
        socketOpen: false,
        socketPending: false,
        stabilityConfirmations: 0,
      };

    case "heartbeat.failed":
      if (!isCurrentSocketEvent(state, event.generation) || !state.online || !state.socketOpen) return state;
      return {
        ...state,
        mode: "fallback",
        reconnectAttempt: state.reconnectAttempt + 1,
        socketOpen: false,
        socketPending: false,
        stabilityConfirmations: 0,
      };

    case "socket.healthy": {
      if (
        !isCurrentSocketEvent(state, event.generation)
        || !state.online
        || !state.socketOpen
        || state.stabilityConfirmations >= REQUIRED_STABILITY_CONFIRMATIONS
      ) {
        return state;
      }

      const stabilityConfirmations = state.stabilityConfirmations + 1;
      return {
        ...state,
        mode: stabilityConfirmations === REQUIRED_STABILITY_CONFIRMATIONS ? "connected" : "fallback",
        stabilityConfirmations,
      };
    }

    case "network.offline":
      if (!state.online) return state;
      return {
        ...state,
        mode: "fallback",
        online: false,
        socketOpen: false,
        socketPending: false,
        connectionGeneration: invalidateSocketGeneration(state),
        stabilityConfirmations: 0,
      };

    case "network.online":
      if (state.online) return state;
      return {
        ...state,
        mode: "reconnecting",
        online: true,
        socketOpen: false,
        socketPending: false,
        connectionGeneration: invalidateSocketGeneration(state),
        stabilityConfirmations: 0,
      };

    case "visibility.changed":
      return state.visible === event.visible ? state : { ...state, visible: event.visible };

    case "reconnect.reset":
      return {
        ...initialAttendanceConnectionState,
        visible: state.visible,
        connectionGeneration: invalidateSocketGeneration(state),
      };
  }
}

export function nextReconnectDelay(attempt: number, randomSample = Math.random()): number {
  const normalizedAttempt = Number.isFinite(attempt) && attempt >= 0 ? Math.floor(attempt) : 0;
  const normalizedRandomSample = Number.isFinite(randomSample)
    ? Math.min(1, Math.max(0, randomSample))
    : 0;
  const jitterMultiplier = 0.8 + normalizedRandomSample * 0.4;
  const delay = RECONNECT_BASE_DELAY_MS * 2 ** normalizedAttempt * jitterMultiplier;

  return Math.min(MAX_RECONNECT_DELAY_MS, Math.round(delay));
}

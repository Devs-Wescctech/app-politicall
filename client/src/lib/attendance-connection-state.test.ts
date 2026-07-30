import { describe, expect, it } from "vitest";
import {
  attendanceConnectionReducer,
  initialAttendanceConnectionState,
  nextReconnectDelay,
  type AttendanceConnectionState,
} from "./attendance-connection-state";

type SocketEventType = "socket.open" | "socket.close" | "socket.healthy" | "heartbeat.failed";

function startSocketAttempt(state: AttendanceConnectionState): AttendanceConnectionState {
  return attendanceConnectionReducer(state, {
    type: "socket.connecting",
    generation: state.connectionGeneration + 1,
  });
}

function socketEvent(type: SocketEventType, generation: number) {
  return { type, generation } as const;
}

describe("attendanceConnectionReducer", () => {
  it("starts enabled and online in reconnecting mode before the first socket attempt", () => {
    expect(initialAttendanceConnectionState).toEqual({
      mode: "reconnecting",
      online: true,
      visible: true,
      reconnectAttempt: null,
      socketOpen: false,
      socketPending: false,
      connectionGeneration: 0,
      stabilityConfirmations: 0,
    });
  });

  it("keeps HTTP fallback active after a socket opens until it receives two healthy confirmations", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const opened = attendanceConnectionReducer(connecting, socketEvent("socket.open", connecting.connectionGeneration));
    const onceHealthy = attendanceConnectionReducer(opened, socketEvent("socket.healthy", opened.connectionGeneration));
    const recovered = attendanceConnectionReducer(onceHealthy, socketEvent("socket.healthy", onceHealthy.connectionGeneration));

    expect(opened).toMatchObject({
      mode: "fallback",
      socketOpen: true,
      socketPending: false,
      reconnectAttempt: null,
      stabilityConfirmations: 0,
    });
    expect(onceHealthy).toMatchObject({ mode: "fallback", stabilityConfirmations: 1 });
    expect(recovered).toMatchObject({
      mode: "connected",
      socketOpen: true,
      stabilityConfirmations: 2,
    });
  });

  it("activates fallback and backoff when the initial socket closes before open", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const closed = attendanceConnectionReducer(connecting, socketEvent("socket.close", connecting.connectionGeneration));

    expect(closed).toMatchObject({
      mode: "fallback",
      reconnectAttempt: 0,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
    expect(nextReconnectDelay(closed.reconnectAttempt ?? 0, 0.5)).toBe(1_000);
  });

  it("hands off zero-based backoff attempts directly across consecutive failures", () => {
    const firstAttempt = startSocketAttempt(initialAttendanceConnectionState);
    const firstFailure = attendanceConnectionReducer(firstAttempt, socketEvent("socket.close", firstAttempt.connectionGeneration));
    const secondAttempt = startSocketAttempt(firstFailure);
    const secondFailure = attendanceConnectionReducer(secondAttempt, socketEvent("socket.close", secondAttempt.connectionGeneration));
    const thirdAttempt = startSocketAttempt(secondFailure);
    const thirdFailure = attendanceConnectionReducer(thirdAttempt, socketEvent("socket.close", thirdAttempt.connectionGeneration));

    expect(initialAttendanceConnectionState.reconnectAttempt).toBeNull();
    expect(firstFailure.reconnectAttempt).toBe(0);
    expect(nextReconnectDelay(firstFailure.reconnectAttempt ?? 0, 0.5)).toBe(1_000);
    expect(secondFailure.reconnectAttempt).toBe(1);
    expect(nextReconnectDelay(secondFailure.reconnectAttempt ?? 0, 0.5)).toBe(2_000);
    expect(thirdFailure.reconnectAttempt).toBe(2);
    expect(nextReconnectDelay(thirdFailure.reconnectAttempt ?? 0, 0.5)).toBe(4_000);
    expect(nextReconnectDelay(100, 0.5)).toBe(30_000);
  });

  it("falls back and increments only once when a live socket closes", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const opened = attendanceConnectionReducer(connecting, socketEvent("socket.open", connecting.connectionGeneration));
    const closed = attendanceConnectionReducer(opened, socketEvent("socket.close", opened.connectionGeneration));
    const staleClose = attendanceConnectionReducer(closed, socketEvent("socket.close", closed.connectionGeneration));

    expect(closed).toMatchObject({
      mode: "fallback",
      reconnectAttempt: 0,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
    expect(staleClose).toEqual(closed);
  });

  it("treats a heartbeat failure as a failed live connection", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const opened = attendanceConnectionReducer(connecting, socketEvent("socket.open", connecting.connectionGeneration));
    const failed = attendanceConnectionReducer(opened, socketEvent("heartbeat.failed", opened.connectionGeneration));

    expect(failed).toMatchObject({
      mode: "fallback",
      reconnectAttempt: 0,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
  });

  it("resets the stability rule when a socket fails between confirmations", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const opened = attendanceConnectionReducer(connecting, socketEvent("socket.open", connecting.connectionGeneration));
    const onceHealthy = attendanceConnectionReducer(opened, socketEvent("socket.healthy", opened.connectionGeneration));
    const failed = attendanceConnectionReducer(onceHealthy, socketEvent("heartbeat.failed", onceHealthy.connectionGeneration));
    const reconnecting = startSocketAttempt(failed);
    const reopened = attendanceConnectionReducer(reconnecting, socketEvent("socket.open", reconnecting.connectionGeneration));
    const recovered = attendanceConnectionReducer(
      attendanceConnectionReducer(reopened, socketEvent("socket.healthy", reopened.connectionGeneration)),
      socketEvent("socket.healthy", reopened.connectionGeneration),
    );

    expect(failed.stabilityConfirmations).toBe(0);
    expect(reopened.stabilityConfirmations).toBe(0);
    expect(recovered.mode).toBe("connected");
  });

  it("invalidates every callback from a replaced socket generation", () => {
    const firstAttempt = startSocketAttempt(initialAttendanceConnectionState);
    const replacement = startSocketAttempt(firstAttempt);

    expect(replacement.connectionGeneration).toBeGreaterThan(firstAttempt.connectionGeneration);
    expect(attendanceConnectionReducer(replacement, socketEvent("socket.open", firstAttempt.connectionGeneration))).toEqual(replacement);
    expect(attendanceConnectionReducer(replacement, socketEvent("socket.healthy", firstAttempt.connectionGeneration))).toEqual(replacement);
    expect(attendanceConnectionReducer(replacement, socketEvent("socket.close", firstAttempt.connectionGeneration))).toEqual(replacement);
    expect(attendanceConnectionReducer(replacement, socketEvent("heartbeat.failed", firstAttempt.connectionGeneration))).toEqual(replacement);
  });

  it("does not count healthy callbacks from an old generation toward current recovery", () => {
    const firstAttempt = startSocketAttempt(initialAttendanceConnectionState);
    const replacement = startSocketAttempt(firstAttempt);
    const opened = attendanceConnectionReducer(replacement, socketEvent("socket.open", replacement.connectionGeneration));
    const onceHealthy = attendanceConnectionReducer(opened, socketEvent("socket.healthy", opened.connectionGeneration));
    const afterOldHealthy = attendanceConnectionReducer(onceHealthy, socketEvent("socket.healthy", firstAttempt.connectionGeneration));
    const recovered = attendanceConnectionReducer(afterOldHealthy, socketEvent("socket.healthy", opened.connectionGeneration));

    expect(afterOldHealthy).toEqual(onceHealthy);
    expect(recovered).toMatchObject({ mode: "connected", stabilityConfirmations: 2 });
  });

  it("does not let old close or heartbeat callbacks downgrade a connected replacement", () => {
    const firstAttempt = startSocketAttempt(initialAttendanceConnectionState);
    const replacement = startSocketAttempt(firstAttempt);
    const opened = attendanceConnectionReducer(replacement, socketEvent("socket.open", replacement.connectionGeneration));
    const connected = attendanceConnectionReducer(
      attendanceConnectionReducer(opened, socketEvent("socket.healthy", opened.connectionGeneration)),
      socketEvent("socket.healthy", opened.connectionGeneration),
    );

    expect(attendanceConnectionReducer(connected, socketEvent("socket.close", firstAttempt.connectionGeneration))).toEqual(connected);
    expect(attendanceConnectionReducer(connected, socketEvent("heartbeat.failed", firstAttempt.connectionGeneration))).toEqual(connected);
  });

  it("uses fallback while offline and returns online in reconnecting mode without claiming recovery", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const opened = attendanceConnectionReducer(connecting, socketEvent("socket.open", connecting.connectionGeneration));
    const connected = attendanceConnectionReducer(
      attendanceConnectionReducer(opened, socketEvent("socket.healthy", opened.connectionGeneration)),
      socketEvent("socket.healthy", opened.connectionGeneration),
    );
    const offline = attendanceConnectionReducer(connected, { type: "network.offline" });
    const online = attendanceConnectionReducer(offline, { type: "network.online" });

    expect(offline).toMatchObject({
      mode: "fallback",
      online: false,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
    expect(online).toMatchObject({
      mode: "reconnecting",
      online: true,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
  });

  it("invalidates socket callbacks across offline and online transitions", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const offline = attendanceConnectionReducer(connecting, { type: "network.offline" });
    const online = attendanceConnectionReducer(offline, { type: "network.online" });

    expect(offline.connectionGeneration).toBeGreaterThan(connecting.connectionGeneration);
    expect(online.connectionGeneration).toBeGreaterThan(offline.connectionGeneration);
    expect(attendanceConnectionReducer(online, socketEvent("socket.close", connecting.connectionGeneration))).toEqual(online);
    expect(attendanceConnectionReducer(online, socketEvent("heartbeat.failed", connecting.connectionGeneration))).toEqual(online);
  });

  it("invalidates socket callbacks when manually reset", () => {
    const connecting = startSocketAttempt(initialAttendanceConnectionState);
    const reset = attendanceConnectionReducer(connecting, { type: "reconnect.reset" });

    expect(reset).toMatchObject({
      mode: "reconnecting",
      online: true,
      reconnectAttempt: null,
      socketOpen: false,
      socketPending: false,
      stabilityConfirmations: 0,
    });
    expect(reset.connectionGeneration).toBeGreaterThan(connecting.connectionGeneration);
    expect(attendanceConnectionReducer(reset, socketEvent("socket.close", connecting.connectionGeneration))).toEqual(reset);
  });

  it("updates hidden and visible facts without inventing a connection transition", () => {
    const hidden = attendanceConnectionReducer(initialAttendanceConnectionState, {
      type: "visibility.changed",
      visible: false,
    });
    const visible = attendanceConnectionReducer(hidden, { type: "visibility.changed", visible: true });

    expect(hidden).toEqual({ ...initialAttendanceConnectionState, visible: false });
    expect(visible).toEqual(initialAttendanceConnectionState);
  });

  it("does not mutate the prior state", () => {
    const prior = { ...initialAttendanceConnectionState };
    const snapshot = structuredClone(prior);
    const next = startSocketAttempt(prior);

    expect(prior).toEqual(snapshot);
    expect(next).not.toBe(prior);
  });
});

describe("nextReconnectDelay", () => {
  it("uses zero-based exponential backoff with deterministic bounded jitter", () => {
    expect(nextReconnectDelay(0, 0)).toBe(800);
    expect(nextReconnectDelay(0, 0.5)).toBe(1000);
    expect(nextReconnectDelay(0, 1)).toBe(1200);
    expect(nextReconnectDelay(4, 0)).toBe(12_800);
    expect(nextReconnectDelay(4, 1)).toBe(19_200);
  });

  it("caps the jittered delay at thirty seconds", () => {
    expect(nextReconnectDelay(5, 1)).toBe(30_000);
    expect(nextReconnectDelay(6, 0)).toBe(30_000);
    expect(nextReconnectDelay(100, 0.5)).toBe(30_000);
  });

  it("normalizes invalid attempts and random samples to bounded numeric delays", () => {
    expect(nextReconnectDelay(-1, -1)).toBe(800);
    expect(nextReconnectDelay(Number.NaN, Number.NaN)).toBe(800);
    expect(nextReconnectDelay(0, 2)).toBe(1200);
    expect(nextReconnectDelay(Infinity, 0.5)).toBe(1000);
  });
});

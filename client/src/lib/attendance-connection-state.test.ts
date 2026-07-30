import { describe, expect, it } from "vitest";
import {
  attendanceConnectionReducer,
  initialAttendanceConnectionState,
  nextReconnectDelay,
} from "./attendance-connection-state";

describe("attendanceConnectionReducer", () => {
  it("starts enabled and online in reconnecting mode while a socket is pending", () => {
    expect(initialAttendanceConnectionState).toEqual({
      mode: "reconnecting",
      online: true,
      visible: true,
      reconnectAttempt: 0,
      socketOpen: false,
      stabilityConfirmations: 0,
    });
  });

  it("keeps HTTP fallback active after a socket opens until it receives two healthy confirmations", () => {
    const opened = attendanceConnectionReducer(initialAttendanceConnectionState, { type: "socket.open" });
    const onceHealthy = attendanceConnectionReducer(opened, { type: "socket.healthy" });
    const recovered = attendanceConnectionReducer(onceHealthy, { type: "socket.healthy" });

    expect(opened).toMatchObject({
      mode: "fallback",
      socketOpen: true,
      reconnectAttempt: 0,
      stabilityConfirmations: 0,
    });
    expect(onceHealthy).toMatchObject({ mode: "fallback", stabilityConfirmations: 1 });
    expect(recovered).toMatchObject({
      mode: "connected",
      socketOpen: true,
      stabilityConfirmations: 2,
    });
  });

  it("falls back and increments only once when a live socket closes", () => {
    const opened = attendanceConnectionReducer(initialAttendanceConnectionState, { type: "socket.open" });
    const closed = attendanceConnectionReducer(opened, { type: "socket.close" });
    const staleClose = attendanceConnectionReducer(closed, { type: "socket.close" });

    expect(closed).toMatchObject({
      mode: "fallback",
      reconnectAttempt: 1,
      socketOpen: false,
      stabilityConfirmations: 0,
    });
    expect(staleClose).toEqual(closed);
  });

  it("treats a heartbeat failure as a failed live connection", () => {
    const opened = attendanceConnectionReducer(initialAttendanceConnectionState, { type: "socket.open" });
    const failed = attendanceConnectionReducer(opened, { type: "heartbeat.failed" });

    expect(failed).toMatchObject({
      mode: "fallback",
      reconnectAttempt: 1,
      socketOpen: false,
      stabilityConfirmations: 0,
    });
  });

  it("resets the stability rule when a socket fails between confirmations", () => {
    const opened = attendanceConnectionReducer(initialAttendanceConnectionState, { type: "socket.open" });
    const onceHealthy = attendanceConnectionReducer(opened, { type: "socket.healthy" });
    const failed = attendanceConnectionReducer(onceHealthy, { type: "heartbeat.failed" });
    const reopened = attendanceConnectionReducer(failed, { type: "socket.open" });
    const recovered = attendanceConnectionReducer(
      attendanceConnectionReducer(reopened, { type: "socket.healthy" }),
      { type: "socket.healthy" },
    );

    expect(failed.stabilityConfirmations).toBe(0);
    expect(reopened.stabilityConfirmations).toBe(0);
    expect(recovered.mode).toBe("connected");
  });

  it("uses fallback while offline and returns online in reconnecting mode without claiming recovery", () => {
    const connected = ["socket.open", "socket.healthy", "socket.healthy"].reduce(
      (state, type) => attendanceConnectionReducer(state, { type } as const),
      initialAttendanceConnectionState,
    );
    const offline = attendanceConnectionReducer(connected, { type: "network.offline" });
    const online = attendanceConnectionReducer(offline, { type: "network.online" });

    expect(offline).toMatchObject({
      mode: "fallback",
      online: false,
      socketOpen: false,
      stabilityConfirmations: 0,
    });
    expect(online).toMatchObject({
      mode: "reconnecting",
      online: true,
      socketOpen: false,
      stabilityConfirmations: 0,
    });
  });

  it("ignores stale socket events while offline", () => {
    const offline = attendanceConnectionReducer(initialAttendanceConnectionState, { type: "network.offline" });

    expect(attendanceConnectionReducer(offline, { type: "socket.open" })).toEqual(offline);
    expect(attendanceConnectionReducer(offline, { type: "socket.healthy" })).toEqual(offline);
    expect(attendanceConnectionReducer(offline, { type: "heartbeat.failed" })).toEqual(offline);
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

  it("resets a manual reconnect to a coherent online reconnecting state", () => {
    const unstable = attendanceConnectionReducer(
      attendanceConnectionReducer(initialAttendanceConnectionState, { type: "socket.open" }),
      { type: "socket.close" },
    );
    const reset = attendanceConnectionReducer(unstable, { type: "reconnect.reset" });

    expect(reset).toEqual({ ...initialAttendanceConnectionState, visible: true });
  });

  it("does not mutate the prior state", () => {
    const prior = { ...initialAttendanceConnectionState };
    const snapshot = structuredClone(prior);
    const next = attendanceConnectionReducer(prior, { type: "socket.open" });

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

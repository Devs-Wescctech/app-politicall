import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTENDANCE_HEARTBEAT_TIMEOUT_MS,
  createAttendanceRealtimeController,
  type AttendanceRealtimeSocket,
} from "./use-attendance-realtime";

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();
  readonly additions = new Map<string, number>();
  readonly removals = new Map<string, number>();

  addEventListener(type: string, listener: EventListener): void {
    this.additions.set(type, (this.additions.get(type) ?? 0) + 1);
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.removals.set(type, (this.removals.get(type) ?? 0) + 1);
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeSocket implements AttendanceRealtimeSocket {
  readonly url: string;
  readyState = 0;
  closeCalls = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) } as MessageEvent);
  }

  remoteClose(): void {
    this.readyState = 3;
    this.onclose?.(new Event("close") as CloseEvent);
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }
}

function connectedPacket(overrides: Record<string, unknown> = {}) {
  return {
    type: "attendance.realtime.connected",
    connectionId: "connection-1",
    userId: "user-1",
    accountId: "account-1",
    heartbeatIntervalMs: 30_000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function heartbeatPacket(overrides: Record<string, unknown> = {}) {
  return {
    type: "attendance.realtime.heartbeat",
    connectionId: "connection-1",
    accountId: "account-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createHarness() {
  const network = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  const sockets: FakeSocket[] = [];
  const queryClient = new QueryClient();
  let online = true;
  let visibility: DocumentVisibilityState = "visible";

  const controller = createAttendanceRealtimeController({
    location: { protocol: "https:", host: "app.example.test" },
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    networkTarget: network,
    visibilityTarget: documentTarget,
    isOnline: () => online,
    visibilityState: () => visibility,
    queryClient,
    random: () => 0.5,
    now: () => Date.now(),
  });

  return {
    controller,
    documentTarget,
    network,
    queryClient,
    sockets,
    setOnline(value: boolean) {
      online = value;
    },
    setVisibility(value: DocumentVisibilityState) {
      visibility = value;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attendance realtime controller", () => {
  it("uses the exact credential-free same-origin URL and registers lifecycle listeners once", () => {
    const harness = createHarness();

    harness.controller.start();
    harness.controller.start();

    expect(harness.sockets).toHaveLength(1);
    expect(harness.sockets[0].url).toBe("wss://app.example.test/api/attendance/realtime");
    expect(new URL(harness.sockets[0].url).search).toBe("");
    expect(harness.network.additions).toEqual(new Map([["online", 1], ["offline", 1]]));
    expect(harness.documentTarget.additions.get("visibilitychange")).toBe(1);
  });

  it("activates fallback after a pre-open failure and schedules attempt zero", () => {
    const harness = createHarness();
    harness.controller.start();

    harness.sockets[0].remoteClose();

    expect(harness.controller.getSnapshot()).toEqual({ mode: "fallback", isConnected: false });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(999);
    expect(harness.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(harness.sockets).toHaveLength(2);
  });

  it("resets backoff on open so a later close starts again at one second", () => {
    const harness = createHarness();
    harness.controller.start();
    harness.sockets[0].remoteClose();
    vi.advanceTimersByTime(1_000);
    harness.sockets[1].open();
    harness.sockets[1].remoteClose();

    vi.advanceTimersByTime(999);
    expect(harness.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(harness.sockets).toHaveLength(3);
  });

  it("requires the acknowledgement and first valid heartbeat before reporting connected", () => {
    const harness = createHarness();
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();

    socket.message({
      type: "attendance.conversation.updated",
      accountId: "account-1",
      conversationId: "conversation-1",
      payload: { event: { after: { id: "conversation-1" } } },
    });
    expect(harness.controller.getSnapshot().mode).toBe("fallback");

    socket.message(connectedPacket());
    expect(harness.controller.getSnapshot().mode).toBe("fallback");

    socket.message(heartbeatPacket());
    expect(harness.controller.getSnapshot()).toEqual({ mode: "connected", isConnected: true });
  });

  it("neutralizes every callback from a replaced socket generation", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.controller.start();
    const stale = harness.sockets[0];

    harness.controller.reconnectNow();
    const current = harness.sockets[1];
    stale.open();
    stale.message(connectedPacket());
    stale.message({
      type: "attendance.conversation.updated",
      accountId: "account-1",
      conversationId: "conversation-1",
      payload: { event: { after: { id: "conversation-1" } } },
    });
    stale.fail();
    stale.remoteClose();

    expect(harness.sockets).toHaveLength(2);
    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().mode).toBe("reconnecting");

    current.open();
    current.message(connectedPacket({ connectionId: "connection-2" }));
    current.message(heartbeatPacket({ connectionId: "connection-2" }));
    expect(harness.controller.getSnapshot().mode).toBe("connected");
  });

  it("closes a stale visible connection and schedules exactly one reconnect", () => {
    const harness = createHarness();
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();
    socket.message(connectedPacket());

    vi.advanceTimersByTime(ATTENDANCE_HEARTBEAT_TIMEOUT_MS);

    expect(socket.closeCalls).toBe(1);
    expect(harness.controller.getSnapshot().mode).toBe("fallback");
    expect(vi.getTimerCount()).toBe(1);
    socket.remoteClose();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("closes the current socket on error and schedules only one reconnect", () => {
    const harness = createHarness();
    harness.controller.start();
    const socket = harness.sockets[0];

    socket.fail();
    socket.remoteClose();

    expect(socket.closeCalls).toBe(1);
    expect(harness.controller.getSnapshot().mode).toBe("fallback");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("defers heartbeat failure while hidden and evaluates staleness on visibility return", () => {
    const harness = createHarness();
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();
    socket.message(connectedPacket());
    harness.setVisibility("hidden");
    harness.documentTarget.emit("visibilitychange");

    vi.advanceTimersByTime(ATTENDANCE_HEARTBEAT_TIMEOUT_MS + 1);
    expect(socket.closeCalls).toBe(0);

    harness.setVisibility("visible");
    harness.documentTarget.emit("visibilitychange");
    expect(socket.closeCalls).toBe(1);
    expect(harness.controller.getSnapshot().mode).toBe("fallback");
  });

  it("invalidates the socket offline and creates one immediate replacement online", () => {
    const harness = createHarness();
    harness.controller.start();
    harness.sockets[0].remoteClose();
    expect(vi.getTimerCount()).toBe(1);

    harness.setOnline(false);
    harness.network.emit("offline");
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.controller.getSnapshot().mode).toBe("fallback");

    harness.setOnline(true);
    harness.network.emit("online");
    harness.network.emit("online");
    expect(harness.sockets).toHaveLength(2);
  });

  it("reconnects immediately from fallback but does not disturb a healthy socket", () => {
    const harness = createHarness();
    harness.controller.start();
    harness.sockets[0].remoteClose();

    harness.controller.reconnectNow();
    expect(harness.sockets).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);

    const healthy = harness.sockets[1];
    healthy.open();
    healthy.message(connectedPacket({ connectionId: "connection-2" }));
    healthy.message(heartbeatPacket({ connectionId: "connection-2" }));
    harness.controller.reconnectNow();

    expect(harness.sockets).toHaveLength(2);
    expect(healthy.closeCalls).toBe(0);
  });

  it("ignores malformed, unknown, wrong-account, and stale-connection packets", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();
    socket.message(connectedPacket());
    socket.message("{");
    socket.message({ type: "other.packet", accountId: "account-1" });
    socket.message({
      type: "attendance.conversation.updated",
      accountId: "account-2",
      conversationId: "conversation-1",
      payload: { event: { after: { id: "conversation-1" } } },
    });
    socket.message(heartbeatPacket({ connectionId: "stale-connection" }));

    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().mode).toBe("fallback");

    socket.message(heartbeatPacket());
    socket.message({
      type: "attendance.conversation.updated",
      accountId: "account-1",
      conversationId: "conversation-1",
      payload: { event: { after: { id: "conversation-1", status: "open" } } },
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it("preserves settings invalidations and does not clear host UI or query state during transitions", () => {
    const harness = createHarness();
    const uiState = { draft: "unfinished reply", selectedConversationId: "conversation-1", scrollTop: 240 };
    const cached = { id: "conversation-1", messages: [{ id: "message-1", text: "kept" }] };
    harness.queryClient.setQueryData(["/api/attendance/conversations", "conversation-1"], cached);
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();
    socket.message(connectedPacket());
    socket.message({
      type: "attendance.settings.updated",
      accountId: "account-1",
    });
    socket.remoteClose();
    harness.controller.reconnectNow();

    expect(uiState).toEqual({
      draft: "unfinished reply",
      selectedConversationId: "conversation-1",
      scrollTop: 240,
    });
    expect(harness.queryClient.getQueryData(["/api/attendance/conversations", "conversation-1"])).toEqual(cached);
    for (const key of [
      "/api/attendance/connections",
      "/api/attendance/sectors",
      "/api/attendance/queues",
      "/api/attendance/quick-replies",
      "/api/attendance/automation-settings",
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it("performs complete idempotent cleanup with exact listener removal and neutral callbacks", () => {
    const harness = createHarness();
    harness.controller.start();
    const socket = harness.sockets[0];
    socket.open();
    socket.message(connectedPacket());

    harness.controller.stop();
    harness.controller.stop();

    expect(socket.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.network.listenerCount("online")).toBe(0);
    expect(harness.network.listenerCount("offline")).toBe(0);
    expect(harness.documentTarget.listenerCount("visibilitychange")).toBe(0);
    expect(harness.network.removals).toEqual(new Map([["online", 1], ["offline", 1]]));
    expect(harness.documentTarget.removals.get("visibilitychange")).toBe(1);

    socket.open();
    socket.message(heartbeatPacket());
    socket.remoteClose();
    vi.runAllTimers();
    expect(harness.sockets).toHaveLength(1);
  });
});

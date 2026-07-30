import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  conversationPollingInterval,
  createAttendancePollingEnvironment,
  listPollingInterval,
  type AttendancePollingVisibility,
} from "./attendance-polling";

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();
  readonly additions = new Map<string, EventListener[]>();
  readonly removals = new Map<string, EventListener[]>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    this.additions.set(type, [...(this.additions.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
    this.removals.set(type, [...(this.removals.get(type) ?? []), listener]);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createHarness(initial: { online?: boolean; visibility?: AttendancePollingVisibility } = {}) {
  const networkTarget = new FakeEventTarget();
  const visibilityTarget = new FakeEventTarget();
  const queryClient = new QueryClient();
  let online = initial.online ?? true;
  let visibility = initial.visibility ?? "visible";
  const environment = createAttendancePollingEnvironment({
    networkTarget,
    visibilityTarget,
    isOnline: () => online,
    visibilityState: () => visibility,
    queryClient,
  });

  return {
    environment,
    networkTarget,
    queryClient,
    setOnline(value: boolean) {
      online = value;
    },
    setVisibility(value: AttendancePollingVisibility) {
      visibility = value;
    },
    visibilityTarget,
  };
}

describe("attendance polling policy", () => {
  it.each([
    ["connected", "visible", 60_000, 60_000],
    ["fallback", "visible", 5_000, 10_000],
    ["reconnecting", "visible", 5_000, 10_000],
    ["connected", "hidden", 30_000, 30_000],
    ["fallback", "hidden", 30_000, 30_000],
    ["reconnecting", "hidden", 30_000, 30_000],
  ] as const)("uses %ims conversation and %ims list intervals for %s/%s", (mode, visibility, conversation, list) => {
    expect(conversationPollingInterval(mode, visibility)).toBe(conversation);
    expect(listPollingInterval(mode, visibility)).toBe(list);
  });
});

describe("attendance polling environment", () => {
  it("publishes a changed construction-to-start snapshot once without an initial invalidation", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    const subscriber = vi.fn();
    harness.environment.subscribe(subscriber);

    harness.setOnline(false);
    harness.setVisibility("hidden");
    harness.environment.start();
    harness.environment.start();

    expect(harness.environment.getSnapshot()).toEqual({ online: false, visibility: "hidden" });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not duplicate listeners, notifications, or invalidations across repeated start and start-after-stop", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    const subscriber = vi.fn();
    harness.environment.subscribe(subscriber);

    harness.environment.start();
    harness.environment.start();
    harness.environment.stop();
    harness.environment.start();
    harness.environment.start();

    expect(subscriber).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.networkTarget.listenerCount("online")).toBe(1);
    expect(harness.networkTarget.listenerCount("offline")).toBe(1);
    expect(harness.visibilityTarget.listenerCount("visibilitychange")).toBe(1);
    expect(harness.networkTarget.additions.get("online")).toHaveLength(2);
    expect(harness.networkTarget.additions.get("offline")).toHaveLength(2);
    expect(harness.visibilityTarget.additions.get("visibilitychange")).toHaveLength(2);
  });

  it("keeps one active lifecycle and no initial refresh during a Strict Mode style remount", () => {
    const networkTarget = new FakeEventTarget();
    const visibilityTarget = new FakeEventTarget();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const dependencies = {
      networkTarget,
      visibilityTarget,
      isOnline: () => true,
      visibilityState: () => "visible" as const,
      queryClient,
    };
    const first = createAttendancePollingEnvironment(dependencies);
    const firstSubscriber = vi.fn();
    first.subscribe(firstSubscriber);
    first.start();
    first.stop();

    const second = createAttendancePollingEnvironment(dependencies);
    const secondSubscriber = vi.fn();
    second.subscribe(secondSubscriber);
    second.start();

    expect(firstSubscriber).not.toHaveBeenCalled();
    expect(secondSubscriber).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(networkTarget.listenerCount("online")).toBe(1);
    expect(networkTarget.listenerCount("offline")).toBe(1);
    expect(visibilityTarget.listenerCount("visibilitychange")).toBe(1);
  });

  it("captures initial hidden/offline state without invalidating and registers one listener per event", () => {
    const harness = createHarness({ online: false, visibility: "hidden" });
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");

    harness.environment.start();
    harness.environment.start();

    expect(harness.environment.getSnapshot()).toEqual({ online: false, visibility: "hidden" });
    expect(invalidate).not.toHaveBeenCalled();
    expect(harness.networkTarget.listenerCount("online")).toBe(1);
    expect(harness.networkTarget.listenerCount("offline")).toBe(1);
    expect(harness.visibilityTarget.listenerCount("visibilitychange")).toBe(1);
  });

  it("invalidates once for each recovered environment and ignores duplicate events", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.environment.start();

    harness.setOnline(false);
    harness.networkTarget.emit("offline");
    harness.networkTarget.emit("offline");
    harness.setOnline(true);
    harness.networkTarget.emit("online");
    harness.networkTarget.emit("online");

    harness.setVisibility("hidden");
    harness.visibilityTarget.emit("visibilitychange");
    harness.visibilityTarget.emit("visibilitychange");
    harness.setVisibility("visible");
    harness.visibilityTarget.emit("visibilitychange");
    harness.visibilityTarget.emit("visibilitychange");

    expect(harness.environment.getSnapshot()).toEqual({ online: true, visibility: "visible" });
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ["/api/attendance/conversations"] });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ["/api/attendance/conversations"] });
  });

  it("coalesces offline/hidden recovery into one broad invalidation", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.environment.start();

    harness.setOnline(false);
    harness.networkTarget.emit("offline");
    harness.setVisibility("hidden");
    harness.visibilityTarget.emit("visibilitychange");
    harness.setOnline(true);
    harness.networkTarget.emit("online");
    harness.setVisibility("visible");
    harness.visibilityTarget.emit("visibilitychange");

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/attendance/conversations"] });
  });

  it("removes the exact listeners once and ignores events after cleanup", () => {
    const harness = createHarness();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    harness.environment.start();
    harness.environment.stop();
    harness.environment.stop();

    expect(harness.networkTarget.listenerCount("online")).toBe(0);
    expect(harness.networkTarget.listenerCount("offline")).toBe(0);
    expect(harness.visibilityTarget.listenerCount("visibilitychange")).toBe(0);
    expect(harness.networkTarget.removals.get("online")).toEqual(harness.networkTarget.additions.get("online"));
    expect(harness.networkTarget.removals.get("offline")).toEqual(harness.networkTarget.additions.get("offline"));
    expect(harness.visibilityTarget.removals.get("visibilitychange")).toEqual(harness.visibilityTarget.additions.get("visibilitychange"));

    harness.setOnline(false);
    harness.networkTarget.emit("offline");
    harness.setOnline(true);
    harness.networkTarget.emit("online");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

import { useEffect, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AttendanceConnectionMode } from "./attendance-connection-state";
import { queryClient } from "./queryClient";

export type AttendancePollingVisibility = "visible" | "hidden";

export type AttendancePollingEnvironmentSnapshot = {
  online: boolean;
  visibility: AttendancePollingVisibility;
};

type EventTargetLike = Pick<EventTarget, "addEventListener" | "removeEventListener">;

type AttendancePollingEnvironmentDependencies = {
  networkTarget: EventTargetLike;
  visibilityTarget: EventTargetLike;
  isOnline(): boolean;
  visibilityState(): DocumentVisibilityState;
  queryClient: Pick<QueryClient, "invalidateQueries">;
};

export type AttendancePollingEnvironment = {
  start(): void;
  stop(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): AttendancePollingEnvironmentSnapshot;
};

function normalizeVisibility(visibilityState: DocumentVisibilityState): AttendancePollingVisibility {
  return visibilityState === "hidden" ? "hidden" : "visible";
}

function browserSnapshot(): AttendancePollingEnvironmentSnapshot {
  return {
    online: typeof navigator === "undefined" || navigator.onLine,
    visibility: typeof document === "undefined" ? "visible" : normalizeVisibility(document.visibilityState),
  };
}

export function conversationPollingInterval(mode: AttendanceConnectionMode, visibility: AttendancePollingVisibility): number {
  if (visibility === "hidden") return 30_000;
  return mode === "connected" ? 60_000 : 5_000;
}

export function listPollingInterval(mode: AttendanceConnectionMode, visibility: AttendancePollingVisibility): number {
  if (visibility === "hidden") return 30_000;
  return mode === "connected" ? 60_000 : 10_000;
}

export function createAttendancePollingEnvironment(
  dependencies: AttendancePollingEnvironmentDependencies,
): AttendancePollingEnvironment {
  let active = false;
  let snapshot: AttendancePollingEnvironmentSnapshot = {
    online: dependencies.isOnline(),
    visibility: normalizeVisibility(dependencies.visibilityState()),
  };
  let refreshNeeded = !snapshot.online || snapshot.visibility === "hidden";
  const subscribers = new Set<() => void>();

  const notify = () => {
    for (const listener of subscribers) listener();
  };

  const invalidateRecovery = () => {
    if (!refreshNeeded) return;
    refreshNeeded = false;
    dependencies.queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
  };

  const onOffline = () => {
    if (!active || !snapshot.online || dependencies.isOnline()) return;
    snapshot = { ...snapshot, online: false };
    refreshNeeded = true;
    notify();
  };

  const onOnline = () => {
    if (!active || snapshot.online || !dependencies.isOnline()) return;
    snapshot = { ...snapshot, online: true };
    notify();
    invalidateRecovery();
  };

  const onVisibilityChange = () => {
    if (!active) return;
    const visibility = normalizeVisibility(dependencies.visibilityState());
    if (snapshot.visibility === visibility) return;
    snapshot = { ...snapshot, visibility };
    if (visibility === "hidden") refreshNeeded = true;
    notify();
    if (visibility === "visible") invalidateRecovery();
  };

  return {
    start() {
      if (active) return;
      snapshot = {
        online: dependencies.isOnline(),
        visibility: normalizeVisibility(dependencies.visibilityState()),
      };
      refreshNeeded = !snapshot.online || snapshot.visibility === "hidden";
      active = true;
      dependencies.networkTarget.addEventListener("online", onOnline);
      dependencies.networkTarget.addEventListener("offline", onOffline);
      dependencies.visibilityTarget.addEventListener("visibilitychange", onVisibilityChange);
    },

    stop() {
      if (!active) return;
      active = false;
      dependencies.networkTarget.removeEventListener("online", onOnline);
      dependencies.networkTarget.removeEventListener("offline", onOffline);
      dependencies.visibilityTarget.removeEventListener("visibilitychange", onVisibilityChange);
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

export function useAttendancePollingEnvironment(): AttendancePollingEnvironmentSnapshot {
  const [snapshot, setSnapshot] = useState(browserSnapshot);
  const environmentRef = useRef<AttendancePollingEnvironment | null>(null);

  useEffect(() => {
    const environment = createAttendancePollingEnvironment({
      networkTarget: window,
      visibilityTarget: document,
      isOnline: () => navigator.onLine,
      visibilityState: () => document.visibilityState,
      queryClient,
    });
    environmentRef.current = environment;
    const unsubscribe = environment.subscribe(() => setSnapshot(environment.getSnapshot()));
    setSnapshot(environment.getSnapshot());
    environment.start();

    return () => {
      unsubscribe();
      environment.stop();
      if (environmentRef.current === environment) environmentRef.current = null;
    };
  }, []);

  return snapshot;
}

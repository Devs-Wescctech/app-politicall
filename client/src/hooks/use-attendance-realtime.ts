import { useCallback, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import {
  createAttendanceRealtimeController,
  type AttendanceRealtimeController,
  type AttendanceRealtimeSnapshot,
} from "@/lib/attendance-realtime-controller";

export {
  ATTENDANCE_HEARTBEAT_TIMEOUT_MS,
  createAttendanceRealtimeController,
  type AttendanceRealtimeSocket,
} from "@/lib/attendance-realtime-controller";

const INITIAL_SNAPSHOT: AttendanceRealtimeSnapshot = {
  mode: "reconnecting",
  isConnected: false,
};

export function useAttendanceRealtime(enabled = true) {
  const controllerRef = useRef<AttendanceRealtimeController | null>(null);
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(INITIAL_SNAPSHOT);
      return;
    }

    const controller = createAttendanceRealtimeController({
      location: window.location,
      createSocket: (url) => new WebSocket(url),
      networkTarget: window,
      visibilityTarget: document,
      isOnline: () => navigator.onLine,
      visibilityState: () => document.visibilityState,
      queryClient,
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    setSnapshot(controller.getSnapshot());
    controller.start();

    return () => {
      unsubscribe();
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled]);

  const reconnectNow = useCallback(() => {
    controllerRef.current?.reconnectNow();
  }, []);

  return {
    mode: snapshot.mode,
    isConnected: snapshot.isConnected,
    reconnectNow,
  };
}

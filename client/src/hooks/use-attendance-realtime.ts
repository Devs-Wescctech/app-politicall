import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { applyAttendanceRealtimeEvent, type AttendanceRealtimeEvent } from "@/lib/attendance-reconciliation";

function realtimeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/attendance/realtime`;
}

export function useAttendanceRealtime(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    let closedByEffect = false;

    const connect = () => {
      // The auth milestone removes query credentials. The realtime milestone owns
      // same-origin cookie validation and its adaptive HTTP fallback.
      socket = new WebSocket(realtimeUrl());

      socket.onopen = () => {
        retryAttempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as AttendanceRealtimeEvent;
          if (payload.type === "attendance.realtime.connected") return;
          if (payload.type.startsWith("attendance.")) applyAttendanceRealtimeEvent(queryClient, payload);
          if (payload.type === "attendance.settings.updated") {
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/connections"] });
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/sectors"] });
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/queues"] });
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/quick-replies"] });
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/automation-settings"] });
          }
        } catch {
          // Ignore malformed realtime packets; the HTTP cache remains the source of truth.
        }
      };

      socket.onclose = () => {
        if (closedByEffect) return;
        const delay = Math.min(1000 * 2 ** retryAttempt, 30000);
        retryAttempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [enabled]);
}

import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";

type AttendanceRealtimeEvent = {
  type: string;
  accountId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
};

function realtimeUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ token });
  return `${protocol}//${window.location.host}/api/attendance/realtime?${params.toString()}`;
}

function invalidateConversation(event: AttendanceRealtimeEvent) {
  if (event.type === "attendance.message.created" && event.conversationId) {
    const message = (event.payload?.event as any)?.after;
    if (message?.id) {
      queryClient.setQueryData<any>(["/api/attendance/conversations", event.conversationId], (old: any) => {
        if (!old) return old;
        const messages = Array.isArray(old.messages) ? old.messages : [];
        if (messages.some((item: any) => item.id === message.id || item.externalMessageId && item.externalMessageId === message.externalMessageId)) {
          return old;
        }
        return { ...old, messages: [...messages, message] };
      });
    }
  }

  if (event.type === "attendance.conversation.updated" && event.conversationId) {
    const updated = (event.payload?.event as any)?.after;
    if (updated?.id) {
      queryClient.setQueryData<any>(["/api/attendance/conversations", event.conversationId], (old: any) => ({ ...(old ?? {}), ...updated }));
      queryClient.setQueriesData<any[]>({ queryKey: ["/api/attendance/conversations"] }, (old) =>
        Array.isArray(old) ? old.map(item => item.id === updated.id ? { ...item, ...updated } : item) : old
      );
    }
  }

  queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
  queryClient.invalidateQueries({ queryKey: ["/api/attendance/reports/summary"] });

  if (event.conversationId) {
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", event.conversationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", event.conversationId, "history"] });
  }
}

export function useAttendanceRealtime(enabled = true) {
  useEffect(() => {
    const token = getAuthToken();
    if (!enabled || !token) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    let closedByEffect = false;

    const connect = () => {
      socket = new WebSocket(realtimeUrl(token));

      socket.onopen = () => {
        retryAttempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as AttendanceRealtimeEvent;
          if (payload.type === "attendance.realtime.connected") return;
          if (payload.type.startsWith("attendance.")) invalidateConversation(payload);
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

import type { QueryClient } from "@tanstack/react-query";
import type { AttMessage } from "@shared/schema";

export type AttendanceRealtimeEvent = {
  type: string;
  accountId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
};

type MessageRecord = Partial<AttMessage> & Pick<AttMessage, "id">;
type ConversationDetailCache = { messages: AttMessage[]; [key: string]: unknown };

function usableExternalMessageId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;

  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeMetadata(current: unknown, incoming: unknown): unknown {
  if (isRecord(current) && isRecord(incoming)) return { ...current, ...incoming };
  if (isRecord(incoming)) return { ...incoming };
  return incoming;
}

function mergeMessage(current: AttMessage, incoming: MessageRecord): AttMessage {
  const merged: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    if (key !== "metadata" && value !== undefined) merged[key] = value;
  }

  if (incoming.metadata !== undefined) {
    merged.metadata = mergeMetadata(current.metadata, incoming.metadata);
  }

  return merged as AttMessage;
}

function messageMatchIndex(current: readonly AttMessage[], incoming: MessageRecord): number {
  const localIdMatch = current.findIndex(message => message.id === incoming.id);
  if (localIdMatch >= 0) return localIdMatch;

  const externalMessageId = usableExternalMessageId(incoming.externalMessageId);
  if (!externalMessageId) return -1;

  return current.findIndex(message => usableExternalMessageId(message.externalMessageId) === externalMessageId);
}

export function mergeAttendanceMessages(current: readonly AttMessage[], incoming: MessageRecord): AttMessage[] {
  const matchingIndex = messageMatchIndex(current, incoming);
  const reconciled = matchingIndex >= 0
    ? current.map((message, index) => index === matchingIndex ? mergeMessage(message, incoming) : message)
    : [...current, mergeMessage({} as AttMessage, incoming)];

  return reconciled.sort((left, right) => {
    const leftTimestamp = normalizeTimestamp(left.createdAt);
    const rightTimestamp = normalizeTimestamp(right.createdAt);
    if (leftTimestamp < rightTimestamp) return -1;
    if (leftTimestamp > rightTimestamp) return 1;
    return String(left.id).localeCompare(String(right.id));
  });
}

function messageAfterEvent(event: AttendanceRealtimeEvent): MessageRecord | null {
  const after = isRecord(event.payload?.event) ? event.payload.event.after : undefined;
  return isRecord(after) && typeof after.id === "string" && after.id ? after as MessageRecord : null;
}

export function applyAttendanceRealtimeEvent(queryClient: QueryClient, event: AttendanceRealtimeEvent): void {
  if (event.type === "attendance.message.created" && event.conversationId) {
    const message = messageAfterEvent(event);
    if (message) {
      queryClient.setQueryData<ConversationDetailCache>(["/api/attendance/conversations", event.conversationId], old => {
        if (!old || !Array.isArray(old.messages)) return old;
        return { ...old, messages: mergeAttendanceMessages(old.messages, message) };
      });
    }
  }

  if (event.type === "attendance.conversation.updated" && event.conversationId) {
    const updated = isRecord(event.payload?.event) ? event.payload.event.after : undefined;
    if (isRecord(updated) && updated.id) {
      queryClient.setQueryData<Record<string, unknown>>(
        ["/api/attendance/conversations", event.conversationId],
        old => ({ ...(old ?? {}), ...updated }),
      );
      queryClient.setQueriesData<Record<string, unknown>[]>({ queryKey: ["/api/attendance/conversations"] }, old =>
        Array.isArray(old) ? old.map(item => item.id === updated.id ? { ...item, ...updated } : item) : old,
      );
    }
  }

  queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
  queryClient.invalidateQueries({ queryKey: ["/api/attendance/reports/summary"] });

  if (event.conversationId) {
    if (event.type !== "attendance.message.created") {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", event.conversationId] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", event.conversationId, "history"] });
  }
}

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AttMessage } from "@shared/schema";
import { applyAttendanceRealtimeEvent, mergeAttendanceMessages } from "./attendance-reconciliation";

function message(overrides: Partial<AttMessage> = {}): AttMessage {
  return {
    id: "message-1",
    accountId: "account-1",
    conversationId: "conversation-1",
    contactId: null,
    userId: null,
    direction: "outbound",
    channel: "whatsapp",
    provider: "meta",
    externalMessageId: null,
    body: "Hello",
    messageType: "text",
    status: "sent",
    errorMessage: null,
    aiGenerated: false,
    mediaUrl: null,
    mimeType: null,
    metadata: null,
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

describe("mergeAttendanceMessages", () => {
  it("reconciles a duplicate local ID with current delivery fields and merged metadata", () => {
    const current = [message({
      metadata: { optimistic: true, localOnly: "preserved" },
      status: "sent",
      errorMessage: "temporary failure",
    })];
    const incoming = message({
      metadata: { remote: { delivery: "delivered" } },
      status: "delivered",
      errorMessage: null,
      body: undefined,
    });

    expect(mergeAttendanceMessages(current, incoming)).toEqual([
      expect.objectContaining({
        id: "message-1",
        body: "Hello",
        status: "delivered",
        errorMessage: null,
        metadata: {
          optimistic: true,
          localOnly: "preserved",
          remote: { delivery: "delivered" },
        },
      }),
    ]);
  });

  it("uses a non-empty external ID when local IDs differ and adopts the server identity", () => {
    const current = [message({
      id: "optimistic-1",
      externalMessageId: "provider-1",
      metadata: { optimistic: true },
    })];
    const incoming = message({
      id: "server-1",
      externalMessageId: "provider-1",
      status: "read",
      metadata: { deliveredAt: "2026-01-01T10:01:00.000Z" },
    });

    expect(mergeAttendanceMessages(current, incoming)).toEqual([
      expect.objectContaining({
        id: "server-1",
        externalMessageId: "provider-1",
        status: "read",
        metadata: { optimistic: true, deliveredAt: "2026-01-01T10:01:00.000Z" },
      }),
    ]);
  });

  it("does not match records that both lack a usable external ID", () => {
    const current = [message({ id: "optimistic-1", externalMessageId: null })];
    const incoming = message({ id: "server-1", externalMessageId: "  " });

    expect(mergeAttendanceMessages(current, incoming).map(item => item.id)).toEqual([
      "optimistic-1",
      "server-1",
    ]);
  });

  it("does not mutate inputs, normalizes timestamps, and uses ID as a deterministic tie-breaker", () => {
    const current = [
      message({ id: "z", createdAt: "2026-01-01T10:01:00.000Z" as any }),
      message({ id: "b", createdAt: new Date("2026-01-01T10:00:00.000Z") }),
    ];
    const incoming = message({ id: "a", createdAt: Date.parse("2026-01-01T10:00:00.000Z") as any });
    const snapshot = structuredClone(current);

    const merged = mergeAttendanceMessages(current, incoming);

    expect(merged.map(item => item.id)).toEqual(["a", "b", "z"]);
    expect(current).toEqual(snapshot);
    expect(merged).not.toBe(current);
  });

  it("sorts invalid or missing timestamps deterministically and is idempotent", () => {
    const current = [message({ id: "z", createdAt: "invalid" as any })];
    const incoming = message({ id: "a", createdAt: undefined as any });

    const once = mergeAttendanceMessages(current, incoming);
    const twice = mergeAttendanceMessages(once, incoming);

    expect(once.map(item => item.id)).toEqual(["a", "z"]);
    expect(twice).toEqual(once);
  });
});

describe("applyAttendanceRealtimeEvent", () => {
  it("reconciles message-created events in the conversation-detail cache shape", () => {
    const queryClient = new QueryClient();
    const key = ["/api/attendance/conversations", "conversation-1"];
    queryClient.setQueryData(key, {
      id: "conversation-1",
      messages: [message({ id: "optimistic-1", externalMessageId: "provider-1", metadata: { optimistic: true } })],
    });

    applyAttendanceRealtimeEvent(queryClient, {
      type: "attendance.message.created",
      conversationId: "conversation-1",
      payload: {
        event: {
          after: message({ id: "server-1", externalMessageId: "provider-1", status: "delivered", metadata: { remote: true } }),
        },
      },
    });
    applyAttendanceRealtimeEvent(queryClient, {
      type: "attendance.message.created",
      conversationId: "conversation-1",
      payload: {
        event: {
          after: message({ id: "server-1", externalMessageId: "provider-1", status: "delivered", metadata: { remote: true } }),
        },
      },
    });

    expect(queryClient.getQueryData<any>(key)).toEqual(expect.objectContaining({
      messages: [expect.objectContaining({
        id: "server-1",
        status: "delivered",
        metadata: { optimistic: true, remote: true },
      })],
    }));
  });

  it("leaves the detail cache unchanged for malformed or unrelated events", () => {
    const queryClient = new QueryClient();
    const key = ["/api/attendance/conversations", "conversation-1"];
    const cached = { id: "conversation-1", messages: [message()] };
    queryClient.setQueryData(key, cached);

    applyAttendanceRealtimeEvent(queryClient, {
      type: "attendance.message.created",
      conversationId: "conversation-1",
      payload: { event: { after: { status: "delivered" } } },
    });
    applyAttendanceRealtimeEvent(queryClient, { type: "unrelated.event", conversationId: "conversation-1" });

    expect(queryClient.getQueryData(key)).toBe(cached);
  });
});

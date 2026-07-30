import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AttMessage } from "@shared/schema";
import { createAttendanceDetailQueryFn, type AttendanceDetailCache } from "./attendance-detail-cache";

function message(index: number, overrides: Partial<AttMessage> = {}): AttMessage {
  return {
    id: `message-${index}`,
    accountId: "account-1",
    conversationId: "conversation-1",
    contactId: null,
    userId: null,
    direction: "outbound",
    channel: "whatsapp",
    provider: "meta",
    externalMessageId: `provider-${index}`,
    body: `Mensagem ${index}`,
    messageType: "text",
    status: "sent",
    errorMessage: null,
    aiGenerated: false,
    mediaUrl: null,
    mimeType: null,
    metadata: null,
    createdAt: new Date(`2026-01-01T10:${String(index).padStart(2, "0")}:00.000Z`),
    ...overrides,
  };
}

function detail(messages: AttMessage[]): AttendanceDetailCache {
  return {
    id: "conversation-1",
    contactName: "Contato",
    messages,
  } as AttendanceDetailCache;
}

describe("attendance detail cache query policy", () => {
  it("preserves paged history and optimistic messages when a normal detail refetch returns only the newest page", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["/api/attendance/conversations", "conversation-1"] as const;
    const firstPage = Array.from({ length: 100 }, (_, index) => message(index + 1));
    const secondPage = Array.from({ length: 50 }, (_, index) => message(index + 51, index === 49
      ? { id: "server-message-100", externalMessageId: "provider-100", body: "Mensagem 100 atualizada", status: "delivered" }
      : {},
    ));
    const responses = [detail(firstPage), detail(secondPage)];
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: createAttendanceDetailQueryFn(queryClient, queryKey, async () => responses.shift()!),
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();
    queryClient.setQueryData<AttendanceDetailCache>(queryKey, current => ({
      ...current!,
      messages: [...current!.messages, message(101, { id: "optimistic-101", externalMessageId: null, metadata: { optimistic: true } })],
    }));
    await observer.refetch();

    const cached = queryClient.getQueryData<AttendanceDetailCache>(queryKey)!;
    const ids = cached.messages.map(item => item.id);

    expect(cached.messages).toHaveLength(101);
    expect(new Set(ids)).toHaveLength(101);
    expect(cached.messages.filter(item => item.id !== "optimistic-101")).toHaveLength(100);
    expect(cached.messages).toContainEqual(expect.objectContaining({
      id: "server-message-100",
      externalMessageId: "provider-100",
      body: "Mensagem 100 atualizada",
      status: "delivered",
    }));
    expect(cached.messages).toContainEqual(expect.objectContaining({
      id: "optimistic-101",
      metadata: { optimistic: true },
    }));

    unsubscribe();
    queryClient.clear();
  });
});

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connections: new Map<string, any>(),
  createdConversations: [] as any[],
  getChannelConnection: vi.fn(async (id: string) => mocks.connections.get(id) ?? null),
  getChannelConnections: vi.fn(async () => []),
  getConversationByExternal: vi.fn(async () => null),
  createConversation: vi.fn(async (data: Record<string, unknown>) => {
    const conversation = { id: `conversation-${mocks.createdConversations.length + 1}`, mode: "automatic", unreadCount: 0, ...data };
    mocks.createdConversations.push(conversation);
    return conversation;
  }),
  updateConversation: vi.fn(async (_id: string, _accountId: string, data: Record<string, unknown>) => data),
  getMessageByExternalId: vi.fn(async () => null),
  createMessage: vi.fn(async (data: Record<string, unknown>) => ({ id: "message-1", ...data })),
  createAttendanceEvent: vi.fn(async (data: Record<string, unknown>) => ({ id: "event-1", ...data })),
  getIntegrationByAccount: vi.fn(async () => null),
  updateChannelConnection: vi.fn(async (id: string, _accountId: string, patch: Record<string, unknown>) => ({
    ...mocks.connections.get(id),
    ...patch,
  })),
  getChannel: vi.fn(async () => ({ type: 1 })),
  listChats: vi.fn(async () => [{ attendanceId: "thread-1", contact: { number: "5551999999999", name: "Contato" }, status: 1 }]),
}));

vi.mock("./storage", () => ({
  storage: {
    getChannelConnection: mocks.getChannelConnection,
    getChannelConnections: mocks.getChannelConnections,
    getConversationByExternal: mocks.getConversationByExternal,
    createConversation: mocks.createConversation,
    updateConversation: mocks.updateConversation,
    getMessageByExternalId: mocks.getMessageByExternalId,
    createMessage: mocks.createMessage,
    createAttendanceEvent: mocks.createAttendanceEvent,
    getIntegrationByAccount: mocks.getIntegrationByAccount,
    updateChannelConnection: mocks.updateChannelConnection,
  },
}));

vi.mock("./auth", () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.userId = "user-1";
    req.accountId = "account-1";
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
  requireAnyPermission: () => (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("./services/wescctech", () => ({
  wescctech: { getChannel: mocks.getChannel, listChats: mocks.listChats },
  isWesccChannelConnected: vi.fn(),
  mapWesccStatus: vi.fn(() => "automatic"),
  normalizeActionCardTemplate: vi.fn(),
}));

vi.mock("./attendance-events", () => ({ publishAttendanceEvent: vi.fn() }));

import { registerAttendanceRoutes } from "./attendance-routes";

let server: any;

function connection(id: string, phoneNumber: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountId: "account-1",
    name: `WHU ${id}`,
    channel: "whatsapp",
    provider: "wescctech",
    status: "connected",
    token: `token-${id}`,
    metadata: { phoneNumber },
    ...overrides,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  registerAttendanceRoutes(app);
  server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function resetMockImplementations() {
  mocks.getChannelConnection.mockReset();
  mocks.getChannelConnection.mockImplementation(async (id: string) => mocks.connections.get(id) ?? null);
  mocks.getChannelConnections.mockReset();
  mocks.getChannelConnections.mockResolvedValue([]);
  mocks.getConversationByExternal.mockReset();
  mocks.getConversationByExternal.mockResolvedValue(null);
  mocks.createConversation.mockReset();
  mocks.createConversation.mockImplementation(async (data: Record<string, unknown>) => {
    const conversation = { id: `conversation-${mocks.createdConversations.length + 1}`, mode: "automatic", unreadCount: 0, ...data };
    mocks.createdConversations.push(conversation);
    return conversation;
  });
  mocks.updateConversation.mockReset();
  mocks.updateConversation.mockImplementation(async (_id: string, _accountId: string, data: Record<string, unknown>) => data);
  mocks.getMessageByExternalId.mockReset();
  mocks.getMessageByExternalId.mockResolvedValue(null);
  mocks.createMessage.mockReset();
  mocks.createMessage.mockImplementation(async (data: Record<string, unknown>) => ({ id: "message-1", ...data }));
  mocks.createAttendanceEvent.mockReset();
  mocks.createAttendanceEvent.mockImplementation(async (data: Record<string, unknown>) => ({ id: "event-1", ...data }));
  mocks.getIntegrationByAccount.mockReset();
  mocks.getIntegrationByAccount.mockResolvedValue(null);
  mocks.updateChannelConnection.mockReset();
  mocks.updateChannelConnection.mockImplementation(async (id: string, _accountId: string, patch: Record<string, unknown>) => ({
    ...mocks.connections.get(id),
    ...patch,
  }));
  mocks.getChannel.mockReset();
  mocks.getChannel.mockResolvedValue({ type: 1 });
  mocks.listChats.mockReset();
  mocks.listChats.mockResolvedValue([{ attendanceId: "thread-1", contact: { number: "5551999999999", name: "Contato" }, status: 1 }]);
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  server = undefined;
  mocks.connections.clear();
  mocks.createdConversations.length = 0;
  resetMockImplementations();
});

describe("attendance connection routing routes", () => {
  it("creates separate webhook conversations for the same remote thread on two WHU numbers", async () => {
    mocks.connections.set("connection-a", connection("connection-a", "5551999990001"));
    mocks.connections.set("connection-b", connection("connection-b", "5551999990002"));
    const baseUrl = await startServer();

    for (const connectionId of ["connection-a", "connection-b"]) {
      const response = await fetch(`${baseUrl}/api/webhooks/attendance/whatsapp/${connectionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          externalThreadId: "thread-1",
          externalContactId: "5551999999999",
          externalMessageId: `message-${connectionId}`,
          body: "Olá",
        }),
      });
      expect(response.status).toBe(200);
    }

    expect(mocks.getConversationByExternal).toHaveBeenNthCalledWith(1, "account-1", "thread-1", "connection-a");
    expect(mocks.getConversationByExternal).toHaveBeenNthCalledWith(2, "account-1", "thread-1", "connection-b");
    expect(mocks.createConversation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      connectionId: "connection-a",
      inboundConnectionName: "WHU connection-a",
      inboundNumber: "5551999990001",
    }));
    expect(mocks.createConversation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      connectionId: "connection-b",
      inboundConnectionName: "WHU connection-b",
      inboundNumber: "5551999990002",
    }));
  });

  it("recovers a concurrent connection-thread insert by re-reading the exact tenant identity", async () => {
    const recoveredConversation = {
      id: "conversation-recovered",
      accountId: "account-1",
      connectionId: "connection-race",
      externalThreadId: "thread-race",
      mode: "automatic",
      unreadCount: 0,
    };
    mocks.connections.set("connection-race", connection("connection-race", "5551999990006"));
    mocks.getConversationByExternal
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recoveredConversation);
    mocks.createConversation.mockRejectedValueOnce(Object.assign(
      new Error("duplicate connection thread"),
      { code: "23505", constraint: "att_conversations_account_connection_thread_uidx" },
    ));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/webhooks/attendance/whatsapp/connection-race`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        externalThreadId: "thread-race",
        externalContactId: "5551999999999",
        externalMessageId: "message-race",
        body: "Olá",
      }),
    });

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.getConversationByExternal).toHaveBeenNthCalledWith(1, "account-1", "thread-race", "connection-race");
    expect(mocks.getConversationByExternal).toHaveBeenNthCalledWith(2, "account-1", "thread-race", "connection-race");
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conversation-recovered" }));
  });

  it("rejects disabled and non-WHU webhook connections before conversation lookup", async () => {
    mocks.connections.set("connection-disabled", connection("connection-disabled", "5551999990003", { status: "disabled" }));
    mocks.connections.set("connection-sms", connection("connection-sms", "5551999990004", { channel: "sms" }));
    const baseUrl = await startServer();

    const disabled = await fetch(`${baseUrl}/api/webhooks/attendance/whatsapp/connection-disabled`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toEqual({ code: "INBOUND_CONNECTION_DISABLED", error: "Conexão desativada" });

    const unsupported = await fetch(`${baseUrl}/api/webhooks/attendance/sms/connection-sms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({ code: "INBOUND_CONNECTION_UNSUPPORTED", error: "Conexão WHU obrigatória para recebimento" });
    expect(mocks.getConversationByExternal).not.toHaveBeenCalled();
  });

  it("uses the resolved sync connection as the remote thread identity", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 2).toString("base64");
    mocks.connections.set("connection-sync", connection("connection-sync", "5551999990005"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-sync" }),
    });

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.getConversationByExternal).toHaveBeenCalledWith("account-1", "thread-1", "connection-sync");
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: "connection-sync",
      inboundConnectionName: "WHU connection-sync",
      inboundNumber: "5551999990005",
    }));
  });

  it("rejects sync when no attendance connection resolves before listing chats", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-missing" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "ATTENDANCE_CONNECTION_UNAVAILABLE",
      error: "A conexão WHU selecionada não está disponível para esta conta",
    });
    expect(mocks.listChats).not.toHaveBeenCalled();
    expect(mocks.getConversationByExternal).not.toHaveBeenCalled();
  });
});

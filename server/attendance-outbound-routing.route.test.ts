import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connections: new Map<string, any>(),
  conversation: null as any,
  integration: { whatsappToken: "legacy-token" } as any,
  getChannelConnection: vi.fn(async (id: string, accountId?: string) => {
    const connection = mocks.connections.get(id) ?? null;
    return connection && (!accountId || connection.accountId === accountId) ? connection : null;
  }),
  getChannelConnections: vi.fn(async () => []),
  getConversation: vi.fn(async () => mocks.conversation),
  getMessageByExternalId: vi.fn(async () => null),
  getIntegrationByAccount: vi.fn(async () => mocks.integration),
  getContact: vi.fn(async () => null),
  findContactByIdentity: vi.fn(async () => null),
  createContact: vi.fn(async (data: Record<string, unknown>) => ({ id: "contact-created", ...data })),
  getQuickReplies: vi.fn(async () => []),
  getSectors: vi.fn(async () => [{ id: "sector-1" }]),
  createConversation: vi.fn(async (data: Record<string, unknown>) => ({ id: "conversation-created", ...data })),
  createMessage: vi.fn(async (data: Record<string, unknown>) => ({ id: "message-1", ...data })),
  createAttachment: vi.fn(async (data: Record<string, unknown>) => ({ id: "attachment-1", ...data })),
  createAttendanceEvent: vi.fn(async (data: Record<string, unknown>) => ({ id: "event-1", ...data })),
  updateConversation: vi.fn(async (_id: string, _accountId: string, data: Record<string, unknown>) => ({ id: "conversation-1", ...data })),
  createTransfer: vi.fn(async (data: Record<string, unknown>) => ({ id: "transfer-1", ...data })),
  getUser: vi.fn(async () => ({ id: "user-1", accountId: "account-1", name: "Operator" })),
  createChat: vi.fn(async () => ({ id: "thread-created" })),
  getChat: vi.fn(async () => ({ messages: [] })),
  sendText: vi.fn(async () => ({ id: "remote-text" })),
  sendMedia: vi.fn(async () => ({ id: "remote-media" })),
  sendLocation: vi.fn(async () => ({ id: "remote-location" })),
  sendContacts: vi.fn(async () => ({ id: "remote-contacts" })),
  sendActionCard: vi.fn(async () => ({ id: "remote-template" })),
  sendCloudTemplate: vi.fn(async () => ({ id: "remote-template" })),
  sendOfficialTemplate: vi.fn(async () => ({ id: "remote-template" })),
  listActionCardTemplates: vi.fn(async () => []),
  transferChat: vi.fn(async () => undefined),
  finalizeChat: vi.fn(async () => undefined),
}));

vi.mock("./storage", () => ({ storage: {
  getChannelConnection: mocks.getChannelConnection,
  getChannelConnections: mocks.getChannelConnections,
  getConversation: mocks.getConversation,
  getMessageByExternalId: mocks.getMessageByExternalId,
  getIntegrationByAccount: mocks.getIntegrationByAccount,
  getContact: mocks.getContact,
  findContactByIdentity: mocks.findContactByIdentity,
  createContact: mocks.createContact,
  getQuickReplies: mocks.getQuickReplies,
  getSectors: mocks.getSectors,
  createConversation: mocks.createConversation,
  createMessage: mocks.createMessage,
  createAttachment: mocks.createAttachment,
  createAttendanceEvent: mocks.createAttendanceEvent,
  updateConversation: mocks.updateConversation,
  createTransfer: mocks.createTransfer,
  getUser: mocks.getUser,
} }));

vi.mock("./auth", () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.accountId = "account-1";
    req.userId = "user-1";
    req.user = { role: "admin", permissions: {} };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
  requireAnyPermission: () => (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("./services/wescctech", () => ({
  wescctech: {
    createChat: mocks.createChat,
    getChat: mocks.getChat,
    sendText: mocks.sendText,
    sendMedia: mocks.sendMedia,
    sendLocation: mocks.sendLocation,
    sendContacts: mocks.sendContacts,
    sendActionCard: mocks.sendActionCard,
    sendCloudTemplate: mocks.sendCloudTemplate,
    sendOfficialTemplate: mocks.sendOfficialTemplate,
    listActionCardTemplates: mocks.listActionCardTemplates,
    transferChat: mocks.transferChat,
    finalizeChat: mocks.finalizeChat,
  },
  isWesccChannelConnected: vi.fn(),
  mapWesccStatus: vi.fn((status: number) => status === 2 ? "in_progress" : "waiting_agent"),
  normalizeActionCardTemplate: vi.fn(),
}));
vi.mock("./attendance-events", () => ({ publishAttendanceEvent: vi.fn() }));

import { registerAttendanceRoutes } from "./attendance-routes";

let server: any;

function boundConversation(connectionId = "connection-disabled") {
  return {
    id: "conversation-1",
    accountId: "account-1",
    connectionId,
    channel: "whatsapp",
    provider: "wescctech",
    status: "in_progress",
    assignedUserId: "user-1",
    externalContactId: "5551999999999",
    externalThreadId: "thread-1",
    firstResponseAt: null,
  };
}

function connection(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountId: "account-1",
    name: "Gabinete",
    channel: "whatsapp",
    provider: "wescctech",
    status: "connected",
    token: `token-${id}`,
    metadata: { phoneNumber: "5551999990001" },
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

function resetMocks() {
  mocks.connections.clear();
  mocks.conversation = boundConversation();
  mocks.integration = { whatsappToken: "legacy-token" };
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockClear" in mock) (mock as any).mockClear();
  }
  mocks.getChannelConnections.mockResolvedValue([]);
}

beforeEach(resetMocks);
afterEach(async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  if (server) await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  server = undefined;
});

describe("attendance outbound connection routing", () => {
  it("never uses the legacy token for a bound unavailable conversation", async () => {
    mocks.connections.set("connection-disabled", connection("connection-disabled", { status: "disabled" }));
    const baseUrl = await startServer();

    const requests = [
      ["/api/attendance/conversations/conversation-1/send", { message: "Oi" }, mocks.sendText],
      ["/api/attendance/conversations/conversation-1/send-template", { templateName: "Resposta" }, mocks.sendActionCard],
      ["/api/attendance/conversations/conversation-1/send-media", { mediaUrl: "https://example.test/file.pdf", mimeType: "application/pdf" }, mocks.sendMedia],
      ["/api/attendance/conversations/conversation-1/send-location", { description: "Gabinete", latitude: -30, longitude: -51 }, mocks.sendLocation],
      ["/api/attendance/conversations/conversation-1/send-contacts", { contacts: [{ name: "Contato", number: "5551999999999" }] }, mocks.sendContacts],
      ["/api/attendance/conversations/conversation-1/transfer", { sectorId: "sector-1" }, mocks.transferChat],
      ["/api/attendance/conversations/conversation-1/close", {}, mocks.finalizeChat],
    ] as const;

    for (const [path, body, providerAction] of requests) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status, `${path}: ${await response.text()}`).toBe(409);
      expect(providerAction).not.toHaveBeenCalled();
    }
  });

  it("returns the stable connection error instead of synchronizing through a fallback token", async () => {
    mocks.connections.set("connection-disabled", connection("connection-disabled", { status: "disabled" }));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/conversation-1`);

    expect(response.status, await response.text()).toBe(409);
    expect(mocks.getChat).not.toHaveBeenCalled();
  });

  it("rejects a new conversation without a selected sender before database or provider side effects", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "5551999999999", name: "Contato" }),
    });

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload).toEqual(expect.objectContaining({ code: "WHU_CONNECTION_REQUIRED" }));
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("uses and snapshots only the explicitly selected tenant connection for a new conversation", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "5551999999999", name: "Contato", connectionId: "connection-selected" }),
    });

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.createChat).toHaveBeenCalledWith("token-connection-selected", "5551999999999");
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: "connection-selected",
      inboundConnectionName: "Gabinete",
      inboundNumber: "5551999990001",
      externalThreadId: null,
      metadata: expect.objectContaining({ providerCreate: { status: "pending" } }),
    }));
    expect(mocks.createConversation.mock.invocationCallOrder[0]).toBeLessThan(mocks.createChat.mock.invocationCallOrder[0]);
    expect(mocks.updateConversation).toHaveBeenCalledWith("conversation-created", "account-1", expect.objectContaining({
      externalThreadId: "thread-created",
      status: "in_progress",
      metadata: expect.objectContaining({ providerCreate: { status: "created" } }),
    }));
  });

  it("keeps a snapshot-bound local conversation auditable when remote chat creation fails", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    mocks.createChat.mockRejectedValueOnce(new Error("provider unavailable"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "5551999999999", name: "Contato", connectionId: "connection-selected" }),
    });

    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload).toEqual({
      code: "WHU_CREATE_CHAT_FAILED",
      error: "Não foi possível iniciar o atendimento no WHU. A conversa foi salva para auditoria.",
      conversationId: "conversation-1",
    });
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: "connection-selected",
      inboundConnectionName: "Gabinete",
      inboundNumber: "5551999990001",
      externalThreadId: null,
      metadata: expect.objectContaining({ providerCreate: { status: "pending" } }),
    }));
    expect(mocks.createConversation.mock.invocationCallOrder[0]).toBeLessThan(mocks.createChat.mock.invocationCallOrder[0]);
    expect(mocks.updateConversation).toHaveBeenCalledWith("conversation-created", "account-1", expect.objectContaining({
      externalThreadId: null,
      metadata: expect.objectContaining({ providerCreate: { status: "failed", errorCode: "WHU_CREATE_CHAT_FAILED" } }),
    }));
  });

  it("returns the stable provider-create response when contact sync fails after createChat", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    mocks.createChat.mockRejectedValueOnce(new Error("provider unavailable"));
    mocks.createContact.mockRejectedValueOnce(new Error("contact sync unavailable"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "5551999999999",
        name: "Contato",
        connectionId: "connection-selected",
        sendInitialMessage: true,
        message: "Mensagem inicial",
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: "WHU_CREATE_CHAT_FAILED",
      error: "Não foi possível iniciar o atendimento no WHU. A conversa foi salva para auditoria.",
      conversationId: "conversation-1",
    });
    expect(mocks.updateConversation).toHaveBeenCalledWith("conversation-created", "account-1", expect.objectContaining({
      externalThreadId: null,
      metadata: expect.objectContaining({ providerCreate: { status: "failed", errorCode: "WHU_CREATE_CHAT_FAILED" } }),
    }));
    expect(mocks.createAttendanceEvent).toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("returns the stable provider-create response when failure audit logging fails", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    mocks.createChat.mockRejectedValueOnce(new Error("provider unavailable"));
    mocks.createAttendanceEvent.mockRejectedValueOnce(new Error("audit unavailable"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "5551999999999",
        name: "Contato",
        connectionId: "connection-selected",
        sendInitialMessage: true,
        message: "Mensagem inicial",
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: "WHU_CREATE_CHAT_FAILED",
      error: "Não foi possível iniciar o atendimento no WHU. A conversa foi salva para auditoria.",
      conversationId: "conversation-1",
    });
    expect(mocks.updateConversation).toHaveBeenCalledWith("conversation-created", "account-1", expect.objectContaining({
      externalThreadId: null,
      metadata: expect.objectContaining({ providerCreate: { status: "failed", errorCode: "WHU_CREATE_CHAT_FAILED" } }),
    }));
    expect(mocks.createAttendanceEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("does not send an initial message after createChat fails", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    mocks.createChat.mockRejectedValueOnce(new Error("provider unavailable"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "5551999999999",
        name: "Contato",
        connectionId: "connection-selected",
        sendInitialMessage: true,
        message: "Mensagem inicial",
      }),
    });

    const payload = await response.json();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: "connection-selected",
      metadata: expect.objectContaining({ providerCreate: { status: "pending" } }),
    }));
    expect(mocks.updateConversation).toHaveBeenCalledWith("conversation-created", "account-1", expect.objectContaining({
      metadata: expect.objectContaining({ providerCreate: { status: "failed", errorCode: "WHU_CREATE_CHAT_FAILED" } }),
    }));
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.sendActionCard).not.toHaveBeenCalled();
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
    expect(mocks.sendOfficialTemplate).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(payload).toEqual({
      code: "WHU_CREATE_CHAT_FAILED",
      error: "Não foi possível iniciar o atendimento no WHU. A conversa foi salva para auditoria.",
      conversationId: "conversation-1",
    });
  });

  it("does not send a requested template after createChat fails", async () => {
    const selected = connection("connection-selected", {
      metadata: {
        phoneNumber: "5551999990001",
        templates: [{ id: "template-selected", name: "Template selecionado", preview: "Mensagem de template" }],
      },
    });
    mocks.connections.set(selected.id, selected);
    mocks.getChannelConnections.mockResolvedValue([selected]);
    mocks.createChat.mockRejectedValueOnce(new Error("provider unavailable"));
    mocks.updateConversation.mockImplementationOnce(async (_id: string, _accountId: string, data: Record<string, unknown>) => ({
      id: "conversation-created",
      connectionId: selected.id,
      channel: "whatsapp",
      provider: "wescctech",
      externalContactId: "5551999999999",
      firstResponseAt: null,
      ...data,
    }));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "5551999999999",
        name: "Contato",
        connectionId: selected.id,
        templateId: "template-selected",
      }),
    });

    const payload = await response.json();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.sendActionCard).not.toHaveBeenCalled();
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
    expect(mocks.sendOfficialTemplate).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(payload).toEqual({
      code: "WHU_CREATE_CHAT_FAILED",
      error: "Não foi possível iniciar o atendimento no WHU. A conversa foi salva para auditoria.",
      conversationId: "conversation-created",
    });
  });

  it("does not create a remote chat when the local conversation cannot be persisted", async () => {
    mocks.connections.set("connection-selected", connection("connection-selected"));
    mocks.createConversation.mockRejectedValueOnce(new Error("database unavailable"));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "5551999999999", name: "Contato", connectionId: "connection-selected" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("rejects foreign-tenant and malformed-token senders before database or provider side effects", async () => {
    const baseUrl = await startServer();
    mocks.connections.set("connection-foreign", connection("connection-foreign", { accountId: "account-2" }));
    mocks.connections.set("connection-malformed", connection("connection-malformed", { token: "v2:not-a-valid-envelope" }));

    for (const connectionId of ["connection-foreign", "connection-malformed"]) {
      const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "5551999999999", name: "Contato", connectionId }),
      });
      expect(response.status, await response.text()).toBe(400);
    }
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("rejects malformed existing connection identities and permits only explicit null legacy fallback", async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setImmediate(resolve));
    mocks.sendText.mockClear();
    const baseUrl = await startServer();

    for (const conversation of [
      { ...boundConversation(), connectionId: "" },
      (() => { const value = boundConversation(); delete value.connectionId; return value; })(),
    ]) {
      mocks.conversation = conversation;
      const response = await fetch(`${baseUrl}/api/attendance/conversations/conversation-1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Oi" }),
      });
      expect(response.status, await response.text()).toBe(409);
    }
    expect(mocks.sendText).not.toHaveBeenCalled();

    mocks.conversation = { ...boundConversation(), connectionId: null };
    const legacyResponse = await fetch(`${baseUrl}/api/attendance/conversations/conversation-1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Oi" }),
    });
    expect(legacyResponse.status, await legacyResponse.text()).toBe(200);
    expect(mocks.sendText).toHaveBeenCalledWith("legacy-token", expect.objectContaining({ message: "Oi" }));
  });

  it("uses the bound connection's exact token for templates", async () => {
    const bound = connection("connection-bound", {
      metadata: {
        phoneNumber: "5551999990001",
        templates: [{ id: "template-bound", name: "Template vinculado", preview: "Mensagem vinculada" }],
      },
    });
    const supplied = connection("connection-supplied", {
      metadata: {
        phoneNumber: "5551999990002",
        templates: [{ id: "template-supplied", name: "Template alternativo", preview: "Mensagem alternativa" }],
      },
    });
    mocks.connections.set(bound.id, bound);
    mocks.connections.set(supplied.id, supplied);
    mocks.getChannelConnections.mockResolvedValueOnce([bound, supplied]);
    mocks.conversation = boundConversation(bound.id);
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/conversation-1/send-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: "template-bound" }),
    });

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.sendText).toHaveBeenCalledWith("token-connection-bound", {
      number: "5551999999999",
      message: "Template vinculado",
    });
  });

  it("rejects a mismatched supplied template connection without sending through either provider path", async () => {
    const selected = connection("connection-selected", {
      metadata: {
        phoneNumber: "5551999990001",
        templates: [{ id: "template-selected", name: "Template selecionado", preview: "Mensagem de template" }],
      },
    });
    const bound = connection("connection-bound");
    mocks.connections.set(selected.id, selected);
    mocks.connections.set(bound.id, bound);
    mocks.getChannelConnections.mockResolvedValue([selected]);
    mocks.createConversation.mockImplementationOnce(async (data: Record<string, unknown>) => ({
      id: "conversation-created",
      ...data,
      connectionId: bound.id,
    }));
    mocks.updateConversation.mockImplementationOnce(async (_id: string, _accountId: string, data: Record<string, unknown>) => ({
      id: "conversation-created",
      connectionId: bound.id,
      channel: "whatsapp",
      provider: "wescctech",
      externalContactId: "5551999999999",
      firstResponseAt: null,
      ...data,
    }));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/attendance/conversations/create-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "5551999999999",
        name: "Contato",
        connectionId: selected.id,
        templateId: "template-selected",
      }),
    });

    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload).toEqual(expect.objectContaining({ code: "WHU_CONNECTION_UNAVAILABLE" }));
    expect(mocks.createChat).toHaveBeenCalledWith("token-connection-selected", "5551999999999");
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.sendActionCard).not.toHaveBeenCalled();
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
    expect(mocks.sendOfficialTemplate).not.toHaveBeenCalled();
  });
});

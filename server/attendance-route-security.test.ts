import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptApiKey } from "./crypto";

const mocks = vi.hoisted(() => ({
  connection: null as any,
  auditEvents: [] as any[],
  publishedEvents: [] as any[],
  getStatus: vi.fn(async () => ({ status: "CONNECTED" })),
  getChannel: vi.fn(async () => ({ type: 1 })),
  listChatsLite: vi.fn(async () => ({ data: [] })),
  listChats: vi.fn(async () => []),
  findActiveChannelConnectionByPhone: vi.fn(async () => null),
  findActiveChannelConnectionByTokenFingerprint: vi.fn(async () => null),
  channelConnectionHasHistory: vi.fn(async () => false),
  getChannelConnection: vi.fn(async () => mocks.connection),
  getChannelConnections: vi.fn(async () => mocks.connection ? [mocks.connection] : []),
  removeChannelConnection: vi.fn(async () => null as any),
  deleteChannelConnection: vi.fn(async () => undefined),
  updateChannelConnection: vi.fn(async (_id: string, _accountId: string, patch: Record<string, unknown>) => ({ ...mocks.connection, ...patch })),
}));

vi.mock("./storage", () => ({
  storage: {
    getChannelConnection: mocks.getChannelConnection,
    getChannelConnections: mocks.getChannelConnections,
    findActiveChannelConnectionByPhone: mocks.findActiveChannelConnectionByPhone,
    findActiveChannelConnectionByTokenFingerprint: mocks.findActiveChannelConnectionByTokenFingerprint,
    channelConnectionHasHistory: mocks.channelConnectionHasHistory,
    removeChannelConnection: mocks.removeChannelConnection,
    deleteChannelConnection: mocks.deleteChannelConnection,
    updateChannelConnection: mocks.updateChannelConnection,
    createAttendanceEvent: vi.fn(async (event: Record<string, unknown>) => {
      mocks.auditEvents.push(event);
      return event;
    }),
  },
}));

vi.mock("./auth", () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.userId = "user-review";
    req.accountId = "account-review";
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
  requireAnyPermission: () => (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("./services/wescctech", () => ({
  wescctech: {
    getStatus: mocks.getStatus,
    getChannel: mocks.getChannel,
    listChatsLite: mocks.listChatsLite,
    listChats: mocks.listChats,
  },
  isWesccChannelConnected: (value: unknown) => {
    const status = value && typeof value === "object"
      ? (value as { status?: unknown }).status
      : value;
    return String(status ?? "").trim().toUpperCase() === "CONNECTED";
  },
  isWesccChannelRegistered: (value: unknown) => {
    const status = value && typeof value === "object"
      ? (value as { status?: unknown }).status
      : value;
    return String(status ?? "").trim().toUpperCase() === "REGISTERED";
  },
  mapWesccStatus: vi.fn(),
  normalizeActionCardTemplate: vi.fn(),
}));

vi.mock("./attendance-events", () => ({
  publishAttendanceEvent: vi.fn((event: Record<string, unknown>) => mocks.publishedEvents.push(event)),
}));

import { registerAttendanceRoutes } from "./attendance-routes";

let server: any;

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  server = undefined;
  mocks.connection = null;
  mocks.auditEvents.length = 0;
  mocks.publishedEvents.length = 0;
  mocks.getStatus.mockClear();
  mocks.getChannel.mockReset();
  mocks.getChannel.mockResolvedValue({ type: 1 });
  mocks.listChatsLite.mockReset();
  mocks.listChatsLite.mockResolvedValue({ data: [] });
  mocks.listChats.mockReset();
  mocks.listChats.mockResolvedValue([]);
  mocks.findActiveChannelConnectionByPhone.mockReset();
  mocks.findActiveChannelConnectionByPhone.mockResolvedValue(null);
  mocks.findActiveChannelConnectionByTokenFingerprint.mockReset();
  mocks.findActiveChannelConnectionByTokenFingerprint.mockResolvedValue(null);
  mocks.channelConnectionHasHistory.mockReset();
  mocks.channelConnectionHasHistory.mockResolvedValue(false);
  mocks.getChannelConnection.mockReset();
  mocks.getChannelConnection.mockImplementation(async () => mocks.connection);
  mocks.getChannelConnections.mockReset();
  mocks.getChannelConnections.mockImplementation(async () => mocks.connection ? [mocks.connection] : []);
  mocks.removeChannelConnection.mockReset();
  mocks.removeChannelConnection.mockResolvedValue(null);
  mocks.deleteChannelConnection.mockReset();
  mocks.deleteChannelConnection.mockResolvedValue(undefined);
  mocks.updateChannelConnection.mockReset();
  mocks.updateChannelConnection.mockImplementation(async (_id: string, _accountId: string, patch: Record<string, unknown>) => ({ ...mocks.connection, ...patch }));
});

describe("attendance connection test route", () => {
  it("accepts REGISTERED for Cloud via WHU after operational read probes succeed", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "whu-cloud-registered",
      accountId: "account-review",
      name: "Cloud via WHU",
      channel: "whatsapp",
      provider: "wescctech_cloud",
      status: "pending",
      token: encryptApiKey("cloud-token", { table: "channel_connections", field: "token", recordId: "whu-cloud-registered" }),
      metadata: { apiType: "official", official: true },
    };
    mocks.getStatus.mockResolvedValueOnce({ status: "REGISTERED" });

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/whu-cloud-registered/test`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "connected", lastError: null });
    expect(mocks.getChannel).toHaveBeenCalledWith("cloud-token");
    expect(mocks.listChatsLite).toHaveBeenCalledWith("cloud-token", { typeChat: 2, status: 1, page: 0 });
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("whu-cloud-registered", "account-review", expect.objectContaining({
      status: "connected",
      lastError: null,
    }));
  });

  it("does not accept REGISTERED for a normal WHU connection", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "whu-normal-registered",
      accountId: "account-review",
      name: "WHU normal",
      channel: "whatsapp",
      provider: "wescctech",
      status: "pending",
      token: encryptApiKey("normal-token", { table: "channel_connections", field: "token", recordId: "whu-normal-registered" }),
      metadata: { apiType: "whu", official: false },
    };
    mocks.getStatus.mockResolvedValueOnce({ status: "REGISTERED" });

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/whu-normal-registered/test`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "error", lastError: "O provedor informou que o número está desconectado." });
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("whu-normal-registered", "account-review", expect.objectContaining({
      status: "error",
      lastError: "Status remoto: REGISTERED",
    }));
    expect(mocks.getChannel).not.toHaveBeenCalled();
    expect(mocks.listChatsLite).not.toHaveBeenCalled();
  });

  it("keeps Cloud via WHU in error when REGISTERED cannot access the chat module", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "whu-cloud-without-module",
      accountId: "account-review",
      name: "Cloud sem módulo",
      channel: "whatsapp",
      provider: "wescctech_cloud",
      status: "pending",
      token: encryptApiKey("limited-token", { table: "channel_connections", field: "token", recordId: "whu-cloud-without-module" }),
      metadata: { apiType: "official", official: true },
    };
    mocks.getStatus.mockResolvedValueOnce({ status: "REGISTERED" });
    mocks.listChatsLite.mockRejectedValueOnce(new Error('Wescctech 400: {"errorCode":"auth_11"}'));

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/whu-cloud-without-module/test`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "error" });
    expect(body.lastError).toBe("Não foi possível validar a conexão com o provedor.");
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("whu-cloud-without-module", "account-review", expect.objectContaining({
      status: "error",
      lastError: expect.stringContaining("auth_11"),
    }));
  });

  it("keeps an auth_03 token in error", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "whu-missing-channel",
      accountId: "account-review",
      name: "Canal removido",
      channel: "whatsapp",
      provider: "wescctech",
      status: "pending",
      token: encryptApiKey("stale-token", { table: "channel_connections", field: "token", recordId: "whu-missing-channel" }),
      metadata: { apiType: "whu", official: false },
    };
    mocks.getStatus.mockRejectedValueOnce(new Error('Wescctech 400: {"errorCode":"auth_03"}'));

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/whu-missing-channel/test`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "error" });
    expect(body.lastError).toBe("Não foi possível validar a conexão com o provedor.");
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("whu-missing-channel", "account-review", expect.objectContaining({
      status: "error",
      lastError: expect.stringContaining("auth_03"),
    }));
  });

  it("requires an explicit tenant-scoped connection when syncing conversations", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "legacy-implicit-connection",
      accountId: "account-review",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      token: encryptApiKey("legacy-token", { table: "channel_connections", field: "token", recordId: "legacy-implicit-connection" }),
      metadata: { source: "settings-omni" },
    };

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: 0 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "ATTENDANCE_CONNECTION_REQUIRED",
      error: "Selecione uma conexão WHU para sincronizar os atendimentos",
    });
    expect(mocks.getChannelConnections).not.toHaveBeenCalled();
    expect(mocks.getChannel).not.toHaveBeenCalled();
    expect(mocks.listChats).not.toHaveBeenCalled();
  });

  it("does not send a direct Meta connection to WHU conversation sync", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    mocks.connection = {
      id: "direct-meta-connection",
      accountId: "account-review",
      channel: "whatsapp_official",
      provider: "meta_cloud",
      status: "connected",
      token: encryptApiKey("meta-token", { table: "channel_connections", field: "token", recordId: "direct-meta-connection" }),
      metadata: { directMeta: true },
    };

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "direct-meta-connection", page: 0 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "ATTENDANCE_SYNC_UNSUPPORTED",
      error: "Esta conexão recebe mensagens diretamente pela Meta e não usa sincronização WHU",
    });
    expect(mocks.getChannel).not.toHaveBeenCalled();
    expect(mocks.listChats).not.toHaveBeenCalled();
  });

  it("lists an explicit safe webhook setup URL without credential material or raw provider errors", async () => {
    const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = "https://politicall.example";
    mocks.connection = {
      id: "connection-safe-list",
      accountId: "account-review",
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      status: "error",
      phoneNumber: "5551999990000",
      token: "ciphertext-token",
      tokenFingerprint: "fingerprint-secret",
      lastError: "provider timeout token=raw-secret",
      metadata: { webhookSecret: "ciphertext-webhook" },
    };

    try {
      const app = express();
      app.use(express.json());
      registerAttendanceRoutes(app);
      server = await new Promise<any>((resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      });

      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections`);
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body[0]).toMatchObject({
        id: "connection-safe-list",
        hasToken: true,
        lastError: "Não foi possível validar a conexão com o provedor.",
        webhookSetupUrl: "https://politicall.example/api/webhooks/attendance/whatsapp/connection-safe-list",
      });
      expect(body[0]).not.toHaveProperty("tokenFingerprint");
      expect(serialized).not.toMatch(/raw-secret|fingerprint-secret|ciphertext-webhook|ciphertext-token/);
    } finally {
      if (previousPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    }
  });

  it("masks nested webhook credentials from both the HTTP response and emitted audit event", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    const webhookSecret = "route-webhook-secret";
    const encryptedWebhookSecret = encryptApiKey(webhookSecret, {
      table: "channel_connections",
      field: "metadata.webhookSecret",
      recordId: "connection-review",
    });
    mocks.connection = {
      id: "connection-review",
      accountId: "account-review",
      channel: "sms",
      token: encryptApiKey("route-token", { table: "channel_connections", field: "token", recordId: "connection-review" }),
      metadata: { webhookSecret: encryptedWebhookSecret },
    };

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-review/test`, { method: "POST" });
    const responseBody = await response.json();
    const serializedResponse = JSON.stringify(responseBody);
    const serializedAudit = JSON.stringify(mocks.auditEvents[0]);
    const serializedPublished = JSON.stringify(mocks.publishedEvents[0]);

    expect(response.status).toBe(200);
    expect(responseBody.metadata).not.toHaveProperty("webhookSecret");
    expect(serializedResponse).not.toContain(webhookSecret);
    expect(serializedResponse).not.toContain(encryptedWebhookSecret);
    expect(serializedAudit).not.toContain(webhookSecret);
    expect(serializedAudit).not.toContain(encryptedWebhookSecret);
    expect(serializedPublished).not.toContain(webhookSecret);
    expect(serializedPublished).not.toContain(encryptedWebhookSecret);
  });

  it("propagates a global token uniqueness rejection after preparing a retained-token WHU reactivation", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 6).toString("base64");
    const retainedToken = encryptApiKey("duplicate-token", {
      table: "channel_connections",
      field: "token",
      recordId: "connection-disabled",
    });
    const { fingerprintWhuToken } = await import("./services/whu-connection-identity");
    const oldFingerprint = fingerprintWhuToken("duplicate-token");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    mocks.connection = {
      id: "connection-disabled",
      accountId: "account-review",
      channel: "whatsapp",
      provider: "wescctech",
      status: "disabled",
      token: retainedToken,
      tokenFingerprint: oldFingerprint,
      metadata: {},
    };
    const duplicateError = new Error("channel_connections_token_active_uidx");
    mocks.updateChannelConnection.mockRejectedValueOnce(duplicateError);

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-disabled`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "connected", token: "***" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "WHU_DUPLICATE_TOKEN",
      error: "Este token WHU já está em uso.",
    });
    expect(mocks.updateChannelConnection).toHaveBeenCalledTimes(1);
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("connection-disabled", "account-review", expect.objectContaining({
      status: "connected",
      token: retainedToken,
      tokenFingerprint: fingerprintWhuToken("duplicate-token"),
    }));
    expect(mocks.connection.token).toBe(retainedToken);
    expect(mocks.connection.tokenFingerprint).toBe(oldFingerprint);
    expect(mocks.auditEvents).toHaveLength(0);
  });

  it("maps the scoped phone uniqueness constraint without classifying it as a global token duplicate", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    mocks.connection = {
      id: "connection-phone-duplicate",
      accountId: "account-review",
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      phoneNumber: "5551999990000",
      token: encryptApiKey("token", { table: "channel_connections", field: "token", recordId: "connection-phone-duplicate" }),
      tokenFingerprint: "fingerprint",
      metadata: { phoneNumber: "5551999990000" },
    };
    mocks.updateChannelConnection.mockRejectedValueOnce(Object.assign(
      new Error("unique violation"),
      { constraint: "channel_connections_account_phone_active_uidx" },
    ));

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-phone-duplicate`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Novo nome" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "WHU_DUPLICATE_PHONE",
      error: "Já existe uma conexão WHU ativa com este número.",
    });
  });

  it("uses the atomic lifecycle operation to disable a connection with conversation or campaign history", async () => {
    mocks.connection = {
      id: "connection-with-history",
      accountId: "account-review",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      token: "stored-token",
      tokenFingerprint: "stored-fingerprint",
      metadata: {},
    };
    mocks.removeChannelConnection.mockResolvedValue({
      before: mocks.connection,
      connection: { ...mocks.connection, status: "disabled" },
      deleted: false,
    });

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-with-history`, { method: "DELETE" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "disabled", token: "***", hasToken: true });
    expect(body).not.toHaveProperty("tokenFingerprint");
    expect(mocks.removeChannelConnection).toHaveBeenCalledWith("account-review", "connection-with-history");
    expect(mocks.getChannelConnection).not.toHaveBeenCalled();
    expect(mocks.channelConnectionHasHistory).not.toHaveBeenCalled();
    expect(mocks.updateChannelConnection).not.toHaveBeenCalled();
    expect(mocks.deleteChannelConnection).not.toHaveBeenCalled();
  });

  it("uses the atomic lifecycle operation to delete a connection without history", async () => {
    mocks.connection = { id: "connection-without-history", accountId: "account-review", metadata: {} };
    mocks.removeChannelConnection.mockResolvedValue({ before: mocks.connection, connection: null, deleted: true });

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-without-history`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, deleted: true });
    expect(mocks.removeChannelConnection).toHaveBeenCalledWith("account-review", "connection-without-history");
    expect(mocks.getChannelConnection).not.toHaveBeenCalled();
    expect(mocks.channelConnectionHasHistory).not.toHaveBeenCalled();
    expect(mocks.updateChannelConnection).not.toHaveBeenCalled();
    expect(mocks.deleteChannelConnection).not.toHaveBeenCalled();
  });

  it("rejects a disabled connection test without consulting the provider or updating status", async () => {
    mocks.connection = {
      id: "connection-disabled-test",
      accountId: "account-review",
      channel: "whatsapp",
      provider: "wescctech",
      status: "disabled",
      token: "retained-token",
      metadata: {},
    };

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/connections/connection-disabled-test/test`, { method: "POST" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "CHANNEL_CONNECTION_DISABLED" }));
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.updateChannelConnection).not.toHaveBeenCalled();
  });

  it("routes sync provider conversion through secret preparation and derives the current WHU fingerprint", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 6).toString("base64");
    const token = encryptApiKey("sync-token", { table: "channel_connections", field: "token", recordId: "connection-sync" });
    const { fingerprintWhuToken } = await import("./services/whu-connection-identity");
    const oldFingerprint = fingerprintWhuToken("sync-token");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    mocks.connection = {
      id: "connection-sync",
      accountId: "account-review",
      channel: "WhatsApp",
      provider: "other-provider",
      status: "connected",
      token,
      tokenFingerprint: oldFingerprint,
      metadata: {},
    };

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-sync" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateChannelConnection).toHaveBeenCalledWith("connection-sync", "account-review", expect.objectContaining({
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      token,
      tokenFingerprint: fingerprintWhuToken("sync-token"),
    }));
  });

  it("propagates a global uniqueness rejection from sync provider conversion", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 15).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    mocks.connection = {
      id: "connection-sync-duplicate",
      accountId: "account-review",
      channel: "whatsapp",
      provider: "other-provider",
      status: "connected",
      token: encryptApiKey("duplicate-sync-token", { table: "channel_connections", field: "token", recordId: "connection-sync-duplicate" }),
      tokenFingerprint: "old-fingerprint",
      metadata: {},
    };
    const duplicateError = new Error("channel_connections_token_active_uidx");
    mocks.updateChannelConnection.mockRejectedValueOnce(duplicateError);

    const app = express();
    app.use(express.json());
    registerAttendanceRoutes(app);
    server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/attendance/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "connection-sync-duplicate" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: duplicateError.message });
    expect(mocks.updateChannelConnection).toHaveBeenCalledTimes(1);
  });
});

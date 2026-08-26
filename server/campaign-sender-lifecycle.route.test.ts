import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaigns: new Map<string, any>(),
  connections: [] as any[],
  getChannelConnections: vi.fn(async () => mocks.connections),
  getActiveCampaigns: vi.fn(async () => []),
  createCampaign: vi.fn(async (data: Record<string, unknown>) => ({ id: "created-campaign", ...data })),
  updateCampaign: vi.fn(async (id: string, _accountId: string, patch: Record<string, unknown>) => {
    const campaign = { ...mocks.campaigns.get(id), ...patch };
    mocks.campaigns.set(id, campaign);
    return campaign;
  }),
  createCampaignEvent: vi.fn(async () => ({ id: "event-1" })),
  getCampaignRecipients: vi.fn(async () => []),
  updateCampaignRecipient: vi.fn(async () => undefined),
  getContacts: vi.fn(async () => []),
  getIntegration: vi.fn(async () => null),
  sendText: vi.fn(async () => ({ id: "provider-message" })),
}));

vi.mock("./db", () => ({
  db: {
    execute: vi.fn(async () => []),
    insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
  },
  pool: {},
}));

vi.mock("./storage", () => ({ storage: {
  getUserByEmail: vi.fn(async () => null),
  createUser: vi.fn(async () => null),
  getAllParties: vi.fn(async () => []),
  createParty: vi.fn(async () => null),
  getSurveyTemplates: vi.fn(async () => []),
  getUser: vi.fn(async () => null),
  createCampaign: mocks.createCampaign,
  getCampaign: vi.fn(async (id: string) => mocks.campaigns.get(id) ?? null),
  getChannelConnections: mocks.getChannelConnections,
  updateCampaign: mocks.updateCampaign,
  createCampaignEvent: mocks.createCampaignEvent,
  getCampaignRecipients: mocks.getCampaignRecipients,
  updateCampaignRecipient: mocks.updateCampaignRecipient,
  getContacts: mocks.getContacts,
  getIntegration: mocks.getIntegration,
  getActiveCampaigns: mocks.getActiveCampaigns,
} }));

vi.mock("./auth", () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.userId = "user-1";
    req.accountId = "account-1";
    req.user = { role: "admin", permissions: { marketing: true, whatsappBroadcast: true } };
    next();
  },
  authenticateAdminToken: (req: any, _res: any, next: () => void) => {
    req.userId = "user-1";
    req.accountId = "account-1";
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
  requireAnyPermission: () => (_req: any, _res: any, next: () => void) => next(),
  hasActiveGlobalAdminCookie: () => false,
}));

vi.mock("./services/wescctech", () => ({
  wescctech: { sendText: mocks.sendText },
  isWesccChannelConnected: vi.fn(),
  mapWesccStatus: vi.fn(),
  normalizeActionCardTemplate: vi.fn(),
}));

import { registerRoutes } from "./routes";

let server: any;

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    accountId: "account-1",
    userId: "user-1",
    name: "Campanha",
    type: "whatsapp",
    status: "pausada",
    recipients: ["5551999990000"],
    channels: ["whatsapp"],
    sendConfig: { waConnectionId: "sender-1" },
    templateConfig: null,
    ...overrides,
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: "sender-1",
    accountId: "account-1",
    name: "WHU principal",
    channel: "whatsapp",
    provider: "wescctech",
    status: "connected",
    token: "usable-token",
    metadata: { phoneNumber: "5551999990001" },
    ...overrides,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  await registerRoutes(app);
  server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

beforeEach(() => {
  mocks.campaigns.clear();
  mocks.connections = [];
  mocks.updateCampaign.mockClear();
  mocks.getChannelConnections.mockReset();
  mocks.getChannelConnections.mockImplementation(async () => mocks.connections);
  mocks.getActiveCampaigns.mockReset();
  mocks.getActiveCampaigns.mockResolvedValue([]);
  mocks.createCampaign.mockClear();
  mocks.createCampaignEvent.mockClear();
  mocks.getCampaignRecipients.mockClear();
  mocks.updateCampaignRecipient.mockClear();
  mocks.getContacts.mockClear();
  mocks.getIntegration.mockClear();
  mocks.sendText.mockClear();
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  server = undefined;
});

describe("campaign sender lifecycle", () => {
  const campaignPayload = {
    name: "Campanha válida",
    type: "whatsapp",
    message: "Mensagem válida",
    recipients: ["5551999990000"],
    sendConfig: { waConnectionId: "sender-1" },
  };

  it("rejects an unavailable exact sender during campaign creation before persistence", async () => {
    mocks.connections = [connection({ status: "disabled" }), connection({ id: "fallback-2" })];
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(campaignPayload),
    });

    expect(response.status, await response.text()).toBe(400);
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it("preserves the selected sender through valid create, update, and schedule requests", async () => {
    mocks.connections = [connection(), connection({ id: "fallback-2" })];
    mocks.campaigns.set("campaign-1", campaign({ status: "rascunho", message: "Mensagem válida" }));
    const baseUrl = await startServer();

    const created = await fetch(`${baseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(campaignPayload),
    });
    const updated = await fetch(`${baseUrl}/api/campaigns/campaign-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Mensagem atualizada" }),
    });
    const scheduled = await fetch(`${baseUrl}/api/campaigns/campaign-1/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledFor: "2027-01-01T10:00:00.000Z", sendConfig: { batchSize: 20 } }),
    });

    expect(created.status, await created.text()).toBe(200);
    expect(updated.status, await updated.text()).toBe(200);
    expect(scheduled.status, await scheduled.text()).toBe(200);
    expect(mocks.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ sendConfig: { waConnectionId: "sender-1" } }));
    expect(mocks.updateCampaign).toHaveBeenCalledWith("campaign-1", "account-1", expect.objectContaining({ sendConfig: { waConnectionId: "sender-1" } }));
    expect(mocks.updateCampaign).toHaveBeenLastCalledWith("campaign-1", "account-1", expect.objectContaining({
      sendConfig: expect.objectContaining({ waConnectionId: "sender-1", batchSize: 20 }),
    }));
  });

  it("rejects an unavailable exact sender during campaign update and immediate send", async () => {
    mocks.campaigns.set("campaign-1", campaign({ status: "rascunho", message: "Mensagem válida" }));
    mocks.connections = [connection({ status: "disabled" }), connection({ id: "fallback-2" })];
    const baseUrl = await startServer();

    const update = await fetch(`${baseUrl}/api/campaigns/campaign-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Mensagem atualizada" }),
    });
    const send = await fetch(`${baseUrl}/api/campaigns/campaign-1/send`, { method: "POST" });

    expect(update.status, await update.text()).toBe(400);
    expect(send.status, await send.text()).toBe(400);
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
    expect(mocks.createCampaignEvent).not.toHaveBeenCalled();
  });

  it("honors an explicit null templateConfig while changing a campaign to SMS", async () => {
    mocks.campaigns.set("campaign-1", campaign({
      status: "rascunho",
      templateConfig: { waConnectionId: "sender-1", waTemplateName: "legacy-template" },
    }));
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "sms", templateConfig: null }),
    });

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.updateCampaign).toHaveBeenCalledWith("campaign-1", "account-1", expect.objectContaining({
      type: "sms",
      templateConfig: null,
    }));
  });

  it("revalidates the persisted exact sender before resuming and does not change campaign state", async () => {
    mocks.campaigns.set("campaign-1", campaign());
    mocks.connections = [connection({ status: "disabled" }), connection({ id: "fallback-2" })];
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/resume`, { method: "POST" });

    expect(response.status, await response.text()).toBe(400);
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
    expect(mocks.createCampaignEvent).not.toHaveBeenCalled();
  });

  it("rejects a campaign whose saved sender locations disagree instead of choosing one", async () => {
    mocks.campaigns.set("campaign-1", campaign({
      sendConfig: { waConnectionId: "sender-1" },
      templateConfig: { waConnectionId: "fallback-2" },
    }));
    mocks.connections = [connection(), connection({ id: "fallback-2" })];
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/resume`, { method: "POST" });

    expect(response.status, await response.text()).toBe(400);
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
  });

  it("rejects a schedule request that attempts to override the saved sender", async () => {
    mocks.campaigns.set("campaign-1", campaign({ status: "rascunho" }));
    mocks.connections = [connection(), connection({ id: "fallback-2" })];
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledFor: "2027-01-01T10:00:00.000Z", sendConfig: { waConnectionId: "fallback-2" } }),
    });

    expect(response.status, await response.text()).toBe(400);
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
    expect(mocks.createCampaignEvent).not.toHaveBeenCalled();
  });

  it("revalidates the same sender in the background batch after resume and leaves the retry row untouched", async () => {
    mocks.campaigns.set("campaign-1", campaign({ status: "pausada", message: "Mensagem válida" }));
    mocks.getCampaignRecipients.mockResolvedValue([{ id: "recipient-1", accountId: "account-1", campaignId: "campaign-1", channel: "whatsapp", recipient: "5551999990000", status: "pending", attempts: 1 }]);
    mocks.getChannelConnections
      .mockResolvedValueOnce([connection(), connection({ id: "fallback-2" })])
      .mockResolvedValueOnce([connection({ status: "disabled" }), connection({ id: "fallback-2" })]);
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/resume`, { method: "POST" });
    await new Promise(resolve => setImmediate(resolve));

    expect(response.status, await response.text()).toBe(200);
    expect(mocks.getCampaignRecipients).toHaveBeenCalledWith("campaign-1", "account-1");
    expect(mocks.updateCampaignRecipient).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.getChannelConnections).toHaveBeenCalledTimes(3);
  });

  it("aborts a retry when the sender changes between batch start and dispatch", async () => {
    const initial = campaign({ status: "pausada", message: "Mensagem válida" });
    const fresh = { ...initial, status: "em_envio", sendConfig: { waConnectionId: "fallback-2" } };
    mocks.campaigns.set("campaign-1", initial);
    mocks.getCampaignRecipients.mockResolvedValue([{ id: "recipient-1", accountId: "account-1", campaignId: "campaign-1", channel: "whatsapp", recipient: "5551999990000", status: "pending", attempts: 1 }]);
    mocks.getChannelConnections.mockResolvedValue([connection(), connection({ id: "fallback-2", token: "token-fallback" })]);
    const originalGetCampaign = (await import("./storage")).storage.getCampaign as any;
    originalGetCampaign
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, status: "em_envio" })
      .mockResolvedValueOnce(fresh);
    const baseUrl = await startServer();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/resume`, { method: "POST" });
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(response.status, await response.text()).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith("[CAMPAIGN PROCESS] Error:", "campaign-1", "A conexão WhatsApp da campanha mudou durante o envio");
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.updateCampaignRecipient).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("dispatches a successful retry through the persisted sender", async () => {
    mocks.campaigns.set("campaign-1", campaign({ status: "pausada", message: "Mensagem válida" }));
    mocks.connections = [connection({ token: "token-persisted" }), connection({ id: "fallback-2", token: "token-fallback" })];
    mocks.getCampaignRecipients.mockResolvedValue([{ id: "recipient-1", accountId: "account-1", campaignId: "campaign-1", channel: "whatsapp", recipient: "5551999990000", status: "pending", attempts: 1 }]);
    const baseUrl = await startServer();
    const nativeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("api.wescctech.com.br")) return new Response("{}", { status: 200 });
      return nativeFetch(input, init);
    });

    const response = await fetch(`${baseUrl}/api/campaigns/campaign-1/resume`, { method: "POST" });
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(response.status, await response.text()).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wescctech.com.br/core/v2/api/chats/send-text",
      expect.objectContaining({ headers: expect.objectContaining({ "access-token": "token-persisted" }) }),
    );
    expect(mocks.updateCampaignRecipient).toHaveBeenCalledWith("recipient-1", "account-1", expect.objectContaining({ status: "sent", attempts: 2 }));
    fetchSpy.mockRestore();
  });

  it("revalidates the saved sender when the scheduler promotes a due campaign", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    mocks.campaigns.set("campaign-1", campaign({ status: "agendada", scheduledFor: new Date(0), message: "Mensagem válida" }));
    mocks.connections = [connection({ status: "disabled" }), connection({ id: "fallback-2" })];
    mocks.getActiveCampaigns.mockResolvedValue([mocks.campaigns.get("campaign-1")]);
    await startServer();
    const scheduler = setIntervalSpy.mock.calls.find(([, delay]) => delay === 10_000)?.[0] as (() => void) | undefined;

    scheduler?.();
    await new Promise(resolve => setImmediate(resolve));
    setIntervalSpy.mockRestore();

    expect(scheduler).toBeTypeOf("function");
    expect(mocks.updateCampaign).toHaveBeenCalledWith("campaign-1", "account-1", { status: "falhou" });
    expect(mocks.createCampaignEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "failed", fromStatus: "agendada" }));
    expect(mocks.getCampaignRecipients).not.toHaveBeenCalled();
  });
});

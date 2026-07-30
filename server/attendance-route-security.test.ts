import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptApiKey } from "./crypto";

const mocks = vi.hoisted(() => ({
  connection: null as any,
  auditEvents: [] as any[],
  publishedEvents: [] as any[],
  getStatus: vi.fn(async () => ({ status: "CONNECTED" })),
}));

vi.mock("./storage", () => ({
  storage: {
    getChannelConnection: vi.fn(async () => mocks.connection),
    updateChannelConnection: vi.fn(async (_id: string, _accountId: string, patch: Record<string, unknown>) => ({ ...mocks.connection, ...patch })),
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
  wescctech: { getStatus: mocks.getStatus },
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
});

describe("attendance connection test route", () => {
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
    expect(responseBody.metadata.webhookSecret).toBe("***");
    expect(serializedResponse).not.toContain(webhookSecret);
    expect(serializedResponse).not.toContain(encryptedWebhookSecret);
    expect(serializedAudit).not.toContain(webhookSecret);
    expect(serializedAudit).not.toContain(encryptedWebhookSecret);
    expect(serializedPublished).not.toContain(webhookSecret);
    expect(serializedPublished).not.toContain(encryptedWebhookSecret);
  });
});

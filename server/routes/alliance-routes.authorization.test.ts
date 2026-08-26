import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ storage: {} }));

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: mocks.storage }));

import { requirePermission } from "../auth";
import { issueAccessToken } from "../security/auth-cookies";
import { createAuthenticationMiddleware } from "../security/authentication";
import { registerAllianceRoutes } from "./alliance-routes";

const session = {
  id: "session-a",
  principalType: "user" as const,
  principalId: "user-a",
  accountId: "account-a",
  userId: "user-a",
  globalAdminPrincipalId: null,
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
};

describe("alliance line route authorization", () => {
  const originalSecret = process.env.SESSION_SECRET;
  let close: (() => Promise<void>) | undefined;

  beforeEach(() => {
    process.env.SESSION_SECRET = "alliance-line-route-test-secret";
  });

  afterEach(async () => {
    await close?.();
    close = undefined;
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  async function start(alliances: boolean) {
    const lineService = { list: vi.fn(async () => []) };
    const authentication = createAuthenticationMiddleware({
      allowedOrigins: ["https://app.example.test"],
      resolveAccessSession: async ({ sessionId }) => sessionId === session.id ? session : undefined,
      getUser: async () => ({
        id: "user-a", accountId: "account-a", email: "user@example.test", name: "User", role: "assessor",
        permissions: { alliances } as any,
      }),
    });
    const app = express();
    registerAllianceRoutes(app, {
      authenticate: authentication.authenticateUser,
      requireAlliances: requirePermission("alliances"),
      storage: mocks.storage as any,
      lineService: lineService as any,
    });
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return { baseUrl: `http://127.0.0.1:${server.address().port}`, lineService };
  }

  it("returns 401 without an authenticated session", async () => {
    const context = await start(true);

    const response = await fetch(`${context.baseUrl}/api/alliance-lines`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication failed" });
    expect(context.lineService.list).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated user without alliances permission", async () => {
    const context = await start(false);
    const access = issueAccessToken({ sid: session.id, kind: "user" });

    const response = await fetch(`${context.baseUrl}/api/alliance-lines`, {
      headers: { Cookie: `politicall_access=${encodeURIComponent(access)}` },
    });

    expect(response.status).toBe(403);
    expect(context.lineService.list).not.toHaveBeenCalled();
  });
});

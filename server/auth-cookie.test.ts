import express from "express";
import jwt from "jsonwebtoken";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueAccessToken } from "./security/auth-cookies";
import { issueCsrfToken } from "./security/csrf";
import { createAuthenticationMiddleware, isActiveGlobalAdminSession } from "./security/authentication";

const SESSION_SECRET = "task-4-auth-cookie-test-secret";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

function cookie(values: Record<string, string>): string {
  return Object.entries(values).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

function activeUserSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-session",
    principalType: "user",
    principalId: "user-a",
    accountId: "account-a",
    userId: "user-a",
    globalAdminPrincipalId: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

function activeAdminSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-session",
    principalType: "global_admin",
    principalId: "global-admin",
    accountId: null,
    userId: null,
    globalAdminPrincipalId: "global-admin",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

async function startApp(options: {
  sessions?: Record<string, Record<string, unknown> | undefined>;
  user?: Record<string, unknown> | undefined;
  bearer?: boolean;
} = {}): Promise<ServerHandle> {
  const sessions = options.sessions ?? { "user-session": activeUserSession(), "admin-session": activeAdminSession() };
  const middleware = createAuthenticationMiddleware({
    allowedOrigins: ["https://app.example.test"],
    legacyBearerEnabled: () => options.bearer === true,
    resolveAccessSession: async ({ sessionId }) => sessions[sessionId] as any,
    getUser: async () => options.user === undefined ? {
      id: "user-a",
      accountId: "account-a",
      email: "user@example.test",
      name: "User A",
      role: "admin",
      permissions: {},
    } as any : options.user as any,
  });
  const app = express();
  app.get("/user", middleware.authenticateUser, (req: any, res) => res.json({ userId: req.userId, accountId: req.accountId }));
  app.post("/user", middleware.authenticateUser, (_req, res) => res.status(204).end());
  app.get("/admin", middleware.authenticateGlobalAdmin, (req: any, res) => res.json({ accountId: req.accountId ?? null, userId: req.userId ?? null }));
  app.post("/admin", middleware.authenticateGlobalAdmin, (_req, res) => res.status(204).end());
  const server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())),
  };
}

describe("cookie-first browser authentication", () => {
  const originalSecret = process.env.SESSION_SECRET;
  let server: ServerHandle | undefined;

  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    delete process.env.ENABLE_BEARER_AUTH;
  });

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    delete process.env.ENABLE_BEARER_AUTH;
  });

  it("uses an active tenant access cookie and re-reads its authoritative account", async () => {
    server = await startApp();
    const access = issueAccessToken({ sid: "user-session", kind: "user" });
    const response = await fetch(`${server.baseUrl}/user`, { headers: { Cookie: cookie({ politicall_access: access }) } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "user-a", accountId: "account-a" });
  });

  it("rejects wrong-kind, cross-tenant, revoked, expired, and missing cookie sessions generically", async () => {
    const access = issueAccessToken({ sid: "user-session", kind: "user" });
    const wrongKind = issueAccessToken({ sid: "admin-session", kind: "admin" });
    const cases = [
      { access: wrongKind, sessions: { "admin-session": activeAdminSession() }, user: undefined },
      { access, sessions: { "user-session": activeUserSession() }, user: { id: "user-a", accountId: "account-b", email: "x", name: "x", role: "admin", permissions: {} } },
      { access, sessions: { "user-session": activeUserSession({ revokedAt: new Date() }) }, user: undefined },
      { access, sessions: { "user-session": activeUserSession({ expiresAt: new Date(0) }) }, user: undefined },
      { access, sessions: {}, user: undefined },
    ];

    for (const testCase of cases) {
      server = await startApp(testCase);
      const response = await fetch(`${server.baseUrl}/user`, { headers: { Cookie: cookie({ politicall_access: testCase.access }) } });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Authentication failed" });
      await server.close();
      server = undefined;
    }
  });

  it("never downgrades an invalid access cookie to a legacy Bearer token", async () => {
    const legacy = jwt.sign({ userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    server = await startApp({ bearer: true });
    const response = await fetch(`${server.baseUrl}/user`, {
      headers: { Authorization: `Bearer ${legacy}`, Cookie: "politicall_access=invalid" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps legacy Bearer disabled by default, enables only exact historical tenant shapes, and excludes CSRF during transition", async () => {
    const legacy = jwt.sign({ userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    const newSession = issueAccessToken({ sid: "user-session", kind: "user" });
    server = await startApp();
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${legacy}` } })).status).toBe(401);
    await server.close();

    server = await startApp({ bearer: true });
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${legacy}` } })).status).toBe(200);
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${newSession}` } })).status).toBe(401);
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, kind: "user" }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" })}` } })).status).toBe(401);
    expect((await fetch(`${server.baseUrl}/user`, { method: "POST", headers: { Authorization: `Bearer ${legacy}` } })).status).toBe(204);
  });

  it("accepts the exact historical admin and non-admin tenant Bearer shapes", async () => {
    server = await startApp({ bearer: true });
    for (const claims of [
      { role: "admin", isAdmin: true },
      { role: "assessor", isAdmin: false },
    ]) {
      const token = jwt.sign({ userId: "user-a", accountId: "account-a", ...claims }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
      expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    }
  });

  it("rejects every tenant Bearer token outside the exact historical shape", async () => {
    server = await startApp({ bearer: true });
    for (const claims of [
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: false },
      { userId: "user-a", accountId: "account-a", role: "assessor", isAdmin: true },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: "true" },
      { userId: "user-a", accountId: "account-a", role: "unknown", isAdmin: false },
      { userId: "user-a", accountId: "account-a", role: "admin" },
      { userId: "user-a", accountId: "account-a", isAdmin: true },
      { accountId: "account-a", role: "admin", isAdmin: true },
      { userId: "user-a", role: "admin", isAdmin: true },
      { isAdmin: true },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, unknown: "claim" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, sid: 0 },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, kind: false },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, principalId: "user-a" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, principalType: "global_admin" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, globalAdminPrincipalId: "admin" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, globalAdminId: "admin" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, tenantId: "account-a" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, id: "user-a" },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, user: {} },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, account: {} },
      { userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, sub: "user-a" },
    ]) {
      const token = jwt.sign(claims, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
      const response = await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }

    const missingIat = jwt.sign({ userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true, exp: Math.floor(Date.now() / 1000) + 3600 }, SESSION_SECRET, { algorithm: "HS256", noTimestamp: true });
    const missingExp = jwt.sign({ userId: "user-a", accountId: "account-a", role: "admin", isAdmin: true }, SESSION_SECRET, { algorithm: "HS256" });
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${missingIat}` } })).status).toBe(401);
    expect((await fetch(`${server.baseUrl}/user`, { headers: { Authorization: `Bearer ${missingExp}` } })).status).toBe(401);
  });

  it("requires exact Origin and CSRF bound to the active cookie session for tenant mutations", async () => {
    server = await startApp();
    const access = issueAccessToken({ sid: "user-session", kind: "user" });
    const csrf = issueCsrfToken({ sid: "user-session", kind: "user" });
    const cookies = cookie({ politicall_access: access, politicall_csrf: csrf });

    expect((await fetch(`${server.baseUrl}/user`, { method: "POST", headers: { Cookie: cookies } })).status).toBe(403);
    expect((await fetch(`${server.baseUrl}/user`, { method: "POST", headers: { Cookie: cookies, Origin: "https://evil.example.test", "x-csrf-token": csrf } })).status).toBe(403);
    expect((await fetch(`${server.baseUrl}/user`, { method: "POST", headers: { Cookie: cookies, Origin: "https://app.example.test", "x-csrf-token": csrf } })).status).toBe(204);
  });

  it("migrates global-admin cookies and accepts only pure global-admin legacy fallback", async () => {
    const adminAccess = issueAccessToken({ sid: "admin-session", kind: "admin" });
    const adminCsrf = issueCsrfToken({ sid: "admin-session", kind: "admin" });
    server = await startApp({ bearer: true });
    const cookieResponse = await fetch(`${server.baseUrl}/admin`, { headers: { Cookie: cookie({ politicall_admin_access: adminAccess }) } });
    expect(cookieResponse.status).toBe(200);
    expect(await cookieResponse.json()).toEqual({ accountId: null, userId: null });
    expect((await fetch(`${server.baseUrl}/admin`, {
      method: "POST",
      headers: { Origin: "https://app.example.test", "x-csrf-token": adminCsrf, Cookie: cookie({ politicall_admin_access: adminAccess, politicall_admin_csrf: adminCsrf }) },
    })).status).toBe(204);

    const pure = jwt.sign({ isAdmin: true }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    const crossKind = jwt.sign({ isAdmin: true, userId: "user-a", accountId: "account-a" }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    expect((await fetch(`${server.baseUrl}/admin`, { headers: { Authorization: `Bearer ${pure}` } })).status).toBe(200);
    expect((await fetch(`${server.baseUrl}/admin`, { headers: { Authorization: `Bearer ${crossKind}` } })).status).toBe(401);
  });

  it("rejects the complete global-admin invalid cookie and CSRF matrix without Bearer downgrade", async () => {
    const pure = jwt.sign({ isAdmin: true }, SESSION_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    const wrongKind = issueAccessToken({ sid: "user-session", kind: "user" });
    for (const sessions of [
      { "admin-session": activeAdminSession({ revokedAt: new Date() }) },
      { "admin-session": activeAdminSession({ expiresAt: new Date(0) }) },
      {},
    ]) {
      server = await startApp({ sessions, bearer: true });
      const access = issueAccessToken({ sid: "admin-session", kind: "admin" });
      const response = await fetch(`${server.baseUrl}/admin`, { headers: { Cookie: cookie({ politicall_admin_access: access }), Authorization: `Bearer ${pure}` } });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await server.close();
      server = undefined;
    }
    server = await startApp({ bearer: true });
    expect((await fetch(`${server.baseUrl}/admin`, { headers: { Cookie: cookie({ politicall_admin_access: wrongKind }) } })).status).toBe(401);
    expect((await fetch(`${server.baseUrl}/admin`, { headers: { Cookie: "politicall_admin_access=broken", Authorization: `Bearer ${pure}` } })).status).toBe(401);
    await server.close();
    server = await startApp();
    expect((await fetch(`${server.baseUrl}/admin`, { headers: { Authorization: `Bearer ${pure}` } })).status).toBe(401);
    const access = issueAccessToken({ sid: "admin-session", kind: "admin" });
    const csrf = issueCsrfToken({ sid: "admin-session", kind: "admin" });
    const cookies = cookie({ politicall_admin_access: access, politicall_admin_csrf: csrf });
    expect((await fetch(`${server.baseUrl}/admin`, { method: "POST", headers: { Cookie: cookies, Origin: "https://app.example.test" } })).status).toBe(403);
    expect((await fetch(`${server.baseUrl}/admin`, { method: "POST", headers: { Cookie: cookies, "x-csrf-token": csrf } })).status).toBe(403);
    expect((await fetch(`${server.baseUrl}/admin`, { method: "POST", headers: { Cookie: cookies, Origin: "https://bad.example.test", "x-csrf-token": csrf } })).status).toBe(403);
  });

  it("removes X-Admin-Token authority from profile password changes and routes", async () => {
    const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
    const serverSources = await Promise.all(["auth.ts", "routes.ts", "security/authentication.ts"].map((file) => readFile(new URL(`./${file}`, import.meta.url), "utf8")));
    expect(routes).not.toContain("x-admin-token");
    expect(routes).not.toContain("jwt.verify(adminToken");
    expect(routes).toContain("Senha atual é obrigatória para alterar a senha");
    expect(serverSources.join("\n").toLowerCase()).not.toContain("x-admin-token");
    expect(routes).not.toContain("function authenticateAdminToken");
  });

  it("accepts an impersonation password bypass only for an active, structurally valid global-admin session", () => {
    expect(isActiveGlobalAdminSession(activeAdminSession() as any)).toBe(true);
    for (const session of [
      activeAdminSession({ revokedAt: new Date() }),
      activeAdminSession({ expiresAt: new Date(0) }),
      activeAdminSession({ accountId: "account-a" }),
      activeAdminSession({ userId: "user-a" }),
      activeAdminSession({ principalId: "different" }),
      activeAdminSession({ globalAdminPrincipalId: null }),
      activeUserSession(),
      undefined,
    ]) expect(isActiveGlobalAdminSession(session as any)).toBe(false);
  });
});

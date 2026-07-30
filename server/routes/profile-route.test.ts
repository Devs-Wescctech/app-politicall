import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueAccessToken, readAccessToken } from "../security/auth-cookies";
import { isActiveGlobalAdminSession } from "../security/authentication";
import { issueCsrfToken } from "../security/csrf";
import { createAuthenticationMiddleware } from "../security/authentication";
import { registerProfileRoute } from "./profile-route";

const SECRET = "task-6-profile-route-secret";
const userSession = { id: "user-session", principalType: "user", principalId: "user-a", accountId: "account-a", userId: "user-a", globalAdminPrincipalId: null, expiresAt: new Date(Date.now() + 60_000), revokedAt: null };
const adminSession = { id: "admin-session", principalType: "global_admin", principalId: "global-admin", accountId: null, userId: null, globalAdminPrincipalId: "global-admin", expiresAt: new Date(Date.now() + 60_000), revokedAt: null };
const cookie = (values: Record<string, string>) => Object.entries(values).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ");

describe("profile password impersonation route", () => {
  const originalSecret = process.env.SESSION_SECRET;
  let close: (() => Promise<void>) | undefined;
  beforeEach(() => { process.env.SESSION_SECRET = SECRET; });
  afterEach(async () => { await close?.(); close = undefined; if (originalSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = originalSecret; });

  it("accepts coexisting valid cookies only for an admin tenant target, revokes tenant sessions, and preserves admin cookies", async () => {
    const sessions: Record<string, any> = { "user-session": userSession, "admin-session": adminSession };
    let tenantRole = "admin";
    let storedRole = "admin";
    const middleware = createAuthenticationMiddleware({ allowedOrigins: ["https://app.example.test"], resolveAccessSession: async ({ sessionId }) => sessions[sessionId], getUser: async () => ({ id: "user-a", accountId: "account-a", email: "u@example.test", name: "User", role: tenantRole, permissions: {} }) });
    const changePassword = vi.fn(async () => ({ id: "user-a", accountId: "account-a", password: "new", name: "User" }));
    const app = express(); app.use(express.json());
    registerProfileRoute(app, { authenticateToken: middleware.authenticateUser, getUser: async () => ({ id: "user-a", accountId: "account-a", password: "old", role: storedRole }), updateUser: vi.fn(), changePassword, hasActiveGlobalAdminCookie: async (request) => {
      const access = readAccessToken(request, "admin");
      return isActiveGlobalAdminSession(access ? sessions[access.sid] : undefined);
    } });
    const server = await new Promise<any>((resolve) => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    const csrf = issueCsrfToken({ sid: "user-session", kind: "user" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/profile`, { method: "PATCH", headers: { Origin: "https://app.example.test", "content-type": "application/json", "x-csrf-token": csrf, Cookie: cookie({ politicall_access: issueAccessToken({ sid: "user-session", kind: "user" }), politicall_csrf: csrf, politicall_admin_access: issueAccessToken({ sid: "admin-session", kind: "admin" }) }) }, body: JSON.stringify({ newPassword: "new-password" }) });
    expect(response.status).toBe(200);
    expect(changePassword).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).not.toContain("politicall_admin_access");

    const request = (adminCookie?: string) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/profile`, { method: "PATCH", headers: { Origin: "https://app.example.test", "content-type": "application/json", "x-csrf-token": csrf, Cookie: cookie({ politicall_access: issueAccessToken({ sid: "user-session", kind: "user" }), politicall_csrf: csrf, ...(adminCookie ? { politicall_admin_access: adminCookie } : {}) }) }, body: JSON.stringify({ newPassword: "new-password" }) });
    for (const invalid of [undefined, "malformed", issueAccessToken({ sid: "user-session", kind: "user" })]) {
      expect((await request(invalid)).status).toBe(400);
    }
    sessions["admin-session"] = { ...adminSession, revokedAt: new Date() };
    expect((await request(issueAccessToken({ sid: "admin-session", kind: "admin" }))).status).toBe(400);
    sessions["admin-session"] = { ...adminSession, expiresAt: new Date(0) };
    expect((await request(issueAccessToken({ sid: "admin-session", kind: "admin" }))).status).toBe(400);
    sessions["admin-session"] = adminSession;
    tenantRole = "assessor";
    expect((await request(issueAccessToken({ sid: "admin-session", kind: "admin" }))).status).toBe(400);
    tenantRole = "admin";
    storedRole = "assessor";
    expect((await request(issueAccessToken({ sid: "admin-session", kind: "admin" }))).status).toBe(400);
    expect(changePassword).toHaveBeenCalledOnce();
  });
});

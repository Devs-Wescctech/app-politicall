import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthenticationRateLimiter, getAuthAllowedOrigins, registerAuthSessionRoutes, sendAuthSessionResponse } from "./auth-session-routes";
import { issueAccessToken } from "../security/auth-cookies";
import { issueCsrfToken } from "../security/csrf";

const sessionSecret = "route-test-session-secret";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

async function startAuthRoutes(dependencies: any): Promise<ServerHandle> {
  const app = express();
  app.set("trust proxy", true);
  registerAuthSessionRoutes(app, dependencies);
  const server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())),
  };
}

function cookieHeader(values: Record<string, string>): string {
  return Object.entries(values).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

function session(id: string, state: "active" | "expired" | "revoked" = "active") {
  return {
    id,
    expiresAt: state === "expired" ? new Date("2020-01-01T00:00:00.000Z") : new Date("2030-01-01T00:00:00.000Z"),
    revokedAt: state === "revoked" ? new Date("2029-01-01T00:00:00.000Z") : null,
  };
}

function routeDependencies(overrides: Record<string, unknown> = {}) {
  return {
    allowedOrigins: ["https://app.example.test"],
    service: {
      refresh: vi.fn(async () => ({ status: "refreshed", user: { id: "user-a" }, cookies: { kind: "user", accessToken: "access", refreshToken: "refresh-next", csrfToken: "csrf-next", refreshMaxAgeMs: 1000 } })),
      logoutAccess: vi.fn(async () => ({ clearCookies: "user" })),
      logoutRefresh: vi.fn(async () => ({ clearCookies: "user" })),
      exchangeLegacyBearer: vi.fn(async () => ({ status: "invalid" })),
    },
    resolveRefreshSession: vi.fn(async () => session("refresh-session")),
    resolveAccessSession: vi.fn(async () => session("access-session")),
    ...overrides,
  };
}

describe("auth session route responses", () => {
  const originalSecret = process.env.SESSION_SECRET;
  let activeServer: ServerHandle | undefined;

  beforeEach(() => {
    process.env.SESSION_SECRET = sessionSecret;
    createAuthenticationRateLimiter.resetForTests();
  });

  afterEach(async () => {
    if (activeServer) await activeServer.close();
    activeServer = undefined;
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  it("serializes only public user data after setting internal cookie credentials", () => {
    const response = {
      set: vi.fn(),
      cookie: vi.fn(),
      json: vi.fn(),
    };

    sendAuthSessionResponse(response as any, {
      user: { id: "user-a", email: "user@example.test", name: "User", role: "admin", permissions: ["users"] },
      cookies: {
        kind: "user",
        principalId: "user-a",
        sessionId: "session-a",
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        csrfToken: "csrf-secret",
        refreshMaxAgeMs: 60 * 60 * 1000,
      },
    });

    expect(response.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(response.cookie).toHaveBeenCalledTimes(3);
    expect(response.json).toHaveBeenCalledWith({
      user: { id: "user-a", email: "user@example.test", name: "User", role: "admin", permissions: ["users"] },
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain("secret");
  });

  it("accepts the exact configured Origin and rejects an untrusted exchange Origin with no-store", async () => {
    const dependencies = routeDependencies({
      service: { ...routeDependencies().service, exchangeLegacyBearer: vi.fn(async () => ({ status: "exchanged", user: { id: "user-a" }, cookies: { kind: "user", accessToken: "access-secret", refreshToken: "refresh-secret", csrfToken: "csrf-secret", refreshMaxAgeMs: 1000 } })) },
    });
    activeServer = await startAuthRoutes(dependencies);

    const accepted = await fetch(`${activeServer.baseUrl}/api/auth/exchange`, { headers: { Origin: "https://app.example.test", Authorization: "Bearer legacy-token" }, method: "POST" });
    const rejected = await fetch(`${activeServer.baseUrl}/api/auth/exchange`, { headers: { Origin: "https://evil.example.test", Authorization: "Bearer legacy-token" }, method: "POST" });

    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ user: { id: "user-a" } });
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
  });

  it("requires matching CSRF and Origin for access logout before performing idempotent logout", async () => {
    const dependencies = routeDependencies();
    activeServer = await startAuthRoutes(dependencies);
    const access = issueAccessToken({ sid: "access-session", kind: "user" });
    const csrf = issueCsrfToken({ sid: "access-session", kind: "user" });
    const cookies = cookieHeader({ politicall_access: access, politicall_csrf: csrf });

    const rejected = await fetch(`${activeServer.baseUrl}/api/auth/logout`, { method: "POST", headers: { Origin: "https://app.example.test", Cookie: cookies } });
    const accepted = await fetch(`${activeServer.baseUrl}/api/auth/logout`, { method: "POST", headers: { Origin: "https://app.example.test", Cookie: cookies, "x-csrf-token": csrf } });

    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    expect(dependencies.service.logoutAccess).toHaveBeenCalledWith({ kind: "user", sessionId: "access-session" });
  });

  it("allows an inactive refresh session through CSRF only so expiry/replay reaches service and clears cookies", async () => {
    const dependencies = routeDependencies({
      resolveRefreshSession: vi.fn(async (_input: any) => session("refresh-session", "revoked")),
      service: { ...routeDependencies().service, refresh: vi.fn(async () => ({ status: "invalid", clearCookies: "user" })) },
    });
    activeServer = await startAuthRoutes(dependencies);
    const csrf = issueCsrfToken({ sid: "refresh-session", kind: "user" });
    const response = await fetch(`${activeServer.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { Origin: "https://app.example.test", "x-csrf-token": csrf, Cookie: cookieHeader({ politicall_refresh: "replayed", politicall_csrf: csrf }) },
    });

    expect(dependencies.resolveRefreshSession).toHaveBeenCalledWith({ kind: "user", refreshToken: "replayed", includeInactive: true });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("politicall_refresh=");
  });

  it("caps registration, user-login, and admin-login limiter state with no-store rate-limit rejections", async () => {
    const limiter = createAuthenticationRateLimiter({ maximumEntries: 2, now: () => 1_000 });
    const app = express();
    app.set("trust proxy", true);
    app.post("/api/auth/register", limiter("credential:registration", 1), (_request, response) => response.status(204).end());
    app.post("/api/auth/login", limiter("credential:user-login", 1), (_request, response) => response.status(204).end());
    app.post("/api/admin/login", limiter("credential:admin-login", 1), (_request, response) => response.status(204).end());
    const server = await new Promise<any>((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    activeServer = { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())) };

    const first = await fetch(`${activeServer.baseUrl}/api/auth/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    const limited = await fetch(`${activeServer.baseUrl}/api/auth/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    await fetch(`${activeServer.baseUrl}/api/auth/login`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.2" } });
    await fetch(`${activeServer.baseUrl}/api/admin/login`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.3" } });

    expect(first.status).toBe(204);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(limited.headers.get("retry-after")).not.toBeNull();
    expect(limiter.size()).toBe(2);
  });

  it("fails closed for a new key when the bounded limiter is saturated without forgetting an active limited key", async () => {
    const limiter = createAuthenticationRateLimiter({ maximumEntries: 2, now: () => 1_000 });
    const app = express();
    app.set("trust proxy", true);
    app.post("/limited", limiter("saturated", 1), (_request, response) => response.status(204).end());
    const server = await new Promise<any>((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    activeServer = { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())) };

    await fetch(`${activeServer.baseUrl}/limited`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    const originalLimited = await fetch(`${activeServer.baseUrl}/limited`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    await fetch(`${activeServer.baseUrl}/limited`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.2" } });
    const saturatedNewKey = await fetch(`${activeServer.baseUrl}/limited`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.3" } });
    const originalStillLimited = await fetch(`${activeServer.baseUrl}/limited`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });

    expect(originalLimited.status).toBe(429);
    expect(saturatedNewKey.status).toBe(429);
    expect(saturatedNewKey.headers.get("cache-control")).toBe("no-store");
    expect(originalStillLimited.status).toBe(429);
    expect(limiter.size()).toBe(2);
  });

  it("uses inactive refresh resolution for DELETE refresh logout and reaches the reuse path", async () => {
    const dependencies = routeDependencies({
      resolveRefreshSession: vi.fn(async () => session("refresh-session", "revoked")),
      service: { ...routeDependencies().service, logoutRefresh: vi.fn(async () => ({ clearCookies: "user", status: "reuse_detected" })) },
    });
    activeServer = await startAuthRoutes(dependencies);
    const csrf = issueCsrfToken({ sid: "refresh-session", kind: "user" });
    const response = await fetch(`${activeServer.baseUrl}/api/auth/refresh`, {
      method: "DELETE",
      headers: { Origin: "https://app.example.test", "x-csrf-token": csrf, Cookie: cookieHeader({ politicall_refresh: "revoked-refresh", politicall_csrf: csrf }) },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dependencies.resolveRefreshSession).toHaveBeenCalledWith({ kind: "user", refreshToken: "revoked-refresh", includeInactive: true });
    expect(dependencies.service.logoutRefresh).toHaveBeenCalledWith({ kind: "user", refreshToken: "revoked-refresh" });
  });

  it("keeps access logout idempotent after the session has already been revoked", async () => {
    const dependencies = routeDependencies();
    activeServer = await startAuthRoutes(dependencies);
    const access = issueAccessToken({ sid: "access-session", kind: "user" });
    const csrf = issueCsrfToken({ sid: "access-session", kind: "user" });
    const headers = { Origin: "https://app.example.test", Cookie: cookieHeader({ politicall_access: access, politicall_csrf: csrf }), "x-csrf-token": csrf };

    const first = await fetch(`${activeServer.baseUrl}/api/auth/logout`, { method: "POST", headers });
    const repeated = await fetch(`${activeServer.baseUrl}/api/auth/logout`, { method: "POST", headers });

    expect(first.status).toBe(204);
    expect(repeated.status).toBe(204);
    expect(dependencies.service.logoutAccess).toHaveBeenCalledTimes(2);
  });

  it("allows many distinct sessions behind one IP while limiting a repeated access credential", async () => {
    const dependencies = routeDependencies({
      resolveAccessSession: vi.fn(async () => ({ ...session("access-session"), expiresAt: new Date(Date.now() + 60 * 60 * 1000) })),
    });
    activeServer = await startAuthRoutes(dependencies);
    const request = (sessionId: string) => fetch(`${activeServer!.baseUrl}/api/auth/csrf`, {
      headers: { Cookie: cookieHeader({ politicall_access: issueAccessToken({ sid: sessionId, kind: "user" }) }), "x-forwarded-for": "198.51.100.50" },
    });

    const distinct = await Promise.all([1, 2, 3, 4, 5, 6].map((index) => request(`access-${index}`)));
    const repeated = await Promise.all(Array.from({ length: 31 }, () => request("repeated-access")));

    expect(distinct.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(repeated.slice(0, 30).every((response) => response.status === 200)).toBe(true);
    expect(repeated[30].status).toBe(429);
    expect(repeated[30].headers.get("cache-control")).toBe("no-store");
  });

  it("rejects non-http public application URLs", () => {
    expect(() => getAuthAllowedOrigins({ PUBLIC_APP_URL: "ftp://app.example.test", NODE_ENV: "production" })).toThrow("http");
  });

  it("allows explicitly configured additional public application origins", () => {
    expect(getAuthAllowedOrigins({
      PUBLIC_APP_URL: "https://politicall.com.br",
      PUBLIC_APP_ORIGINS: "https://www.politicall.com.br",
      NODE_ENV: "production",
    })).toEqual([
      "https://politicall.com.br",
      "https://www.politicall.com.br",
    ]);
  });
});

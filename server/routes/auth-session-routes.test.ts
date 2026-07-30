import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthenticationRateLimiter, getAuthAllowedOrigins, registerAuthSessionRoutes, sendAuthSessionResponse } from "./auth-session-routes";
import { issueAccessToken } from "../security/auth-cookies";
import { issueCsrfToken } from "../security/csrf";

const sessionSecret = "route-test-session-secret";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

async function startAuthRoutes(dependencies: any): Promise<ServerHandle> {
  const app = express();
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

  it("caps every active auth limiter store and emits no-store with rate-limit headers", async () => {
    const limiter = createAuthenticationRateLimiter({ maximumEntries: 2, now: () => 1_000 });
    const app = express();
    app.post("/register", limiter("registration", 1), (_request, response) => response.status(204).end());
    const server = await new Promise<any>((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    activeServer = { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())) };

    const first = await fetch(`${activeServer.baseUrl}/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    const limited = await fetch(`${activeServer.baseUrl}/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" } });
    await fetch(`${activeServer.baseUrl}/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.2" } });
    await fetch(`${activeServer.baseUrl}/register`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.3" } });

    expect(first.status).toBe(204);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(limited.headers.get("retry-after")).not.toBeNull();
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });

  it("rejects non-http public application URLs", () => {
    expect(() => getAuthAllowedOrigins({ PUBLIC_APP_URL: "ftp://app.example.test", NODE_ENV: "production" })).toThrow("http");
  });
});

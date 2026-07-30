import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS } from "@shared/schema";
import { createAuthenticationRateLimiter } from "./auth-session-routes";
import { registerPublicAuthRoutes } from "./public-auth-routes";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

const origin = "https://app.example.test";
const user = { id: "user-a", accountId: "account-a", email: "user@example.test", name: "User", role: "admin", permissions: DEFAULT_PERMISSIONS.admin, password: "hash" };
const issuedUser = { user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions }, cookies: { kind: "user" as const, principalId: user.id, sessionId: "session-a", accessToken: "access-secret", refreshToken: "refresh-secret", csrfToken: "csrf-secret", refreshMaxAgeMs: 1_000 } };
const issuedAdmin = { admin: true as const, cookies: { kind: "admin" as const, principalId: "admin", sessionId: "session-admin", accessToken: "access-secret", refreshToken: "refresh-secret", csrfToken: "csrf-secret", refreshMaxAgeMs: 1_000 } };

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    allowedOrigins: [origin],
    limiter: createAuthenticationRateLimiter(),
    storage: {
      getUserByEmail: vi.fn(async () => undefined),
      createAccount: vi.fn(async () => ({ id: "account-a" })),
      findAvailableSlug: vi.fn(async () => "user"),
      createUser: vi.fn(async () => user),
    },
    authSessionService: {
      issueUserSession: vi.fn(async () => issuedUser),
      loginUser: vi.fn(async () => issuedUser),
      loginAdmin: vi.fn(async () => issuedAdmin),
    },
    hashPassword: vi.fn(async () => "hash"),
    generateSlug: (name: string) => name.toLowerCase(),
    toAuthSessionUser: (stored: typeof user) => stored,
    ...overrides,
  };
}

async function start(overrides: Record<string, unknown> = {}): Promise<{ server: ServerHandle; dependencies: ReturnType<typeof dependencies> }> {
  const routeDependencies = dependencies(overrides);
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  registerPublicAuthRoutes(app, routeDependencies);
  const listener = await new Promise<any>((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  return {
    dependencies: routeDependencies,
    server: { baseUrl: `http://127.0.0.1:${listener.address().port}`, close: () => new Promise((resolve, reject) => listener.close((error: Error | undefined) => error ? reject(error) : resolve())) },
  };
}

const registration = (email: string) => ({ email, password: "secret1", name: "User" });
const login = (email: string) => ({ email, password: "secret1" });

describe("public credential auth routes", () => {
  let active: ServerHandle | undefined;

  afterEach(async () => { if (active) await active.close(); active = undefined; });

  it("limits registration by IP before varying emails can cause more bcrypt or account writes", async () => {
    const started = await start(); active = started.server;
    const responses = await Promise.all(Array.from({ length: 11 }, (_, index) => index + 1).map((suffix) => fetch(`${active!.baseUrl}/api/auth/register`, { method: "POST", headers: { Origin: origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(registration(`user${suffix}@example.test`)) })));

    expect(responses.map((response) => response.status)).toEqual([...Array(10).fill(200), 429]);
    expect(started.dependencies.hashPassword).toHaveBeenCalledTimes(10);
    expect(started.dependencies.storage.createAccount).toHaveBeenCalledTimes(10);
    expect(responses[10].headers.get("cache-control")).toBe("no-store");
  });

  it("uses both IP-wide and normalized email limits for user login, and an IP-only limit for admin login", async () => {
    const started = await start(); active = started.server;
    const loginResponses = await Promise.all([1, 2, 3, 4, 5, 6].map((suffix) => fetch(`${active!.baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.8" }, body: JSON.stringify(login(`person${suffix}@example.test`)) })));
    const sameEmail = await Promise.all([1, 2, 3, 4, 5, 6].map(() => fetch(`${active!.baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.9" }, body: JSON.stringify(login("USER@example.test")) })));
    const adminResponses = await Promise.all(Array.from({ length: 11 }).map(() => fetch(`${active!.baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { Origin: origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({ password: "secret1" }),
    })));

    expect(loginResponses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(sameEmail.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 429]);
    expect(adminResponses.map((response) => response.status)).toEqual([...Array(10).fill(200), 429]);
  });

  it("uses exact Origin and generic no-store failures, while successful JSON does not expose credentials", async () => {
    const started = await start({ authSessionService: { issueUserSession: vi.fn(async () => issuedUser), loginUser: vi.fn(async () => { throw new Error("database detail"); }), loginAdmin: vi.fn(async () => issuedAdmin) } }); active = started.server;
    const originRejected = await fetch(`${active.baseUrl}/api/auth/register`, { method: "POST", headers: { Origin: "https://evil.example.test", "content-type": "application/json" }, body: JSON.stringify(registration("origin@example.test")) });
    const invalid = await fetch(`${active.baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify({ email: "not-an-email" }) });
    const unexpected = await fetch(`${active.baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify(login("user@example.test")) });
    const success = await fetch(`${active.baseUrl}/api/admin/login`, { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify({ password: "secret1" }) });

    for (const response of [originRejected, invalid, unexpected]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Authentication failed" });
    }
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await success.json())).not.toContain("secret");
  });
});

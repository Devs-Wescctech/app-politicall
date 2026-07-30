import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFixedWindowRateLimiter,
  createRequestSecurity,
  installApiResponseGuards,
  parseTrustProxyHops,
  REQUEST_SECURITY_LIMITS,
} from "./request-security";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

function jsonBodyAtMost(limit: number): string { return JSON.stringify({ data: "a".repeat(limit - Buffer.byteLength('{"data":"}') - 2) }); }
function jsonBodyOver(limit: number): string { return JSON.stringify({ data: "a".repeat(limit - Buffer.byteLength('{"data":"}') + 2) }); }

async function start(app: express.Express): Promise<ServerHandle> {
  const server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve())),
  };
}

describe("request security", () => {
  let server: ServerHandle | undefined;

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
  });

  it("parses only a safe base-10 proxy hop count and resolves one trusted forwarding hop", async () => {
    expect(parseTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY: undefined })).toBe(1);
    for (const value of ["true", "1.5", "-1", " 1", "1 ", "01", "1001", "Infinity"]) {
      expect(() => parseTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY: value })).toThrow();
    }

    const app = express();
    createRequestSecurity(app, { env: { NODE_ENV: "production", TRUST_PROXY: "1" } });
    app.get("/api/ip", (req, res) => res.json({ ip: req.ip }));
    server = await start(app);
    const response = await fetch(`${server.baseUrl}/api/ip`, { headers: { "x-forwarded-for": "198.51.100.25, 10.0.0.2" } });
    expect(await response.json()).toEqual({ ip: "10.0.0.2" });
  });

  it("enforces bounded global, import, and system-sync fixed-window limits with standard headers", async () => {
    const globalLimiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 60_000, maximumEntries: 10 });
    const importLimiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 2 });
    const syncLimiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 2 });
    const app = express();
    createRequestSecurity(app, { env: { NODE_ENV: "production", TRUST_PROXY: "1" }, globalLimiter, importLimiter, systemSyncLimiter: syncLimiter });
    app.get("/api/normal", (_req, res) => res.status(204).end());
    app.post("/api/attendance/contacts/import-list", (_req, res) => res.status(204).end());
    app.post("/api/admin/system-sync", (_req, res) => res.status(204).end());
    server = await start(app);

    const ip = { "x-forwarded-for": "198.51.100.8" };
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: ip })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: ip })).status).toBe(204);
    const limited = await fetch(`${server.baseUrl}/api/normal`, { headers: ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
    expect(limited.headers.get("ratelimit-limit")).toBe("2");
    expect((await fetch(`${server.baseUrl}/api/attendance/contacts/import-list`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.9" } })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/attendance/contacts/import-list`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.9" } })).status).toBe(429);
    expect((await fetch(`${server.baseUrl}/api/admin/system-sync`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.10" } })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/admin/system-sync`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.10" } })).status).toBe(429);
  });

  it("binds import and sync limits to the actual Express route patterns including equivalent paths", async () => {
    const app = express();
    createRequestSecurity(app, { env: { NODE_ENV: "production", TRUST_PROXY: "1" }, globalLimiter: createFixedWindowRateLimiter({ limit: 100, windowMs: 60_000, maximumEntries: 50 }), importLimiter: createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 50 }), systemSyncLimiter: createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 50 }) });
    const imports = ["/api/attendance/contacts/import-platform", "/api/attendance/contacts/import-list", "/api/attendance/contacts/import-file", "/api/attendance/history/import", "/api/campaigns/import/analyze", "/api/campaigns/import/process", "/api/petitions/:id/signatures/import"];
    for (const path of imports) app.post(path, (_req, res) => res.status(204).end());
    app.post("/api/admin/system-sync", (_req, res) => res.status(204).end());
    app.post("/api/admin/system-sync/pull", (_req, res) => res.status(204).end());
    app.post("/api/admin/system-sync/unrelated", (_req, res) => res.status(204).end());
    server = await start(app);
    for (const [index, path] of imports.entries()) {
      const actual = path.replace(":id", `petition-${index}`);
      const headers = { "x-forwarded-for": `198.51.100.${index + 20}` };
      expect((await fetch(`${server.baseUrl}${actual}`, { method: "POST", headers })).status).toBe(204);
      expect((await fetch(`${server.baseUrl}${actual.toUpperCase()}/`, { method: "POST", headers })).status).toBe(429);
    }
    expect((await fetch(`${server.baseUrl}/api/admin/system-sync`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.80" } })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/admin/system-sync/`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.80" } })).status).toBe(429);
    expect((await fetch(`${server.baseUrl}/api/admin/system-sync/unrelated`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.81" } })).status).toBe(204);
  });

  it("fails closed for new keys at hard limiter capacity without dropping existing state", async () => {
    const limiter = createFixedWindowRateLimiter({ limit: 3, windowMs: 60_000, maximumEntries: 1 });
    const app = express();
    app.set("trust proxy", 1);
    app.use("/api", limiter);
    app.get("/api/normal", (_req, res) => res.status(204).end());
    server = await start(app);

    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.2" } })).status).toBe(429);
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(204);
  });

  it("exempts only safe requests to exact Express health and readiness paths", async () => {
    const app = express();
    createRequestSecurity(app, { env: { NODE_ENV: "production", TRUST_PROXY: "1" }, globalLimiter: createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 20 }) });
    app.all("/api/health", (_req, res) => res.status(204).end());
    app.all("/api/ready", (_req, res) => res.status(204).end());
    app.get("/api/normal", (_req, res) => res.status(204).end());
    server = await start(app);

    expect((await fetch(`${server.baseUrl}/api/normal`)).status).toBe(204);
    for (const path of ["/api/health", "/api/health/", "/api/ready", "/api/ready/", "/API/HEALTH", "/API/READY/"]) {
      expect((await fetch(`${server.baseUrl}${path}`)).status).toBe(204);
      expect((await fetch(`${server.baseUrl}${path}`, { method: "HEAD" })).status).toBe(204);
    }
    expect((await fetch(`${server.baseUrl}/api/normal`)).status).toBe(429);

    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const headers = { "x-forwarded-for": `198.51.100.${method.length}` };
      expect((await fetch(`${server.baseUrl}/api/health`, { method, headers })).status).toBe(204);
      expect((await fetch(`${server.baseUrl}/api/health`, { method, headers })).status).toBe(429);
    }
    const repeatedSlashHeaders = { "x-forwarded-for": "198.51.100.99" };
    expect((await fetch(`${server.baseUrl}/api/health//`, { headers: repeatedSlashHeaders })).status).toBe(404);
    expect((await fetch(`${server.baseUrl}/api/health//`, { headers: repeatedSlashHeaders })).status).toBe(429);
  });

  it("exposes exact production request contracts and enforces byte-accurate JSON and URL-encoded bounds", async () => {
    expect(REQUEST_SECURITY_LIMITS).toEqual({ global: { limit: 1200, windowMs: 60_000, maximumEntries: 50_000 }, imports: { limit: 20, windowMs: 900_000, maximumEntries: 50_000 }, systemSync: { limit: 3, windowMs: 3_600_000, maximumEntries: 50_000 } });
    const app = express();
    createRequestSecurity(app);
    app.post("/api/default", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    app.post("/api/url", (req, res) => res.status(204).end());
    app.patch("/api/users/:id", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    app.post("/api/attendance/conversations/:id/send-media", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    app.post("/api/attendance/contacts/import-list", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    installApiResponseGuards(app);
    server = await start(app);
    for (const [url, limit] of [["/api/default", 1_048_576], ["/api/users/user-a", 15 * 1_048_576], ["/api/attendance/conversations/c/send-media", 15 * 1_048_576], ["/api/attendance/contacts/import-list", 10 * 1_048_576]] as const) {
      const method = url.includes("users") ? "PATCH" : "POST";
      expect((await fetch(`${server.baseUrl}${url}`, { method, headers: { "content-type": "application/json" }, body: jsonBodyAtMost(limit) })).status).toBe(200);
      expect((await fetch(`${server.baseUrl}${url}`, { method, headers: { "content-type": "application/json" }, body: jsonBodyOver(limit) })).status).toBe(413);
    }
    expect((await fetch(`${server.baseUrl}/api/url`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `data=${"a".repeat(262_144 - 5)}` })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/url`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `data=${"a".repeat(262_144)}` })).status).toBe(413);
  });

  it("uses default and route-scoped body limits while preserving raw webhook bytes", async () => {
    const app = express();
    createRequestSecurity(app);
    app.post("/api/default", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    app.patch("/api/users/:id", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    app.post("/api/webhook/facebook", (req: any, res) => res.json({ bytes: req.rawBody.length }));
    installApiResponseGuards(app);
    server = await start(app);
    const oneMegabyte = "a".repeat(1_050_000);
    const fifteenMegabytes = "a".repeat(1_500_000);
    const defaultTooLarge = await fetch(`${server.baseUrl}/api/default`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ oneMegabyte }) });
    expect(defaultTooLarge.status).toBe(413);
    expect(await defaultTooLarge.json()).toEqual({ error: "Request rejected" });
    const scoped = await fetch(`${server.baseUrl}/api/users/user-a`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fifteenMegabytes }) });
    expect(scoped.status).toBe(200);
    const raw = JSON.stringify({ webhook: "payload" });
    expect(await (await fetch(`${server.baseUrl}/api/webhook/facebook`, { method: "POST", headers: { "content-type": "application/json" }, body: raw })).json()).toEqual({ bytes: Buffer.byteLength(raw) });
  });

  it("returns a JSON API 404 and sanitized, non-crashing parser and handler errors", async () => {
    const app = express();
    createRequestSecurity(app);
    app.get("/api/error", () => { throw new Error("credential=must-not-leak"); });
    installApiResponseGuards(app);
    server = await start(app);
    const unknown = await fetch(`${server.baseUrl}/api/not-a-route`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Not found" });
    const error = await fetch(`${server.baseUrl}/api/error`);
    expect(error.status).toBe(500);
    expect(await error.json()).toEqual({ error: "Internal Server Error" });
  });

  it("never logs an unmatched parser-error URL or request body", async () => {
    const app = express();
    createRequestSecurity(app);
    installApiResponseGuards(app);
    server = await start(app);
    const pathToken = "token-like-path-segment-7f3d0a";
    const bodyToken = "body-must-not-appear-9b21c4";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await fetch(`${server.baseUrl}/api/${pathToken}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"payload":"${bodyToken}"`,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Request rejected" });
      const logs = errorSpy.mock.calls.flat().map(String).join("\n");
      expect(logs).toContain("route=unmatched");
      expect(logs).not.toContain(pathToken);
      expect(logs).not.toContain(bodyToken);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("uses the production bootstrap order so rejection responses retain hardening headers", async () => {
    const app = express();
    createRequestSecurity(app, { env: { NODE_ENV: "production", TRUST_PROXY: "1" }, globalLimiter: createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 10 }) });
    app.get("/api/limited", (_req, res) => res.status(204).end());
    app.post("/api/body", (_req, res) => res.status(204).end());
    installApiResponseGuards(app);
    server = await start(app);
    await fetch(`${server.baseUrl}/api/limited`);
    const limited = await fetch(`${server.baseUrl}/api/limited`);
    const malformed = await fetch(`${server.baseUrl}/api/body`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.2" }, body: "{" });
    const oversized = await fetch(`${server.baseUrl}/api/body`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.3" }, body: jsonBodyOver(1_048_576) });
    for (const response of [limited, malformed, oversized]) {
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    }
    expect([malformed.status, oversized.status]).toEqual([400, 413]);
  });
});

import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFixedWindowRateLimiter,
  createRequestSecurity,
  installApiResponseGuards,
  parseTrustProxyHops,
} from "./request-security";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

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
    const globalLimiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 60_000, maximumEntries: 2 });
    const importLimiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 2 });
    const syncLimiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000, maximumEntries: 2 });
    const app = express();
    createRequestSecurity(app, { globalLimiter, importLimiter, systemSyncLimiter: syncLimiter });
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

  it("fails closed for new keys at hard limiter capacity without dropping existing state", async () => {
    const limiter = createFixedWindowRateLimiter({ limit: 3, windowMs: 60_000, maximumEntries: 1 });
    const app = express();
    app.use("/api", limiter);
    app.get("/api/normal", (_req, res) => res.status(204).end());
    server = await start(app);

    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(204);
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.2" } })).status).toBe(429);
    expect((await fetch(`${server.baseUrl}/api/normal`, { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(204);
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
});

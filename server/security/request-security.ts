import express, { type ErrorRequestHandler, type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { securityHeaders } from "../security-headers";

export const REQUEST_SECURITY_LIMITS = {
  global: { limit: 1_200, windowMs: 60_000, maximumEntries: 50_000 },
  imports: { limit: 20, windowMs: 15 * 60_000, maximumEntries: 50_000 },
  systemSync: { limit: 3, windowMs: 60 * 60_000, maximumEntries: 50_000 },
} as const;

type Environment = { NODE_ENV?: string; TRUST_PROXY?: string };
type RateLimitOptions = { limit: number; windowMs: number; maximumEntries: number; now?: () => number };
type FixedWindowLimiter = RequestHandler & { size(): number; clear(): void };

function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function rateLimitHeaders(response: Response, limit: number, remaining: number, resetAt: number, now: number): void {
  const resetSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  response.setHeader("RateLimit-Limit", String(limit));
  response.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  response.setHeader("RateLimit-Reset", String(resetSeconds));
  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

export function createFixedWindowRateLimiter(options: RateLimitOptions): FixedWindowLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? Date.now;
  const purgeExpired = (timestamp: number) => {
    for (const [key, entry] of entries) if (entry.resetAt <= timestamp) entries.delete(key);
  };
  const limiter = ((request: Request, response: Response, next: NextFunction) => {
    const timestamp = now();
    purgeExpired(timestamp);
    const key = clientIp(request);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= options.maximumEntries) {
        rateLimitHeaders(response, options.limit, 0, timestamp + options.windowMs, timestamp);
        response.setHeader("Retry-After", String(Math.ceil(options.windowMs / 1000)));
        response.status(429).json({ error: "Request rejected" });
        return;
      }
      entry = { count: 0, resetAt: timestamp + options.windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
    rateLimitHeaders(response, options.limit, options.limit - entry.count, entry.resetAt, timestamp);
    if (entry.count <= options.limit) return next();
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
    response.status(429).json({ error: "Request rejected" });
  }) as FixedWindowLimiter;
  limiter.size = () => entries.size;
  limiter.clear = () => entries.clear();
  return limiter;
}

export function parseTrustProxyHops(env: Environment = process.env as Environment): number {
  if (env.NODE_ENV !== "production") return 0;
  const configured = env.TRUST_PROXY;
  if (configured === undefined) return 1;
  if (!/^(?:0|[1-9][0-9]{0,2})$/.test(configured)) throw new Error("TRUST_PROXY must be a base-10 non-negative hop count");
  const hops = Number.parseInt(configured, 10);
  if (hops > 64) throw new Error("TRUST_PROXY exceeds the supported hop count");
  return hops;
}

function rawBodyVerifier(request: Request, _response: Response, buffer: Buffer): void {
  request.rawBody = buffer;
}

function isProbeRoute(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const path = request.path.toLowerCase();
  return path === "/health" || path === "/health/" || path === "/ready" || path === "/ready/";
}

export function createRequestSecurity(app: Express, options: {
  env?: Environment;
  globalLimiter?: FixedWindowLimiter;
  importLimiter?: FixedWindowLimiter;
  systemSyncLimiter?: FixedWindowLimiter;
} = {}): void {
  app.set("trust proxy", parseTrustProxyHops(options.env));
  app.use(securityHeaders);
  const globalLimiter = options.globalLimiter ?? createFixedWindowRateLimiter(REQUEST_SECURITY_LIMITS.global);
  const importLimiter = options.importLimiter ?? createFixedWindowRateLimiter(REQUEST_SECURITY_LIMITS.imports);
  const systemSyncLimiter = options.systemSyncLimiter ?? createFixedWindowRateLimiter(REQUEST_SECURITY_LIMITS.systemSync);
  app.use("/api", (request, response, next) => isProbeRoute(request) ? next() : globalLimiter(request, response, next));
  for (const path of [
    "/api/attendance/contacts/import-platform",
    "/api/attendance/contacts/import-list",
    "/api/attendance/contacts/import-file",
    "/api/attendance/history/import",
    "/api/campaigns/import/analyze",
    "/api/campaigns/import/process",
    "/api/petitions/:id/signatures/import",
  ]) app.post(path, importLimiter);
  for (const path of ["/api/admin/system-sync", "/api/admin/system-sync/pull"]) app.post(path, systemSyncLimiter);

  app.patch("/api/users/:id", express.json({ limit: "15mb", verify: rawBodyVerifier }));
  app.post("/api/attendance/conversations/:id/send-media", express.json({ limit: "15mb", verify: rawBodyVerifier }));
  app.post("/api/attendance/contacts/import-list", express.json({ limit: "10mb", verify: rawBodyVerifier }));
  app.use(express.json({ limit: "1mb", verify: rawBodyVerifier }));
  app.use(express.urlencoded({ limit: "256kb", extended: false }));
}

function operationalMessage(status: number): string | undefined {
  return status >= 400 && status < 500 && status !== 413 ? "Request rejected" : undefined;
}

export const apiErrorHandler: ErrorRequestHandler = (error: any, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error?.status === 413 || error?.type === "entity.too.large" ? 413 : Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  const message = operationalMessage(status) ?? (status === 413 ? "Request rejected" : "Internal Server Error");
  const route = typeof request.route?.path === "string" ? request.route.path.slice(0, 160) : "unmatched";
  console.error(`API request failed method=${request.method} route=${route} status=${status} category=${String(error?.type ?? error?.name ?? "unknown").slice(0, 80)}`);
  response.status(status).json({ error: message });
};

export function installApiNotFound(app: Express): void {
  app.use("/api", (_request, response) => response.status(404).json({ error: "Not found" }));
}

export function installApiResponseGuards(app: Express): void {
  installApiNotFound(app);
  app.use(apiErrorHandler);
}

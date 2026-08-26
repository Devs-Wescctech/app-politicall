import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { parseCookie } from "cookie";
import { legacyAuthExchanges, resolveUserPermissions, type User } from "@shared/schema";
import { getAdminPasswordHash } from "../admin-credentials";
import { createAuthSessionService, type AuthSessionUser, type IssuedSessionCookies } from "../services/auth-session-service";
import { createSession, resolveAccessSession, resolveRefreshSession, revokeSessionById, revokeSessionFamily, revokeUserSessions, rotateRefreshSession } from "../services/auth-session-store";
import { ADMIN_REFRESH_COOKIE, USER_REFRESH_COOKIE, clearSessionCookies, createRefreshToken, issueAccessToken, readAccessToken, setCsrfCookie, setSessionCookies } from "../security/auth-cookies";
import { issueCsrfToken, requireCsrf } from "../security/csrf";

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMIT_MAX_ENTRIES = 10_000;

type AuthRouteService = ReturnType<typeof createAuthSessionService>;
type RefreshSessionResolver = (input: { kind: "user" | "admin"; refreshToken: string; includeInactive?: boolean }) => ReturnType<typeof resolveRefreshSession>;
type AccessSessionResolver = (input: { kind: "user" | "admin"; sessionId: string }) => ReturnType<typeof resolveAccessSession>;

export type AuthenticationRateLimiter = {
  (scope: string, limit: number): (request: Request, response: Response, next: NextFunction) => void;
  size(): number;
  clear(): void;
};

export type AuthenticationRateLimiterFactory = ((options?: { maximumEntries?: number; now?: () => number }) => AuthenticationRateLimiter) & {
  resetForTests(): void;
};

let runtimeLimiter: AuthenticationRateLimiter | undefined;

export const createAuthenticationRateLimiter: AuthenticationRateLimiterFactory = Object.assign(
  (options: { maximumEntries?: number; now?: () => number } = {}): AuthenticationRateLimiter => {
    const maximumEntries = options.maximumEntries ?? AUTH_LIMIT_MAX_ENTRIES;
    const now = options.now ?? Date.now;
    const entries = new Map<string, { count: number; resetAt: number }>();

    const purgeExpired = (timestamp: number) => {
      for (const [key, entry] of entries) {
        if (entry.resetAt <= timestamp) entries.delete(key);
      }
    };

    const limiter = ((scope: string, limit: number) => (request: Request, response: Response, next: NextFunction) => {
      const timestamp = now();
      purgeExpired(timestamp);
      const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`;
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= maximumEntries) {
          response.setHeader("X-RateLimit-Limit", String(limit));
          response.setHeader("X-RateLimit-Remaining", "0");
          response.setHeader("X-RateLimit-Reset", String(Math.ceil((timestamp + AUTH_WINDOW_MS) / 1000)));
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Retry-After", String(Math.max(1, Math.ceil(AUTH_WINDOW_MS / 1000))));
          response.status(429).json({ error: "Authentication failed" });
          return;
        }
        entry = { count: 0, resetAt: timestamp + AUTH_WINDOW_MS };
        entries.set(key, entry);
      }
      entry.count += 1;
      response.setHeader("X-RateLimit-Limit", String(limit));
      response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
      response.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      if (entry.count <= limit) return next();
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
      response.status(429).json({ error: "Authentication failed" });
    }) as AuthenticationRateLimiter;
    limiter.size = () => entries.size;
    limiter.clear = () => entries.clear();
    return limiter;
  },
  { resetForTests: () => runtimeLimiter?.clear() },
);

runtimeLimiter = createAuthenticationRateLimiter();

type AuthOriginEnvironment = {
  PUBLIC_APP_URL?: string;
  PUBLIC_APP_ORIGINS?: string;
  NODE_ENV?: string;
};

function parseHttpOrigin(value: string, variableName: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${variableName} must use http or https`);
  }
  return url.origin;
}

export function getAuthAllowedOrigins(env: AuthOriginEnvironment = process.env as AuthOriginEnvironment): string[] {
  const configured = env.PUBLIC_APP_URL;
  if (!configured && env.NODE_ENV !== "production") return ["http://localhost:5000"];
  if (!configured) throw new Error("PUBLIC_APP_URL must be configured in production");
  const origins = [
    parseHttpOrigin(configured, "PUBLIC_APP_URL"),
    ...(env.PUBLIC_APP_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => parseHttpOrigin(value, "PUBLIC_APP_ORIGINS")),
  ];
  return [...new Set(origins)];
}

function setNoStore(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
}

function rejectAuthentication(response: Response, status = 401): void {
  setNoStore(response);
  response.status(status).json({ error: "Authentication failed" });
}

function requireExactOrigin(origins: readonly string[]) {
  const allowed = new Set(origins);
  return (request: Request, response: Response, next: NextFunction) => {
    if (typeof request.headers.origin !== "string" || !allowed.has(request.headers.origin)) return rejectAuthentication(response, 403);
    next();
  };
}

function refreshToken(request: Request, kind: "user" | "admin"): string | undefined {
  return typeof request.headers.cookie === "string"
    ? parseCookie(request.headers.cookie)[kind === "user" ? USER_REFRESH_COOKIE : ADMIN_REFRESH_COOKIE]
    : undefined;
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : undefined;
}

function requestMetadata(request: Request) {
  return { ipMetadata: request.ip || request.socket.remoteAddress, deviceMetadata: request.get("user-agent") };
}

function limiterCredentialHash(value: string | undefined): string {
  return createHash("sha256").update(value ?? "missing").digest("hex");
}

function requireAuthLimits(limiter: AuthenticationRateLimiter, resolveLimits: (request: Request) => Array<{ scope: string; limit: number }>) {
  return (request: Request, response: Response, next: NextFunction) => {
    const limits = resolveLimits(request);
    let index = 0;
    const applyNext = () => {
      const current = limits[index++];
      if (!current) return next();
      limiter(current.scope, current.limit)(request, response, applyNext);
    };
    applyNext();
  };
}

export function toAuthSessionUser(user: User): AuthSessionUser {
  return {
    id: user.id,
    accountId: user.accountId,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: resolveUserPermissions(user.role, user.permissions),
    password: user.password,
  };
}

function routeHandler(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response) => handler(request, response).catch(() => rejectAuthentication(response, 500));
}

export function sendAuthSessionResponse(response: Pick<Response, "set" | "cookie" | "json">, result: { user: unknown; cookies: IssuedSessionCookies } | { admin: true; cookies: IssuedSessionCookies }) {
  response.set("Cache-Control", "no-store");
  setSessionCookies(response as Response, result.cookies);
  response.json("user" in result ? { user: result.user } : { admin: true });
}

export function createRuntimeAuthSessionService() {
  return createAuthSessionService({
    users: {
      findByEmail: async (email) => {
        const user = await (await import("../storage")).storage.getUserByEmail(email);
        return user ? toAuthSessionUser(user) : undefined;
      },
      findByIdAndAccount: async (userId, accountId) => {
        const user = await (await import("../storage")).storage.getUser(userId);
        return user?.accountId === accountId ? toAuthSessionUser(user) : undefined;
      },
    },
    verifyPassword: bcrypt.compare,
    getAdminPasswordHash,
    sessionStore: { createSession, resolveRefreshSession, rotateRefreshSession, revokeSession: revokeSessionById, revokeSessionFamily, revokeUserSessions },
    legacyExchangeStore: {
      async claim({ tokenHash, expiresAt }) {
        const { db } = await import("../db");
        const inserted = await db.insert(legacyAuthExchanges).values({ tokenHash, expiresAt }).onConflictDoNothing().returning({ tokenHash: legacyAuthExchanges.tokenHash });
        return inserted.length === 1;
      },
    },
    createRefreshToken,
    issueAccessToken,
    issueCsrfToken,
  });
}

export type AuthSessionRouteDependencies = {
  allowedOrigins?: readonly string[];
  service?: AuthRouteService;
  resolveRefreshSession?: RefreshSessionResolver;
  resolveAccessSession?: AccessSessionResolver;
  limiter?: AuthenticationRateLimiter;
};

export function registerAuthSessionRoutes(app: Express, dependencies: AuthSessionRouteDependencies = {}): void {
  const origins = dependencies.allowedOrigins ?? getAuthAllowedOrigins();
  const service = dependencies.service ?? createRuntimeAuthSessionService();
  const resolveRefresh = dependencies.resolveRefreshSession ?? resolveRefreshSession;
  const resolveAccess = dependencies.resolveAccessSession ?? resolveAccessSession;
  const limiter = dependencies.limiter ?? runtimeLimiter!;

  for (const kind of ["user", "admin"] as const) {
    const base = kind === "user" ? "/api/auth" : "/api/admin/auth";
    const csrfForRefresh = requireCsrf({
      kind,
      allowedOrigins: origins,
      resolveSession: async (request) => {
        const token = refreshToken(request, kind);
        const stored = token && await resolveRefresh({ kind, refreshToken: token, includeInactive: true });
        return stored ? { sid: stored.id, kind } : undefined;
      },
    });
    const csrfForAccess = requireCsrf({ kind, allowedOrigins: origins });

    app.get(`${base}/csrf`, requireAuthLimits(limiter, (request) => [
      { scope: `${kind}:csrf:ip`, limit: 600 },
      { scope: `${kind}:csrf:session:${limiterCredentialHash(readAccessToken(request, kind)?.sid)}`, limit: 30 },
    ]), routeHandler(async (request, response) => {
      setNoStore(response);
      const access = readAccessToken(request, kind);
      const stored = access && await resolveAccess({ kind, sessionId: access.sid });
      if (!stored) return rejectAuthentication(response);
      setCsrfCookie(response, { kind, csrfToken: issueCsrfToken({ sid: stored.id, kind }), refreshMaxAgeMs: stored.expiresAt.getTime() - Date.now() });
      response.json({ csrf: true });
    }));

    app.post(`${base}/refresh`, requireAuthLimits(limiter, (request) => [
      { scope: `${kind}:refresh:ip`, limit: 300 },
      { scope: `${kind}:refresh:credential:${limiterCredentialHash(refreshToken(request, kind))}`, limit: 5 },
    ]), csrfForRefresh, routeHandler(async (request, response) => {
      setNoStore(response);
      const token = refreshToken(request, kind);
      const result = token && await service.refresh({ kind, refreshToken: token });
      if (!result || result.status !== "refreshed") {
        clearSessionCookies(response, kind);
        return rejectAuthentication(response);
      }
      sendAuthSessionResponse(response, result);
    }));

    app.delete(`${base}/refresh`, requireAuthLimits(limiter, (request) => [
      { scope: `${kind}:logout-refresh:ip`, limit: 300 },
      { scope: `${kind}:logout-refresh:credential:${limiterCredentialHash(refreshToken(request, kind))}`, limit: 5 },
    ]), csrfForRefresh, routeHandler(async (request, response) => {
      setNoStore(response);
      const token = refreshToken(request, kind);
      if (token) await service.logoutRefresh({ kind, refreshToken: token });
      clearSessionCookies(response, kind);
      response.status(204).end();
    }));

    app.post(`${base}/exchange`, requireAuthLimits(limiter, (request) => [
      { scope: `${kind}:exchange:ip`, limit: 300 },
      { scope: `${kind}:exchange:credential:${limiterCredentialHash(bearerToken(request))}`, limit: 2 },
    ]), requireExactOrigin(origins), routeHandler(async (request, response) => {
      setNoStore(response);
      const token = bearerToken(request) ?? "";
      const result = await service.exchangeLegacyBearer({ kind, token });
      if (result.status !== "exchanged") return rejectAuthentication(response);
      sendAuthSessionResponse(response, result);
    }));

    app.post(`${base}/logout`, requireAuthLimits(limiter, (request) => [
      { scope: `${kind}:logout-access:ip`, limit: 300 },
      { scope: `${kind}:logout-access:session:${limiterCredentialHash(readAccessToken(request, kind)?.sid)}`, limit: 5 },
    ]), csrfForAccess, routeHandler(async (request, response) => {
      setNoStore(response);
      const access = readAccessToken(request, kind);
      if (access) await service.logoutAccess({ kind, sessionId: access.sid });
      clearSessionCookies(response, kind);
      response.status(204).end();
    }));
  }
}

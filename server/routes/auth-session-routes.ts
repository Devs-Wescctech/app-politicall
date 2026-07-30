import bcrypt from "bcrypt";
import type { Express, NextFunction, Request, Response } from "express";
import { parseCookie } from "cookie";
import { DEFAULT_PERMISSIONS, legacyAuthExchanges, type User } from "@shared/schema";
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

export const createAuthenticationRateLimiter: AuthenticationRateLimiterFactory = Object.assign(
  (options: { maximumEntries?: number; now?: () => number } = {}): AuthenticationRateLimiter => {
    const maximumEntries = options.maximumEntries ?? AUTH_LIMIT_MAX_ENTRIES;
    const now = options.now ?? Date.now;
    const entries = new Map<string, { count: number; resetAt: number }>();

    const evictOne = () => {
      let oldestKey: string | undefined;
      let oldestResetAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of entries) {
        if (entry.resetAt < oldestResetAt) {
          oldestKey = key;
          oldestResetAt = entry.resetAt;
        }
      }
      if (oldestKey) entries.delete(oldestKey);
    };

    const limiter = ((scope: string, limit: number) => (request: Request, response: Response, next: NextFunction) => {
      const timestamp = now();
      const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`;
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= timestamp) {
        if (!entry && entries.size >= maximumEntries) evictOne();
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
  { resetForTests: () => undefined },
);

const runtimeLimiter = createAuthenticationRateLimiter();

export function getAuthAllowedOrigins(env: { PUBLIC_APP_URL?: string; NODE_ENV?: string } = process.env as { PUBLIC_APP_URL?: string; NODE_ENV?: string }): string[] {
  const configured = env.PUBLIC_APP_URL;
  if (!configured && env.NODE_ENV !== "production") return ["http://localhost:5000"];
  if (!configured) throw new Error("PUBLIC_APP_URL must be configured in production");
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use http or https");
  return [url.origin];
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

function requestMetadata(request: Request) {
  return { ipMetadata: request.ip || request.socket.remoteAddress, deviceMetadata: request.get("user-agent") };
}

export function toAuthSessionUser(user: User): AuthSessionUser {
  return {
    id: user.id,
    accountId: user.accountId,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions ?? DEFAULT_PERMISSIONS.assessor,
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
  const limiter = dependencies.limiter ?? runtimeLimiter;

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

    app.get(`${base}/csrf`, limiter(`${kind}:csrf`, 10), routeHandler(async (request, response) => {
      setNoStore(response);
      const access = readAccessToken(request, kind);
      const stored = access && await resolveAccess({ kind, sessionId: access.sid });
      if (!stored) return rejectAuthentication(response);
      setCsrfCookie(response, { kind, csrfToken: issueCsrfToken({ sid: stored.id, kind }), refreshMaxAgeMs: stored.expiresAt.getTime() - Date.now() });
      response.json({ csrf: true });
    }));

    app.post(`${base}/refresh`, limiter(`${kind}:refresh`, 5), csrfForRefresh, routeHandler(async (request, response) => {
      setNoStore(response);
      const token = refreshToken(request, kind);
      const result = token && await service.refresh({ kind, refreshToken: token });
      if (!result || result.status !== "refreshed") {
        clearSessionCookies(response, kind);
        return rejectAuthentication(response);
      }
      sendAuthSessionResponse(response, result);
    }));

    app.delete(`${base}/refresh`, limiter(`${kind}:logout-refresh`, 5), csrfForRefresh, routeHandler(async (request, response) => {
      setNoStore(response);
      const token = refreshToken(request, kind);
      if (token) await service.logoutRefresh({ kind, refreshToken: token });
      clearSessionCookies(response, kind);
      response.status(204).end();
    }));

    app.post(`${base}/exchange`, limiter(`${kind}:exchange`, 3), requireExactOrigin(origins), routeHandler(async (request, response) => {
      setNoStore(response);
      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const result = await service.exchangeLegacyBearer({ kind, token });
      if (result.status !== "exchanged") return rejectAuthentication(response);
      sendAuthSessionResponse(response, result);
    }));

    app.post(`${base}/logout`, limiter(`${kind}:logout-access`, 5), csrfForAccess, routeHandler(async (request, response) => {
      setNoStore(response);
      const access = readAccessToken(request, kind);
      if (access) await service.logoutAccess({ kind, sessionId: access.sid });
      clearSessionCookies(response, kind);
      response.status(204).end();
    }));
  }
}

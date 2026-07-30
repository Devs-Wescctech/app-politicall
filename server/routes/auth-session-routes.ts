import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import type { Express, Request, Response } from "express";
import { parseCookie } from "cookie";
import { eq } from "drizzle-orm";
import { legacyAuthExchanges } from "@shared/schema";
import { getAdminPasswordHash } from "../admin-credentials";
import { createAuthSessionService, type IssuedSessionCookies } from "../services/auth-session-service";
import { createSession, resolveAccessSession, resolveRefreshSession, revokeSessionById, revokeSessionFamily, revokeUserSessions, rotateRefreshSession } from "../services/auth-session-store";
import { ADMIN_REFRESH_COOKIE, USER_REFRESH_COOKIE, clearSessionCookies, createRefreshToken, issueAccessToken, readAccessToken, setCsrfCookie, setSessionCookies } from "../security/auth-cookies";
import { issueCsrfToken, requireCsrf } from "../security/csrf";

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMIT_MAX_ENTRIES = 10_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function getAuthAllowedOrigins(): string[] {
  const configured = process.env.PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV !== "production") return ["http://localhost:5000"];
  if (!configured) throw new Error("PUBLIC_APP_URL must be configured in production");
  return [new URL(configured).origin];
}

function authLimiter(scope: string, limit: number) {
  return (request: Request, response: Response, next: () => void) => {
    const now = Date.now();
    if (attempts.size >= AUTH_LIMIT_MAX_ENTRIES) {
      for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
    }
    const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    else current.count += 1;
    const entry = attempts.get(key)!;
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      response.status(429).json({ error: "Authentication failed" });
      return;
    }
    next();
  };
}

function requireExactOrigin(origins: readonly string[]) {
  const allowed = new Set(origins);
  return (request: Request, response: Response, next: () => void) => {
    if (typeof request.headers.origin !== "string" || !allowed.has(request.headers.origin)) {
      response.status(403).json({ error: "Authentication failed" });
      return;
    }
    next();
  };
}

function refreshToken(request: Request, kind: "user" | "admin"): string | undefined {
  const header = request.headers.cookie;
  if (typeof header !== "string") return undefined;
  return parseCookie(header)[kind === "user" ? USER_REFRESH_COOKIE : ADMIN_REFRESH_COOKIE];
}

function requestMetadata(request: Request) {
  return { ipMetadata: request.ip || request.socket.remoteAddress, deviceMetadata: request.get("user-agent") };
}

export function sendAuthSessionResponse(response: Pick<Response, "set" | "cookie" | "json">, result: { user: unknown; cookies: IssuedSessionCookies } | { admin: true; cookies: IssuedSessionCookies }) {
  response.set("Cache-Control", "no-store");
  setSessionCookies(response as Response, result.cookies);
  if ("user" in result) response.json({ user: result.user });
  else response.json({ admin: true });
}

export function createRuntimeAuthSessionService() {
  return createAuthSessionService({
    users: {
      findByEmail: async (email) => (await import("../storage")).storage.getUserByEmail(email) as any,
      findByIdAndAccount: async (userId, accountId) => {
        const user = await (await import("../storage")).storage.getUser(userId);
        return user?.accountId === accountId ? user as any : undefined;
      },
    },
    verifyPassword: bcrypt.compare,
    getAdminPasswordHash,
    sessionStore: {
      createSession,
      resolveRefreshSession,
      rotateRefreshSession,
      revokeSession: revokeSessionById,
      revokeSessionFamily,
      revokeUserSessions,
    },
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

export function registerAuthSessionRoutes(app: Express): void {
  const origins = getAuthAllowedOrigins();
  const service = createRuntimeAuthSessionService();
  for (const kind of ["user", "admin"] as const) {
    const base = kind === "user" ? "/api/auth" : "/api/admin/auth";
    const csrf = requireCsrf({
      kind,
      allowedOrigins: origins,
      resolveSession: async (request) => {
        const token = refreshToken(request, kind);
        const session = token && await resolveRefreshSession({ kind, refreshToken: token });
        return session ? { sid: session.id, kind } : undefined;
      },
    });

    app.get(`${base}/csrf`, authLimiter(`${kind}:csrf`, 30), async (request, response) => {
      response.set("Cache-Control", "no-store");
      const access = readAccessToken(request, kind);
      const session = access && await resolveAccessSession({ kind, sessionId: access.sid });
      if (!session) return response.status(401).json({ error: "Authentication failed" });
      setCsrfCookie(response, { kind, csrfToken: issueCsrfToken({ sid: session.id, kind }), refreshMaxAgeMs: session.expiresAt.getTime() - Date.now() });
      response.json({ csrf: true });
    });

    app.post(`${base}/refresh`, authLimiter(`${kind}:refresh`, 10), csrf, async (request, response) => {
      response.set("Cache-Control", "no-store");
      const token = refreshToken(request, kind);
      const result = token && await service.refresh({ kind, refreshToken: token });
      if (!result || result.status !== "refreshed") {
        if (result && (result.clearCookies === "user" || result.clearCookies === "admin")) clearSessionCookies(response, result.clearCookies);
        return response.status(401).json({ error: "Authentication failed" });
      }
      sendAuthSessionResponse(response, result as any);
    });

    app.delete(`${base}/refresh`, authLimiter(`${kind}:logout-refresh`, 10), csrf, async (request, response) => {
      response.set("Cache-Control", "no-store");
      const token = refreshToken(request, kind);
      if (token) await service.logoutRefresh({ kind, refreshToken: token });
      clearSessionCookies(response, kind);
      response.status(204).end();
    });

    app.post(`${base}/exchange`, authLimiter(`${kind}:exchange`, 5), requireExactOrigin(origins), async (request, response) => {
      response.set("Cache-Control", "no-store");
      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const result = await service.exchangeLegacyBearer({ kind, token });
      if (result.status !== "exchanged") return response.status(401).json({ error: "Authentication failed" });
      sendAuthSessionResponse(response, result as any);
    });

    app.post(`${base}/logout`, async (request, response) => {
      response.set("Cache-Control", "no-store");
      const access = readAccessToken(request, kind);
      if (access) await service.logoutAccess({ kind, sessionId: access.sid });
      clearSessionCookies(response, kind);
      response.status(204).end();
    });
  }
}

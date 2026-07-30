import type { NextFunction, Request, Response } from "express";
import { parseCookie } from "cookie";
import type { UserPermissions } from "@shared/schema";
import { readAccessToken, ADMIN_ACCESS_COOKIE, USER_ACCESS_COOKIE } from "./auth-cookies";
import { requireCsrf } from "./csrf";
import { verifyPureLegacyGlobalAdminToken } from "./legacy-global-admin";
import { verifyPureLegacyTenantToken } from "./legacy-tenant";

export type BrowserAuthRequest = Request & {
  userId?: string;
  accountId?: string;
  userRole?: string;
  user?: {
    id: string;
    accountId: string;
    email: string;
    name: string;
    role: string;
    permissions: UserPermissions;
  };
};

type AccessSession = {
  id: string;
  principalType: "user" | "global_admin";
  principalId: string;
  accountId: string | null;
  userId: string | null;
  globalAdminPrincipalId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

type TenantUser = NonNullable<BrowserAuthRequest["user"]>;

export type AuthenticationDependencies = {
  allowedOrigins: readonly string[] | (() => readonly string[]);
  resolveAccessSession(input: { kind: "user" | "admin"; sessionId: string }): Promise<AccessSession | undefined>;
  getUser(userId: string): Promise<TenantUser | undefined>;
  legacyBearerEnabled?: () => boolean;
};

function reject(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.status(401).json({ error: "Authentication failed" });
}

function accessCookieWasSupplied(request: Request, kind: "user" | "admin"): boolean {
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== "string") return false;
  const name = kind === "user" ? USER_ACCESS_COOKIE : ADMIN_ACCESS_COOKIE;
  return Object.hasOwn(parseCookie(cookieHeader), name);
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function isActiveUserSession(session: AccessSession | undefined): session is AccessSession & { accountId: string; userId: string } {
  return !!session
    && session.principalType === "user"
    && typeof session.accountId === "string"
    && session.accountId.length > 0
    && typeof session.userId === "string"
    && session.userId.length > 0
    && session.principalId === session.userId
    && session.globalAdminPrincipalId === null
    && session.revokedAt === null
    && session.expiresAt > new Date();
}

function isActiveGlobalAdminSession(session: AccessSession | undefined): session is AccessSession & { globalAdminPrincipalId: string } {
  return !!session
    && session.principalType === "global_admin"
    && typeof session.globalAdminPrincipalId === "string"
    && session.globalAdminPrincipalId.length > 0
    && session.principalId === session.globalAdminPrincipalId
    && session.accountId === null
    && session.userId === null
    && session.revokedAt === null
    && session.expiresAt > new Date();
}

function requireCookieCsrf(kind: "user" | "admin", sessionId: string, allowedOrigins: readonly string[]) {
  return requireCsrf({
    kind,
    allowedOrigins,
    resolveSession: () => ({ sid: sessionId, kind }),
  });
}

function resolveAllowedOrigins(input: AuthenticationDependencies["allowedOrigins"]): readonly string[] {
  return typeof input === "function" ? input() : input;
}

export function createAuthenticationMiddleware(dependencies: AuthenticationDependencies) {
  const legacyBearerEnabled = dependencies.legacyBearerEnabled ?? (() => process.env.ENABLE_BEARER_AUTH === "true");

  const authenticateUser = async (request: BrowserAuthRequest, response: Response, next: NextFunction) => {
    try {
    if (accessCookieWasSupplied(request, "user")) {
      const access = readAccessToken(request, "user");
      const session = access && await dependencies.resolveAccessSession({ kind: "user", sessionId: access.sid });
      if (!access || !isActiveUserSession(session)) return reject(response);
      const user = await dependencies.getUser(session.userId);
      if (!user || user.id !== session.userId || user.accountId !== session.accountId) return reject(response);
      request.userId = user.id;
      request.accountId = user.accountId;
      request.userRole = user.role;
      request.user = user;
      return requireCookieCsrf("user", session.id, resolveAllowedOrigins(dependencies.allowedOrigins))(request, response, next);
    }

    const token = bearerToken(request);
    const secret = process.env.SESSION_SECRET;
    const legacy = token && secret && legacyBearerEnabled() ? verifyPureLegacyTenantToken(token, secret) : undefined;
    if (!legacy) return reject(response);
    const user = await dependencies.getUser(legacy.userId);
    if (!user || user.id !== legacy.userId || user.accountId !== legacy.accountId) return reject(response);
    request.userId = user.id;
    request.accountId = user.accountId;
    request.userRole = user.role;
    request.user = user;
    next();
    } catch {
      reject(response);
    }
  };

  const authenticateGlobalAdmin = async (request: BrowserAuthRequest, response: Response, next: NextFunction) => {
    try {
    if (accessCookieWasSupplied(request, "admin")) {
      const access = readAccessToken(request, "admin");
      const session = access && await dependencies.resolveAccessSession({ kind: "admin", sessionId: access.sid });
      if (!access || !isActiveGlobalAdminSession(session)) return reject(response);
      return requireCookieCsrf("admin", session.id, resolveAllowedOrigins(dependencies.allowedOrigins))(request, response, next);
    }

    const token = bearerToken(request);
    const secret = process.env.SESSION_SECRET;
    if (!token || !secret || !legacyBearerEnabled() || !verifyPureLegacyGlobalAdminToken(token, secret)) return reject(response);
    next();
    } catch {
      reject(response);
    }
  };

  return { authenticateUser, authenticateGlobalAdmin };
}

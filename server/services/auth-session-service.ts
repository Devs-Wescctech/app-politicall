import { createHash } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { UserPermissions } from "@shared/schema";
import { GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS, USER_REFRESH_SESSION_MAX_AGE_MS, type AuthSessionRecord, type AuthSessionScope } from "./auth-session-store";

export const GLOBAL_ADMIN_PRINCIPAL_ID = "politicall:global-admin";
export type BrowserSessionKind = "user" | "admin";

export type AuthSessionUser = { id: string; accountId: string; email: string; name: string; role: string; permissions: UserPermissions; password: string };
type PublicUser = Omit<AuthSessionUser, "accountId" | "password">;
export type IssuedSessionCookies = { kind: BrowserSessionKind; principalId: string; sessionId: string; accessToken: string; refreshToken: string; csrfToken: string; refreshMaxAgeMs: number };

type SessionStore = {
  createSession(input: { scope: AuthSessionScope; refreshToken: string; expiresAt: Date; deviceMetadata?: string; ipMetadata?: string }): Promise<AuthSessionRecord>;
  resolveRefreshSession(input: { kind: BrowserSessionKind; refreshToken: string; includeInactive?: boolean }): Promise<AuthSessionRecord | undefined>;
  rotateRefreshSession(input: { kind: BrowserSessionKind; refreshToken: string; nextRefreshToken: string }): Promise<{ status: "missing" | "expired" | "reuse_detected" } | { status: "rotated"; session: AuthSessionRecord }>;
  revokeSession(input: { kind: BrowserSessionKind; sessionId: string; reason: string }): Promise<number>;
  revokeSessionFamily(input: { scope: AuthSessionScope; familyId: string; reason: string }): Promise<number>;
  revokeUserSessions(input: { accountId: string; userId: string; reason: string }): Promise<number>;
};

export type AuthSessionServiceDependencies = {
  users: { findByEmail(email: string): Promise<AuthSessionUser | undefined>; findByIdAndAccount(userId: string, accountId: string): Promise<AuthSessionUser | undefined> };
  verifyPassword(password: string, passwordHash: string): Promise<boolean>;
  getAdminPasswordHash(): Promise<string>;
  sessionStore: SessionStore;
  legacyExchangeStore: { claim(input: { tokenHash: string; expiresAt: Date }): Promise<boolean> };
  now?: () => Date;
  createRefreshToken(): string;
  issueAccessToken(input: { sid: string; kind: BrowserSessionKind }): string;
  issueCsrfToken(input: { sid: string; kind: BrowserSessionKind }): string;
};

function publicUser(user: AuthSessionUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions };
}

function expectedPrincipalType(kind: BrowserSessionKind) { return kind === "user" ? "user" : "global_admin"; }

function userScope(session: AuthSessionRecord): Extract<AuthSessionScope, { kind: "user" }> | undefined {
  return session.principalType === "user" && session.accountId && session.userId
    ? { kind: "user", accountId: session.accountId, userId: session.userId }
    : undefined;
}

function legacyClaims(token: string): JwtPayload | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set in environment variables");
  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof claims !== "object" || !claims || Array.isArray(claims) || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return undefined;
    return typeof claims.sid === "string" || typeof claims.kind === "string" ? undefined : claims;
  } catch { return undefined; }
}

export function createAuthSessionService(dependencies: AuthSessionServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const cookiesFor = (session: AuthSessionRecord, kind: BrowserSessionKind, refreshToken: string): IssuedSessionCookies | undefined => {
    const refreshMaxAgeMs = session.expiresAt.getTime() - now().getTime();
    if (refreshMaxAgeMs <= 0) return undefined;
    return { kind, principalId: session.principalId, sessionId: session.id, accessToken: dependencies.issueAccessToken({ sid: session.id, kind }), refreshToken, csrfToken: dependencies.issueCsrfToken({ sid: session.id, kind }), refreshMaxAgeMs };
  };

  const issueUserSession = async (user: AuthSessionUser, options: { expiresAt?: Date; deviceMetadata?: string; ipMetadata?: string } = {}) => {
    const refreshToken = dependencies.createRefreshToken();
    const session = await dependencies.sessionStore.createSession({ scope: { kind: "user", accountId: user.accountId, userId: user.id }, refreshToken, expiresAt: options.expiresAt ?? new Date(now().getTime() + USER_REFRESH_SESSION_MAX_AGE_MS), deviceMetadata: options.deviceMetadata, ipMetadata: options.ipMetadata });
    const cookies = cookiesFor(session, "user", refreshToken);
    if (!cookies) throw new Error("Issued user session is already expired");
    return { user: publicUser(user), cookies };
  };

  const issueAdminSession = async (options: { expiresAt?: Date; deviceMetadata?: string; ipMetadata?: string } = {}) => {
    const refreshToken = dependencies.createRefreshToken();
    const session = await dependencies.sessionStore.createSession({ scope: { kind: "global_admin", globalAdminPrincipalId: GLOBAL_ADMIN_PRINCIPAL_ID }, refreshToken, expiresAt: options.expiresAt ?? new Date(now().getTime() + GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS), deviceMetadata: options.deviceMetadata, ipMetadata: options.ipMetadata });
    const cookies = cookiesFor(session, "admin", refreshToken);
    if (!cookies) throw new Error("Issued global-admin session is already expired");
    return { admin: true as const, cookies };
  };

  return {
    issueUserSession,
    issueAdminSession,
    async loginUser(input: { email: string; password: string; deviceMetadata?: string; ipMetadata?: string }) {
      const user = await dependencies.users.findByEmail(input.email);
      return !user || !(await dependencies.verifyPassword(input.password, user.password)) ? undefined : issueUserSession(user, input);
    },
    async loginAdmin(input: { password: string; deviceMetadata?: string; ipMetadata?: string }) {
      return !(await dependencies.verifyPassword(input.password, await dependencies.getAdminPasswordHash())) ? undefined : issueAdminSession(input);
    },
    async refresh(input: { kind: BrowserSessionKind; refreshToken: string }) {
      const source = await dependencies.sessionStore.resolveRefreshSession({ ...input, includeInactive: true });
      if (!source || source.principalType !== expectedPrincipalType(input.kind)) return { status: "missing" as const };
      const nextRefreshToken = dependencies.createRefreshToken();
      if (source.revokedAt) {
        await dependencies.sessionStore.rotateRefreshSession({ ...input, nextRefreshToken });
        return { status: "invalid" as const, clearCookies: input.kind };
      }
      if (source.expiresAt <= now()) return { status: "expired" as const, clearCookies: input.kind };
      const rotated = await dependencies.sessionStore.rotateRefreshSession({ ...input, nextRefreshToken });
      if (rotated.status === "reuse_detected") return { status: "invalid" as const, clearCookies: input.kind };
      if (rotated.status !== "rotated") return { status: rotated.status };
      const cookies = cookiesFor(rotated.session, input.kind, nextRefreshToken);
      if (!cookies) return { status: "expired" as const };
      if (input.kind === "admin") return { status: "refreshed" as const, admin: true as const, cookies };
      const scope = userScope(rotated.session);
      const user = scope && await dependencies.users.findByIdAndAccount(scope.userId, scope.accountId);
      if (!scope || !user) {
        if (scope) await dependencies.sessionStore.revokeSessionFamily({ scope, familyId: rotated.session.familyId, reason: "principal_missing" });
        return { status: "invalid" as const, clearCookies: "user" as const };
      }
      return { status: "refreshed" as const, user: publicUser(user), cookies };
    },
    async exchangeLegacyBearer(input: { kind: BrowserSessionKind; token: string }) {
      if (process.env.ENABLE_BEARER_EXCHANGE !== "true") return { status: "disabled" as const };
      const claims = legacyClaims(input.token);
      if (!claims) return { status: "invalid" as const };
      if (input.kind === "admin") {
        if (claims.isAdmin !== true || claims.userId !== undefined || claims.accountId !== undefined) return { status: "invalid" as const };
        if (!(await dependencies.legacyExchangeStore.claim({ tokenHash: createHash("sha256").update(input.token).digest("hex"), expiresAt: new Date(claims.exp! * 1000) }))) return { status: "invalid" as const };
        return { status: "exchanged" as const, ...(await issueAdminSession()) };
      }
      if (typeof claims.userId !== "string" || !claims.userId || typeof claims.accountId !== "string" || !claims.accountId) return { status: "invalid" as const };
      const user = await dependencies.users.findByIdAndAccount(claims.userId, claims.accountId);
      if (!user || !(await dependencies.legacyExchangeStore.claim({ tokenHash: createHash("sha256").update(input.token).digest("hex"), expiresAt: new Date(claims.exp! * 1000) }))) return { status: "invalid" as const };
      return { status: "exchanged" as const, ...(await issueUserSession(user)) };
    },
    async logoutAccess(input: { kind: BrowserSessionKind; sessionId: string }) {
      await dependencies.sessionStore.revokeSession({ ...input, reason: "logout" });
      return { clearCookies: input.kind };
    },
    async logoutRefresh(input: { kind: BrowserSessionKind; refreshToken: string }) {
      const session = await dependencies.sessionStore.resolveRefreshSession({ ...input, includeInactive: true });
      if (session?.revokedAt) {
        await dependencies.sessionStore.rotateRefreshSession({ ...input, nextRefreshToken: dependencies.createRefreshToken() });
        return { clearCookies: input.kind, status: "reuse_detected" as const };
      }
      if (session) await dependencies.sessionStore.revokeSession({ kind: input.kind, sessionId: session.id, reason: "logout" });
      return { clearCookies: input.kind, status: "logged_out" as const };
    },
  };
}

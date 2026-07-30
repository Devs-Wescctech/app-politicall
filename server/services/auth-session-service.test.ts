import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, type UserPermissions } from "@shared/schema";
import {
  GLOBAL_ADMIN_PRINCIPAL_ID,
  createAuthSessionService,
  type AuthSessionServiceDependencies,
} from "./auth-session-service";

type User = {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: string;
  permissions: UserPermissions;
  password: string;
};

const user: User = {
  id: "user-a",
  accountId: "account-a",
  email: "user@example.test",
  name: "User A",
  role: "admin",
  permissions: DEFAULT_PERMISSIONS.admin,
  password: "stored-password",
};

function createDependencies(overrides: Partial<AuthSessionServiceDependencies> = {}) {
  let sequence = 0;
  const sessions = new Map<string, any>();
  const dependencies: AuthSessionServiceDependencies = {
    users: {
      findByEmail: async (email) => email === user.email ? user : undefined,
      findByIdAndAccount: async (userId, accountId) => userId === user.id && accountId === user.accountId ? user : undefined,
    },
    verifyPassword: async (password, hash) => password === "correct-password" && hash === "stored-password",
    getAdminPasswordHash: async () => "admin-password",
    sessionStore: {
      createSession: async (input) => {
        const session = {
          id: `session-${++sequence}`,
          familyId: `family-${sequence}`,
          accountId: input.scope.kind === "user" ? input.scope.accountId : null,
          userId: input.scope.kind === "user" ? input.scope.userId : null,
          globalAdminPrincipalId: input.scope.kind === "global_admin" ? input.scope.globalAdminPrincipalId : null,
          principalId: input.scope.kind === "user" ? input.scope.userId : input.scope.globalAdminPrincipalId,
          principalType: input.scope.kind,
          expiresAt: input.expiresAt,
          revokedAt: null,
        };
        sessions.set(input.refreshToken, session);
        return session;
      },
      resolveRefreshSession: async ({ kind, refreshToken }) => {
        const session = sessions.get(refreshToken);
        if (!session || session.principalType !== (kind === "user" ? "user" : "global_admin")) return undefined;
        return session;
      },
      rotateRefreshSession: async ({ kind, refreshToken, nextRefreshToken }) => {
        const source = await dependencies.sessionStore.resolveRefreshSession({ kind, refreshToken, includeInactive: true });
        if (!source) return { status: "missing" as const };
        if (source.revokedAt) return { status: "reuse_detected" as const };
        if (source.expiresAt <= new Date("2030-01-01T00:00:00.000Z")) return { status: "expired" as const };
        source.revokedAt = new Date("2030-01-01T00:00:00.000Z");
        const scope = kind === "user"
          ? { kind: "user" as const, accountId: source.accountId!, userId: source.userId! }
          : { kind: "global_admin" as const, globalAdminPrincipalId: source.globalAdminPrincipalId! };
        const replacement = await dependencies.sessionStore.createSession({
          scope,
          refreshToken: nextRefreshToken,
          expiresAt: source.expiresAt,
        });
        return { status: "rotated" as const, session: replacement };
      },
      revokeSession: async ({ sessionId }) => {
        for (const session of sessions.values()) {
          if (session.id === sessionId && !session.revokedAt) {
            session.revokedAt = new Date();
            return 1;
          }
        }
        return 0;
      },
      revokeSessionFamily: async () => 1,
      revokeUserSessions: async () => 1,
    },
    legacyExchangeStore: {
      claim: async () => true,
    },
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    createRefreshToken: () => `refresh-${++sequence}`,
    issueAccessToken: ({ sid, kind }) => `access:${kind}:${sid}`,
    issueCsrfToken: ({ sid, kind }) => `csrf:${kind}:${sid}`,
    ...overrides,
  };
  return { dependencies, sessions };
}

describe("auth session service", () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalExchange = process.env.ENABLE_BEARER_EXCHANGE;

  beforeEach(() => {
    process.env.SESSION_SECRET = "auth-session-service-test-secret";
    delete process.env.ENABLE_BEARER_EXCHANGE;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    if (originalExchange === undefined) delete process.env.ENABLE_BEARER_EXCHANGE;
    else process.env.ENABLE_BEARER_EXCHANGE = originalExchange;
  });

  it("issues a user cookie session and returns public user data without raw tokens", async () => {
    const { dependencies } = createDependencies();
    const result = await createAuthSessionService(dependencies).loginUser({
      email: user.email,
      password: "correct-password",
    });

    expect(result).toEqual({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions },
      cookies: expect.objectContaining({ kind: "user", refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
    });
  });

  it("issues an isolated global-admin session with the stable explicit principal", async () => {
    const { dependencies } = createDependencies({
      verifyPassword: async (password, hash) => password === "admin-password" && hash === "admin-password",
    });
    const result = await createAuthSessionService(dependencies).loginAdmin({ password: "admin-password" });

    expect(result).toEqual({ admin: true, cookies: expect.objectContaining({ kind: "admin" }) });
    expect(result.cookies.principalId).toBe(GLOBAL_ADMIN_PRINCIPAL_ID);
  });

  it("rotates only through a trusted refresh lookup and preserves the original family expiry", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const issued = await service.issueUserSession(user);
    const refreshToken = issued.cookies.refreshToken;

    const refreshed = await service.refresh({ kind: "user", refreshToken });

    expect(refreshed).toEqual({
      status: "refreshed",
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions },
      cookies: expect.objectContaining({ kind: "user", refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
    });
    expect(refreshed.cookies.refreshToken).not.toBe(refreshToken);
  });

  it("uses only the one-hour remaining family lifetime when rotating a shorter user session", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const issued = await service.issueUserSession(user, { expiresAt: new Date("2030-01-01T01:00:00.000Z") });

    const refreshed = await service.refresh({ kind: "user", refreshToken: issued.cookies.refreshToken });

    expect(refreshed).toEqual(expect.objectContaining({
      status: "refreshed",
      cookies: expect.objectContaining({ refreshMaxAgeMs: 60 * 60 * 1000 }),
    }));
  });

  it("rejects an expired refresh without accepting caller identity", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    await dependencies.sessionStore.createSession({
      scope: { kind: "user", accountId: user.accountId, userId: user.id },
      refreshToken: "expired-refresh",
      expiresAt: new Date("2029-12-31T23:59:59.999Z"),
    });

    await expect(service.refresh({ kind: "user", refreshToken: "expired-refresh" }))
      .resolves.toEqual({ status: "expired", clearCookies: "user" });
  });

  it("clears the affected kind and reports generic failure when a refresh is reused", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const issued = await service.issueAdminSession();
    dependencies.sessionStore.rotateRefreshSession = async () => ({ status: "reuse_detected" });
    const result = await service.refresh({ kind: "admin", refreshToken: issued.cookies.refreshToken });

    expect(result).toEqual({ status: "invalid", clearCookies: "admin" });
  });

  it("uses inactive refresh lookup records to detect replay after a previous rotation", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const issued = await service.issueUserSession(user);

    await expect(service.refresh({ kind: "user", refreshToken: issued.cookies.refreshToken }))
      .resolves.toEqual(expect.objectContaining({ status: "refreshed" }));
    await expect(service.refresh({ kind: "user", refreshToken: issued.cookies.refreshToken }))
      .resolves.toEqual({ status: "invalid", clearCookies: "user" });
  });

  it("keeps user and global-admin session families isolated", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const userSession = await service.issueUserSession(user);
    const adminSession = await service.issueAdminSession();

    await expect(service.refresh({ kind: "admin", refreshToken: userSession.cookies.refreshToken }))
      .resolves.toEqual({ status: "missing" });
    await expect(service.refresh({ kind: "user", refreshToken: adminSession.cookies.refreshToken }))
      .resolves.toEqual({ status: "missing" });
  });

  it("exchanges a valid legacy user JWT once, re-reading its exact user and account", async () => {
    process.env.ENABLE_BEARER_EXCHANGE = "true";
    const claim = async () => true;
    const { dependencies } = createDependencies({ legacyExchangeStore: { claim } });
    const token = jwt.sign({ userId: user.id, accountId: user.accountId, isAdmin: true }, process.env.SESSION_SECRET!, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const result = await createAuthSessionService(dependencies).exchangeLegacyBearer({ kind: "user", token });

    expect(result).toEqual({
      status: "exchanged",
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions },
      cookies: expect.objectContaining({ kind: "user" }),
    });
  });

  it("never promotes a legacy tenant user JWT to a global-admin session", async () => {
    process.env.ENABLE_BEARER_EXCHANGE = "true";
    const { dependencies } = createDependencies();
    const token = jwt.sign({ userId: user.id, accountId: user.accountId, isAdmin: true }, process.env.SESSION_SECRET!, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    await expect(createAuthSessionService(dependencies).exchangeLegacyBearer({ kind: "admin", token }))
      .resolves.toEqual({ status: "invalid" });
  });

  it("exchanges only the pure legacy global-admin JWT shape", async () => {
    process.env.ENABLE_BEARER_EXCHANGE = "true";
    const { dependencies } = createDependencies();
    const token = jwt.sign({ isAdmin: true }, process.env.SESSION_SECRET!, { algorithm: "HS256", expiresIn: "1h" });

    await expect(createAuthSessionService(dependencies).exchangeLegacyBearer({ kind: "admin", token }))
      .resolves.toEqual({ status: "exchanged", admin: true, cookies: expect.objectContaining({ kind: "admin" }) });
  });

  it("rejects malformed or expired legacy JWTs and user account mismatches", async () => {
    process.env.ENABLE_BEARER_EXCHANGE = "true";
    const expired = jwt.sign({ userId: user.id, accountId: user.accountId }, process.env.SESSION_SECRET!, {
      algorithm: "HS256", expiresIn: -1,
    });
    const mismatch = jwt.sign({ userId: user.id, accountId: "account-b" }, process.env.SESSION_SECRET!, {
      algorithm: "HS256", expiresIn: "1h",
    });
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);

    await expect(service.exchangeLegacyBearer({ kind: "user", token: "not-a-jwt" })).resolves.toEqual({ status: "invalid" });
    await expect(service.exchangeLegacyBearer({ kind: "user", token: expired })).resolves.toEqual({ status: "invalid" });
    await expect(service.exchangeLegacyBearer({ kind: "user", token: mismatch })).resolves.toEqual({ status: "invalid" });
  });

  it("requires the feature gate and atomically rejects a second legacy exchange", async () => {
    const token = jwt.sign({ userId: user.id, accountId: user.accountId }, process.env.SESSION_SECRET!, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const disabled = createAuthSessionService(createDependencies().dependencies);
    await expect(disabled.exchangeLegacyBearer({ kind: "user", token })).resolves.toEqual({ status: "disabled" });

    process.env.ENABLE_BEARER_EXCHANGE = "true";
    const { dependencies } = createDependencies({ legacyExchangeStore: { claim: async () => false } });
    await expect(createAuthSessionService(dependencies).exchangeLegacyBearer({ kind: "user", token }))
      .resolves.toEqual({ status: "invalid" });
  });

  it("makes logout idempotent for an access session or a trusted refresh session", async () => {
    const { dependencies } = createDependencies();
    const service = createAuthSessionService(dependencies);

    await expect(service.logoutAccess({ kind: "user", sessionId: "unknown" })).resolves.toEqual({ clearCookies: "user" });
    await expect(service.logoutRefresh({ kind: "admin", refreshToken: "unknown" })).resolves.toEqual({ clearCookies: "admin", status: "logged_out" });
  });

  it("revokes an existing access session before clearing its cookies", async () => {
    const { dependencies, sessions } = createDependencies();
    const service = createAuthSessionService(dependencies);
    const issued = await service.issueUserSession(user);

    await expect(service.logoutAccess({ kind: "user", sessionId: issued.cookies.sessionId }))
      .resolves.toEqual({ clearCookies: "user" });
    expect([...sessions.values()]).toContainEqual(expect.objectContaining({ id: issued.cookies.sessionId, revokedAt: expect.any(Date) }));
  });
});

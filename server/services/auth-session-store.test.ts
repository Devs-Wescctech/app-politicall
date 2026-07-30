import { describe, expect, it } from "vitest";
import { createAuthSessionStore, hashRefreshToken } from "./auth-session-store";

type SessionRow = {
  id: string;
  familyId: string;
  accountId: string | null;
  userId: string | null;
  globalAdminPrincipalId: string | null;
  principalType: "user" | "global_admin";
  refreshTokenHash: string;
  deviceHash: string | null;
  ipHash: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  rotatedFromSessionId: string | null;
  replacedBySessionId: string | null;
  createdAt: Date;
};

class InMemorySessionRepository {
  readonly sessions: SessionRow[] = [];
  transactionCalls = 0;

  async transaction<T>(work: (repository: this) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return work(this);
  }

  async insert(session: SessionRow): Promise<SessionRow> {
    this.sessions.push(session);
    return session;
  }

  async findByRefreshHash(scope: any, refreshTokenHash: string): Promise<SessionRow | undefined> {
    return this.sessions.find((session) =>
      session.refreshTokenHash === refreshTokenHash
      && session.accountId === (scope.kind === "user" ? scope.accountId : null)
      && session.userId === (scope.kind === "user" ? scope.userId : null)
      && session.globalAdminPrincipalId === (scope.kind === "global_admin" ? scope.globalAdminPrincipalId : null),
    );
  }

  async linkRotation(scope: any, sourceSessionId: string, replacementSessionId: string): Promise<void> {
    const session = this.findByScope(scope, sourceSessionId);
    if (session) session.replacedBySessionId = replacementSessionId;
  }

  async revokeById(scope: any, sessionId: string, reason: string, revokedAt: Date): Promise<number> {
    const session = this.findByScope(scope, sessionId);
    if (!session || session.revokedAt) return 0;
    session.revokedAt = revokedAt;
    session.revocationReason = reason;
    return 1;
  }

  async revokeByFamily(scope: any, familyId: string, reason: string, revokedAt: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions) {
      if (this.matchesScope(session, scope) && session.familyId === familyId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        session.revocationReason = reason;
        count += 1;
      }
    }
    return count;
  }

  async revokeByUser(accountId: string, userId: string, reason: string, revokedAt: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions) {
      if (session.accountId === accountId && session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        session.revocationReason = reason;
        count += 1;
      }
    }
    return count;
  }

  private findByScope(scope: any, sessionId: string): SessionRow | undefined {
    return this.sessions.find((session) => session.id === sessionId && this.matchesScope(session, scope));
  }

  private matchesScope(session: SessionRow, scope: any): boolean {
    return session.accountId === (scope.kind === "user" ? scope.accountId : null)
      && session.userId === (scope.kind === "user" ? scope.userId : null)
      && session.globalAdminPrincipalId === (scope.kind === "global_admin" ? scope.globalAdminPrincipalId : null);
  }
}

const tenantScope = { kind: "user" as const, accountId: "account-a", userId: "user-a" };
const otherTenantScope = { kind: "user" as const, accountId: "account-b", userId: "user-a" };
const expiresAt = new Date("2030-01-01T00:00:00.000Z");

function createStore() {
  const repository = new InMemorySessionRepository();
  return { repository, store: createAuthSessionStore(repository) };
}

describe("auth session store", () => {
  it("hashes refresh tokens deterministically without persisting the raw token", async () => {
    const { repository, store } = createStore();
    const session = await store.createSession({
      scope: tenantScope,
      refreshToken: "refresh-token-1",
      expiresAt,
      deviceHash: hashRefreshToken("device-1"),
      ipHash: hashRefreshToken("ip-1"),
    });

    expect(hashRefreshToken("refresh-token-1")).toBe("154f43e8c9b56a01e25dcba6f7aef62d23a3e91264e818124f6adf721d6a8e33");
    expect(session.refreshTokenHash).toBe(hashRefreshToken("refresh-token-1"));
    expect(JSON.stringify(repository.sessions)).not.toContain("refresh-token-1");
    expect(session.deviceHash).toHaveLength(64);
    expect(session.ipHash).toHaveLength(64);
  });

  it("does not find a tenant session through another account scope", async () => {
    const { store } = createStore();
    await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-2", expiresAt });

    await expect(store.findRefreshSession({ scope: otherTenantScope, refreshToken: "refresh-token-2" }))
      .resolves.toBeUndefined();
  });

  it("does not return expired or revoked sessions", async () => {
    const { store } = createStore();
    const expired = await store.createSession({
      scope: tenantScope,
      refreshToken: "expired-refresh-token",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const revoked = await store.createSession({ scope: tenantScope, refreshToken: "revoked-refresh-token", expiresAt });
    await store.revokeSession({ scope: tenantScope, sessionId: revoked.id, reason: "logout" });

    await expect(store.findRefreshSession({ scope: tenantScope, refreshToken: "expired-refresh-token" }))
      .resolves.toBeUndefined();
    await expect(store.findRefreshSession({ scope: tenantScope, refreshToken: "revoked-refresh-token" }))
      .resolves.toBeUndefined();
    expect(expired.revokedAt).toBeNull();
  });

  it("rotates a refresh session atomically and records the chain linkage", async () => {
    const { repository, store } = createStore();
    const original = await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-3", expiresAt });

    const result = await store.rotateSession({
      scope: tenantScope,
      refreshToken: "refresh-token-3",
      nextRefreshToken: "refresh-token-4",
      expiresAt,
    });

    expect(result.status).toBe("rotated");
    expect(result.session?.rotatedFromSessionId).toBe(original.id);
    expect(original.replacedBySessionId).toBe(result.session?.id);
    expect(original.revocationReason).toBe("rotated");
    expect(repository.transactionCalls).toBe(1);
  });

  it("revokes the entire family in the same transaction when a rotated token is reused", async () => {
    const { repository, store } = createStore();
    await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-5", expiresAt });
    const rotation = await store.rotateSession({
      scope: tenantScope,
      refreshToken: "refresh-token-5",
      nextRefreshToken: "refresh-token-6",
      expiresAt,
    });

    const reuse = await store.rotateSession({
      scope: tenantScope,
      refreshToken: "refresh-token-5",
      nextRefreshToken: "refresh-token-7",
      expiresAt,
    });

    expect(reuse).toEqual({ status: "reuse_detected" });
    expect(rotation.session?.revokedAt).not.toBeNull();
    expect(rotation.session?.revocationReason).toBe("reuse_detected");
    expect(repository.transactionCalls).toBe(2);
  });

  it("treats a lost conditional rotation update as token reuse before creating a successor", async () => {
    const { repository, store } = createStore();
    const original = await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-race", expiresAt });
    const revokeById = repository.revokeById.bind(repository);
    let simulateCompetingRotation = true;
    repository.revokeById = async (scope, sessionId, reason, revokedAt) => {
      if (simulateCompetingRotation && sessionId === original.id && reason === "rotated") {
        simulateCompetingRotation = false;
        await revokeById(scope, sessionId, reason, revokedAt);
        return 0;
      }
      return revokeById(scope, sessionId, reason, revokedAt);
    };

    await expect(store.rotateSession({
      scope: tenantScope,
      refreshToken: "refresh-token-race",
      nextRefreshToken: "refresh-token-race-successor",
      expiresAt,
    })).resolves.toEqual({ status: "reuse_detected" });

    expect(repository.sessions).toHaveLength(1);
    expect(original.revocationReason).toBe("rotated");
  });

  it("revokes one session on logout and all tenant sessions for a password change", async () => {
    const { repository, store } = createStore();
    const first = await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-8", expiresAt });
    const second = await store.createSession({ scope: tenantScope, refreshToken: "refresh-token-9", expiresAt });
    const otherUser = await store.createSession({
      scope: { kind: "user", accountId: "account-a", userId: "user-b" },
      refreshToken: "refresh-token-10",
      expiresAt,
    });

    await expect(store.revokeSession({ scope: tenantScope, sessionId: first.id, reason: "logout" }))
      .resolves.toBe(1);
    await expect(store.revokeUserSessions({ accountId: "account-a", userId: "user-a", reason: "password_change" }))
      .resolves.toBe(1);

    expect(first.revocationReason).toBe("logout");
    expect(second.revocationReason).toBe("password_change");
    expect(otherUser.revokedAt).toBeNull();
    expect(repository.sessions.every((session) => session.accountId !== "account-b")).toBe(true);
  });

  it("requires an explicit global-admin principal without inheriting a tenant", async () => {
    const { store } = createStore();
    const session = await store.createSession({
      scope: { kind: "global_admin", globalAdminPrincipalId: "admin-1" },
      refreshToken: "global-admin-refresh-token",
      expiresAt,
    });

    expect(session.accountId).toBeNull();
    expect(session.userId).toBeNull();
    expect(session.globalAdminPrincipalId).toBe("admin-1");
  });
});

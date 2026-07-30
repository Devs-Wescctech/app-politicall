import { describe, expect, it } from "vitest";
import { createAuthSessionStore, hashRefreshToken } from "./auth-session-store";

type SessionRow = {
  id: string;
  familyId: string;
  accountId: string | null;
  userId: string | null;
  globalAdminPrincipalId: string | null;
  principalId: string;
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
  lastUsedAt: Date | null;
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

  async linkRotation(scope: any, sourceSessionId: string, replacementSessionId: string, familyId: string): Promise<void> {
    const session = this.findByScope(scope, sourceSessionId);
    const replacement = this.findByScope(scope, replacementSessionId);
    if (!session || !replacement || session.familyId !== familyId || replacement.familyId !== familyId
      || replacement.rotatedFromSessionId !== sourceSessionId || session.replacedBySessionId) {
      throw new Error("Rotation replacement does not match source scope or family");
    }
    session.replacedBySessionId = replacementSessionId;
  }

  async markUsed(scope: any, sessionId: string, lastUsedAt: Date): Promise<number> {
    const session = this.findByScope(scope, sessionId);
    if (!session) throw new Error("Session not found");
    session.lastUsedAt = lastUsedAt;
    return 1;
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
const defaultNow = new Date("2029-12-31T00:00:00.000Z");
const expiresAt = new Date("2030-01-01T00:00:00.000Z");

function createStore(now = defaultNow) {
  const repository = new InMemorySessionRepository();
  return { repository, store: createAuthSessionStore(repository, { now: () => now }) };
}

describe("auth session store", () => {
  it("hashes refresh tokens deterministically without persisting the raw token", async () => {
    const { repository, store } = createStore();
    const hexLookingRawDevice = "a".repeat(64);
    const session = await store.createSession({
      scope: tenantScope,
      refreshToken: "refresh-token-1",
      expiresAt,
      deviceMetadata: hexLookingRawDevice,
      ipMetadata: "192.0.2.1",
    });

    expect(hashRefreshToken("refresh-token-1")).toBe("154f43e8c9b56a01e25dcba6f7aef62d23a3e91264e818124f6adf721d6a8e33");
    expect(session.refreshTokenHash).toBe(hashRefreshToken("refresh-token-1"));
    expect(JSON.stringify(repository.sessions)).not.toContain("refresh-token-1");
    expect(session.deviceHash).toBe(hashRefreshToken(hexLookingRawDevice));
    expect(session.deviceHash).not.toBe(hexLookingRawDevice);
    expect(session.ipHash).toBe(hashRefreshToken("192.0.2.1"));
  });

  it("enforces injected maximum lifetimes while allowing shorter user and global-admin sessions", async () => {
    const clock = new Date("2030-01-01T00:00:00.000Z");
    const repository = new InMemorySessionRepository();
    const store = createAuthSessionStore(repository, { now: () => clock });

    await expect(store.createSession({
      scope: tenantScope,
      refreshToken: "user-too-long",
      expiresAt: new Date("2030-01-08T00:00:00.001Z"),
    })).rejects.toThrow("7 days");
    await expect(store.createSession({
      scope: tenantScope,
      refreshToken: "user-valid",
      expiresAt: new Date("2030-01-07T23:59:59.999Z"),
    })).resolves.toMatchObject({ refreshTokenHash: hashRefreshToken("user-valid") });
    await expect(store.createSession({
      scope: { kind: "global_admin", globalAdminPrincipalId: "admin-1" },
      refreshToken: "admin-too-long",
      expiresAt: new Date("2030-01-01T04:00:00.001Z"),
    })).rejects.toThrow("4 hours");
    await expect(store.createSession({
      scope: { kind: "global_admin", globalAdminPrincipalId: "admin-1" },
      refreshToken: "admin-valid",
      expiresAt: new Date("2030-01-01T03:59:59.999Z"),
    })).resolves.toMatchObject({ refreshTokenHash: hashRefreshToken("admin-valid") });
  });

  it("rejects oversized raw metadata and applies the same lifetime limit to rotations", async () => {
    const clock = new Date("2030-01-01T00:00:00.000Z");
    const repository = new InMemorySessionRepository();
    const store = createAuthSessionStore(repository, { now: () => clock });
    await expect(store.createSession({
      scope: tenantScope,
      refreshToken: "metadata-too-long",
      expiresAt: new Date("2030-01-01T01:00:00.000Z"),
      deviceMetadata: "x".repeat(1025),
    })).rejects.toThrow("deviceMetadata");
    await expect(store.createSession({
      scope: tenantScope,
      refreshToken: "t".repeat(4097),
      expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    })).rejects.toThrow("refreshToken");

    await store.createSession({
      scope: tenantScope,
      refreshToken: "rotation-limit-source",
      expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    });
    await expect(store.rotateSession({
      scope: tenantScope,
      refreshToken: "rotation-limit-source",
      nextRefreshToken: "rotation-limit-next",
      expiresAt: new Date("2030-01-08T00:00:00.001Z"),
    })).rejects.toThrow("7 days");
    expect(repository.sessions).toHaveLength(1);
    expect(repository.sessions[0]?.revokedAt).toBeNull();

    const globalScope = { kind: "global_admin" as const, globalAdminPrincipalId: "admin-2" };
    await store.createSession({
      scope: globalScope,
      refreshToken: "global-rotation-source",
      expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    });
    await expect(store.rotateSession({
      scope: globalScope,
      refreshToken: "global-rotation-source",
      nextRefreshToken: "global-rotation-next",
      expiresAt: new Date("2030-01-01T04:00:00.001Z"),
    })).rejects.toThrow("4 hours");
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
    expect(original.lastUsedAt).toBeNull();

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
    expect(original.lastUsedAt).toEqual(defaultNow);
    expect(result.session?.lastUsedAt).toBeNull();
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

  it("makes every tenant mutation non-vacuous across account boundaries", async () => {
    const { repository, store } = createStore();
    const tenantA = await store.createSession({ scope: tenantScope, refreshToken: "tenant-a-session", expiresAt });
    const tenantB = await store.createSession({
      scope: { kind: "user", accountId: "account-b", userId: "user-b" },
      refreshToken: "tenant-b-session",
      expiresAt,
    });

    await expect(store.revokeSession({ scope: tenantScope, sessionId: tenantB.id, reason: "logout" })).resolves.toBe(0);
    await expect(store.revokeSessionFamily({ scope: tenantScope, familyId: tenantB.familyId, reason: "security" }))
      .resolves.toBe(0);
    await expect(store.revokeUserSessions({ accountId: "account-a", userId: "user-b", reason: "password_change" }))
      .resolves.toBe(0);

    expect(tenantA.revokedAt).toBeNull();
    expect(tenantB.revokedAt).toBeNull();
    expect(repository.sessions).toHaveLength(2);
  });

  it("rejects rotation linkage when the successor is from another family or principal", async () => {
    const { repository, store } = createStore();
    const predecessor = await store.createSession({ scope: tenantScope, refreshToken: "link-source", expiresAt });
    const crossFamily = await store.createSession({ scope: tenantScope, refreshToken: "link-cross-family", expiresAt });
    const crossPrincipal = await store.createSession({
      scope: { kind: "user", accountId: "account-a", userId: "user-b" },
      refreshToken: "link-cross-principal",
      expiresAt,
    });

    await expect(repository.linkRotation(tenantScope, predecessor.id, crossFamily.id, predecessor.familyId))
      .rejects.toThrow("replacement");
    await expect(repository.linkRotation(tenantScope, predecessor.id, crossPrincipal.id, predecessor.familyId))
      .rejects.toThrow("replacement");
    expect(predecessor.replacedBySessionId).toBeNull();
  });

  it("requires an explicit global-admin principal without inheriting a tenant", async () => {
    const { store } = createStore();
    const session = await store.createSession({
      scope: { kind: "global_admin", globalAdminPrincipalId: "admin-1" },
      refreshToken: "global-admin-refresh-token",
      expiresAt: new Date("2029-12-31T03:00:00.000Z"),
    });

    expect(session.accountId).toBeNull();
    expect(session.userId).toBeNull();
    expect(session.globalAdminPrincipalId).toBe("admin-1");
  });
});

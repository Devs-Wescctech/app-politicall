import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { authSessions } from "@shared/schema";

export type AuthSessionScope =
  | { kind: "user"; accountId: string; userId: string }
  | { kind: "global_admin"; globalAdminPrincipalId: string };

export type AuthSessionRecord = {
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

export interface AuthSessionRepository {
  transaction<T>(work: (repository: AuthSessionRepository) => Promise<T>): Promise<T>;
  insert(session: AuthSessionRecord): Promise<AuthSessionRecord>;
  findByRefreshHash(scope: AuthSessionScope, refreshTokenHash: string): Promise<AuthSessionRecord | undefined>;
  linkRotation(scope: AuthSessionScope, sourceSessionId: string, replacementSessionId: string): Promise<void>;
  revokeById(scope: AuthSessionScope, sessionId: string, reason: string, revokedAt: Date): Promise<number>;
  revokeByFamily(scope: AuthSessionScope, familyId: string, reason: string, revokedAt: Date): Promise<number>;
  revokeByUser(accountId: string, userId: string, reason: string, revokedAt: Date): Promise<number>;
}

export type CreateSessionInput = {
  scope: AuthSessionScope;
  refreshToken: string;
  expiresAt: Date;
  deviceHash?: string;
  ipHash?: string;
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertScope(scope: AuthSessionScope): void {
  if (scope.kind === "user") {
    if (!scope.accountId || !scope.userId) throw new Error("Tenant sessions require accountId and userId");
    return;
  }
  if (!scope.globalAdminPrincipalId) throw new Error("Global-admin sessions require an explicit principal");
}

function assertMetadataHash(value: string | undefined, name: string): void {
  if (value !== undefined && !SHA256_HEX.test(value)) {
    throw new Error(`${name} must be a SHA-256 hex hash`);
  }
}

function buildSession(input: CreateSessionInput, options: {
  familyId?: string;
  rotatedFromSessionId?: string;
  createdAt?: Date;
} = {}): AuthSessionRecord {
  assertScope(input.scope);
  assertMetadataHash(input.deviceHash, "deviceHash");
  assertMetadataHash(input.ipHash, "ipHash");

  const userScope = input.scope.kind === "user" ? input.scope : undefined;
  const adminScope = input.scope.kind === "global_admin" ? input.scope : undefined;
  return {
    id: randomUUID(),
    familyId: options.familyId ?? randomUUID(),
    accountId: userScope?.accountId ?? null,
    userId: userScope?.userId ?? null,
    globalAdminPrincipalId: adminScope?.globalAdminPrincipalId ?? null,
    principalType: userScope ? "user" : "global_admin",
    refreshTokenHash: hashRefreshToken(input.refreshToken),
    deviceHash: input.deviceHash ?? null,
    ipHash: input.ipHash ?? null,
    expiresAt: input.expiresAt,
    revokedAt: null,
    revocationReason: null,
    rotatedFromSessionId: options.rotatedFromSessionId ?? null,
    replacedBySessionId: null,
    createdAt: options.createdAt ?? new Date(),
  };
}

export function createAuthSessionStore(repository: AuthSessionRepository) {
  return {
    async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
      return repository.insert(buildSession(input));
    },

    async findRefreshSession(input: { scope: AuthSessionScope; refreshToken: string; now?: Date }) {
      assertScope(input.scope);
      const session = await repository.findByRefreshHash(input.scope, hashRefreshToken(input.refreshToken));
      if (!session || session.revokedAt || session.expiresAt <= (input.now ?? new Date())) return undefined;
      return session;
    },

    async rotateSession(input: CreateSessionInput & { nextRefreshToken: string }) {
      assertScope(input.scope);
      return repository.transaction(async (transaction) => {
        const now = new Date();
        const source = await transaction.findByRefreshHash(input.scope, hashRefreshToken(input.refreshToken));
        if (!source) return { status: "missing" as const };
        if (source.revokedAt) {
          await transaction.revokeByFamily(input.scope, source.familyId, "reuse_detected", now);
          return { status: "reuse_detected" as const };
        }
        if (source.expiresAt <= now) {
          await transaction.revokeById(input.scope, source.id, "expired", now);
          return { status: "expired" as const };
        }

        const session = buildSession({
          ...input,
          refreshToken: input.nextRefreshToken,
        }, {
          familyId: source.familyId,
          rotatedFromSessionId: source.id,
          createdAt: now,
        });
        const revoked = await transaction.revokeById(input.scope, source.id, "rotated", now);
        if (revoked === 0) {
          await transaction.revokeByFamily(input.scope, source.familyId, "reuse_detected", now);
          return { status: "reuse_detected" as const };
        }
        const inserted = await transaction.insert(session);
        await transaction.linkRotation(input.scope, source.id, inserted.id);
        return { status: "rotated" as const, session: inserted };
      });
    },

    async revokeSession(input: { scope: AuthSessionScope; sessionId: string; reason: string; now?: Date }) {
      assertScope(input.scope);
      return repository.revokeById(input.scope, input.sessionId, input.reason, input.now ?? new Date());
    },

    async revokeSessionFamily(input: { scope: AuthSessionScope; familyId: string; reason: string; now?: Date }) {
      assertScope(input.scope);
      return repository.revokeByFamily(input.scope, input.familyId, input.reason, input.now ?? new Date());
    },

    async revokeUserSessions(input: { accountId: string; userId: string; reason: string; now?: Date }) {
      if (!input.accountId || !input.userId) throw new Error("Tenant session revocation requires accountId and userId");
      return repository.revokeByUser(input.accountId, input.userId, input.reason, input.now ?? new Date());
    },
  };
}

function scopeFilter(scope: AuthSessionScope) {
  if (scope.kind === "user") {
    return and(eq(authSessions.accountId, scope.accountId), eq(authSessions.userId, scope.userId));
  }
  return and(
    eq(authSessions.principalType, "global_admin"),
    eq(authSessions.globalAdminPrincipalId, scope.globalAdminPrincipalId),
    isNull(authSessions.accountId),
    isNull(authSessions.userId),
  );
}

export function createDrizzleAuthSessionRepository(database: any): AuthSessionRepository {
  const repository: AuthSessionRepository = {
    async transaction<T>(work: (transaction: AuthSessionRepository) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction: any) => work(createDrizzleAuthSessionRepository(transaction)));
    },

    async insert(session) {
      const [inserted] = await database.insert(authSessions).values(session).returning();
      return inserted;
    },

    async findByRefreshHash(scope, refreshTokenHash) {
      const [session] = await database.select().from(authSessions).where(and(
        scopeFilter(scope),
        eq(authSessions.refreshTokenHash, refreshTokenHash),
      ));
      return session;
    },

    async linkRotation(scope, sourceSessionId, replacementSessionId) {
      await database.update(authSessions).set({ replacedBySessionId: replacementSessionId }).where(and(
        scopeFilter(scope),
        eq(authSessions.id, sourceSessionId),
      ));
    },

    async revokeById(scope, sessionId, reason, revokedAt) {
      const rows = await database.update(authSessions).set({
        revokedAt,
        revocationReason: reason,
      }).where(and(
        scopeFilter(scope),
        eq(authSessions.id, sessionId),
        isNull(authSessions.revokedAt),
      )).returning({ id: authSessions.id });
      return rows.length;
    },

    async revokeByFamily(scope, familyId, reason, revokedAt) {
      const rows = await database.update(authSessions).set({
        revokedAt,
        revocationReason: reason,
      }).where(and(
        scopeFilter(scope),
        eq(authSessions.familyId, familyId),
        isNull(authSessions.revokedAt),
      )).returning({ id: authSessions.id });
      return rows.length;
    },

    async revokeByUser(accountId, userId, reason, revokedAt) {
      const rows = await database.update(authSessions).set({
        revokedAt,
        revocationReason: reason,
      }).where(and(
        eq(authSessions.accountId, accountId),
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
      )).returning({ id: authSessions.id });
      return rows.length;
    },
  };
  return repository;
}

let runtimeStore: ReturnType<typeof createAuthSessionStore> | undefined;

async function getRuntimeStore() {
  if (!runtimeStore) {
    const { db } = await import("../db");
    runtimeStore = createAuthSessionStore(createDrizzleAuthSessionRepository(db));
  }
  return runtimeStore;
}

export async function createSession(input: CreateSessionInput) {
  return (await getRuntimeStore()).createSession(input);
}

export async function findRefreshSession(input: { scope: AuthSessionScope; refreshToken: string; now?: Date }) {
  return (await getRuntimeStore()).findRefreshSession(input);
}

export async function rotateSession(input: CreateSessionInput & { nextRefreshToken: string }) {
  return (await getRuntimeStore()).rotateSession(input);
}

export async function revokeSession(input: { scope: AuthSessionScope; sessionId: string; reason: string; now?: Date }) {
  return (await getRuntimeStore()).revokeSession(input);
}

export async function revokeSessionFamily(input: { scope: AuthSessionScope; familyId: string; reason: string; now?: Date }) {
  return (await getRuntimeStore()).revokeSessionFamily(input);
}

export async function revokeUserSessions(input: { accountId: string; userId: string; reason: string; now?: Date }) {
  return (await getRuntimeStore()).revokeUserSessions(input);
}

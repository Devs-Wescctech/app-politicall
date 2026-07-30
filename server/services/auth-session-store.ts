import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authSessions } from "@shared/schema";

export type AuthSessionScope =
  | { kind: "user"; accountId: string; userId: string }
  | { kind: "global_admin"; globalAdminPrincipalId: string };

export type AuthSessionKind = "user" | "global_admin";

export type AuthSessionRecord = {
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

export interface AuthSessionRepository {
  transaction<T>(work: (repository: AuthSessionRepository) => Promise<T>): Promise<T>;
  lockPrincipal(scope: AuthSessionScope): Promise<void>;
  insert(session: AuthSessionRecord): Promise<AuthSessionRecord>;
  findByRefreshHash(scope: AuthSessionScope, refreshTokenHash: string): Promise<AuthSessionRecord | undefined>;
  findByRefreshHashAndKind?(kind: AuthSessionKind, refreshTokenHash: string): Promise<AuthSessionRecord | undefined>;
  findByIdAndKind?(kind: AuthSessionKind, sessionId: string): Promise<AuthSessionRecord | undefined>;
  linkRotation(scope: AuthSessionScope, sourceSessionId: string, replacementSessionId: string, familyId: string): Promise<void>;
  markUsed(scope: AuthSessionScope, sessionId: string, lastUsedAt: Date): Promise<number>;
  revokeById(scope: AuthSessionScope, sessionId: string, reason: string, revokedAt: Date): Promise<number>;
  revokeByFamily(scope: AuthSessionScope, familyId: string, reason: string, revokedAt: Date): Promise<number>;
  revokeByUser(accountId: string, userId: string, reason: string, revokedAt: Date): Promise<number>;
  revokeByGlobalAdmin(globalAdminPrincipalId: string, reason: string, revokedAt: Date): Promise<number>;
}

export type CreateSessionInput = {
  scope: AuthSessionScope;
  refreshToken: string;
  expiresAt: Date;
  deviceMetadata?: string;
  ipMetadata?: string;
};

export const USER_REFRESH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;
export const MAX_REFRESH_TOKEN_BYTES = 4096;
export const MAX_DEVICE_METADATA_BYTES = 1024;
export const MAX_IP_METADATA_BYTES = 256;

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// This key is derived only from stable principal identifiers, never credentials.
export function principalLockKey(scope: AuthSessionScope): string {
  const principal = scope.kind === "user"
    ? `user:${scope.accountId}:${scope.userId}`
    : `global_admin:${scope.globalAdminPrincipalId}`;
  return createHash("sha256").update(`politicall:auth-session:${principal}`).digest().readBigInt64BE(0).toString();
}

function assertScope(scope: AuthSessionScope): void {
  if (scope.kind === "user") {
    if (!scope.accountId || !scope.userId) throw new Error("Tenant sessions require accountId and userId");
    return;
  }
  if (!scope.globalAdminPrincipalId) throw new Error("Global-admin sessions require an explicit principal");
}

function scopeFromRecord(session: AuthSessionRecord): AuthSessionScope | undefined {
  if (session.principalType === "user" && session.accountId && session.userId) {
    return { kind: "user", accountId: session.accountId, userId: session.userId };
  }
  if (session.principalType === "global_admin" && session.globalAdminPrincipalId) {
    return { kind: "global_admin", globalAdminPrincipalId: session.globalAdminPrincipalId };
  }
  return undefined;
}

function assertBounded(value: string | undefined, maximumBytes: number, name: string): void {
  if (value !== undefined && Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${name} exceeds ${maximumBytes} bytes`);
  }
}

function buildSession(input: CreateSessionInput, options: {
  familyId?: string;
  rotatedFromSessionId?: string;
  now: Date;
}): AuthSessionRecord {
  assertScope(input.scope);
  assertBounded(input.refreshToken, MAX_REFRESH_TOKEN_BYTES, "refreshToken");
  assertBounded(input.deviceMetadata, MAX_DEVICE_METADATA_BYTES, "deviceMetadata");
  assertBounded(input.ipMetadata, MAX_IP_METADATA_BYTES, "ipMetadata");
  const maximumAge = input.scope.kind === "user"
    ? USER_REFRESH_SESSION_MAX_AGE_MS
    : GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS;
  if (input.expiresAt.getTime() - options.now.getTime() > maximumAge) {
    throw new Error(`Refresh session expiry exceeds ${input.scope.kind === "user" ? "7 days" : "4 hours"}`);
  }

  const userScope = input.scope.kind === "user" ? input.scope : undefined;
  const adminScope = input.scope.kind === "global_admin" ? input.scope : undefined;
  return {
    id: randomUUID(),
    familyId: options.familyId ?? randomUUID(),
    accountId: userScope?.accountId ?? null,
    userId: userScope?.userId ?? null,
    globalAdminPrincipalId: adminScope?.globalAdminPrincipalId ?? null,
    principalId: userScope?.userId ?? adminScope!.globalAdminPrincipalId,
    principalType: userScope ? "user" : "global_admin",
    refreshTokenHash: hashRefreshToken(input.refreshToken),
    deviceHash: input.deviceMetadata ? hashRefreshToken(input.deviceMetadata) : null,
    ipHash: input.ipMetadata ? hashRefreshToken(input.ipMetadata) : null,
    expiresAt: input.expiresAt,
    revokedAt: null,
    revocationReason: null,
    rotatedFromSessionId: options.rotatedFromSessionId ?? null,
    replacedBySessionId: null,
    createdAt: options.now,
    lastUsedAt: null,
  };
}

export function createAuthSessionStore(
  repository: AuthSessionRepository,
  options: { now?: () => Date } = {},
) {
  const now = options.now ?? (() => new Date());
  const withPrincipalLock = <T>(scope: AuthSessionScope, work: (transaction: AuthSessionRepository) => Promise<T>) =>
    repository.transaction(async (transaction) => {
      await transaction.lockPrincipal(scope);
      return work(transaction);
    });

  return {
    async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
      assertScope(input.scope);
      return withPrincipalLock(input.scope, (transaction) => transaction.insert(buildSession(input, { now: now() })));
    },

    async findRefreshSession(input: { scope: AuthSessionScope; refreshToken: string }) {
      assertScope(input.scope);
      const session = await repository.findByRefreshHash(input.scope, hashRefreshToken(input.refreshToken));
      if (!session || session.revokedAt || session.expiresAt <= now()) return undefined;
      return session;
    },

    async resolveRefreshSession(input: { kind: "user" | "admin"; refreshToken: string; includeInactive?: boolean }) {
      const kind: AuthSessionKind = input.kind === "user" ? "user" : "global_admin";
      const session = await repository.findByRefreshHashAndKind?.(kind, hashRefreshToken(input.refreshToken));
      if (!session) return undefined;
      if (!input.includeInactive && (session.revokedAt || session.expiresAt <= now())) return undefined;
      return session;
    },

    async rotateRefreshSession(input: { kind: "user" | "admin"; refreshToken: string; nextRefreshToken: string }) {
      const kind: AuthSessionKind = input.kind === "user" ? "user" : "global_admin";
      const rotationNow = now();
      assertBounded(input.refreshToken, MAX_REFRESH_TOKEN_BYTES, "refreshToken");
      assertBounded(input.nextRefreshToken, MAX_REFRESH_TOKEN_BYTES, "refreshToken");
      const observed = await repository.findByRefreshHashAndKind?.(kind, hashRefreshToken(input.refreshToken));
      const observedScope = observed && scopeFromRecord(observed);
      if (!observedScope) return { status: "missing" as const };
      return withPrincipalLock(observedScope, async (transaction) => {
        const source = await transaction.findByRefreshHashAndKind?.(kind, hashRefreshToken(input.refreshToken));
        if (!source) return { status: "missing" as const };
        const scope = scopeFromRecord(source);
        if (!scope || principalLockKey(scope) !== principalLockKey(observedScope)) return { status: "missing" as const };
        if (source.revokedAt) {
          await transaction.revokeByFamily(scope, source.familyId, "reuse_detected", rotationNow);
          return { status: "reuse_detected" as const };
        }
        if (source.expiresAt <= rotationNow) {
          await transaction.revokeById(scope, source.id, "expired", rotationNow);
          return { status: "expired" as const };
        }
        const replacement = buildSession({
          scope,
          refreshToken: input.nextRefreshToken,
          expiresAt: source.expiresAt,
        }, { familyId: source.familyId, rotatedFromSessionId: source.id, now: rotationNow });
        await transaction.markUsed(scope, source.id, rotationNow);
        if (await transaction.revokeById(scope, source.id, "rotated", rotationNow) === 0) {
          await transaction.revokeByFamily(scope, source.familyId, "reuse_detected", rotationNow);
          return { status: "reuse_detected" as const };
        }
        const session = await transaction.insert(replacement);
        await transaction.linkRotation(scope, source.id, session.id, source.familyId);
        return { status: "rotated" as const, session };
      });
    },

    async revokeSessionById(input: { kind: "user" | "admin"; sessionId: string; reason: string; now?: Date }) {
      const kind: AuthSessionKind = input.kind === "user" ? "user" : "global_admin";
      const observed = await repository.findByIdAndKind?.(kind, input.sessionId);
      const observedScope = observed && scopeFromRecord(observed);
      if (!observedScope) return 0;
      return withPrincipalLock(observedScope, async (transaction) => {
        const session = await transaction.findByIdAndKind?.(kind, input.sessionId);
        const scope = session && scopeFromRecord(session);
        return scope && principalLockKey(scope) === principalLockKey(observedScope)
          ? transaction.revokeByFamily(scope, session.familyId, input.reason, input.now ?? now())
          : 0;
      });
    },

    async resolveAccessSession(input: { kind: "user" | "admin"; sessionId: string }) {
      const kind: AuthSessionKind = input.kind === "user" ? "user" : "global_admin";
      const session = await repository.findByIdAndKind?.(kind, input.sessionId);
      return !session || session.revokedAt || session.expiresAt <= now() ? undefined : session;
    },

    async revokeSession(input: { scope: AuthSessionScope; sessionId: string; reason: string; now?: Date }) {
      assertScope(input.scope);
      return withPrincipalLock(input.scope, async (transaction) => {
        const kind: AuthSessionKind = input.scope.kind === "user" ? "user" : "global_admin";
        const session = await transaction.findByIdAndKind?.(kind, input.sessionId);
        if (!session || session.familyId.length === 0 || !scopeFromRecord(session)
          || principalLockKey(scopeFromRecord(session)!) !== principalLockKey(input.scope)) return 0;
        return transaction.revokeByFamily(input.scope, session.familyId, input.reason, input.now ?? now());
      });
    },

    async revokeSessionFamily(input: { scope: AuthSessionScope; familyId: string; reason: string; now?: Date }) {
      assertScope(input.scope);
      return withPrincipalLock(input.scope, (transaction) => transaction.revokeByFamily(input.scope, input.familyId, input.reason, input.now ?? now()));
    },

    async revokeUserSessions(input: { accountId: string; userId: string; reason: string; now?: Date }) {
      if (!input.accountId || !input.userId) throw new Error("Tenant session revocation requires accountId and userId");
      const scope: AuthSessionScope = { kind: "user", accountId: input.accountId, userId: input.userId };
      return withPrincipalLock(scope, (transaction) => transaction.revokeByUser(input.accountId, input.userId, input.reason, input.now ?? now()));
    },

    async revokeGlobalAdminSessions(input: { globalAdminPrincipalId: string; reason: string; now?: Date }) {
      if (!input.globalAdminPrincipalId) throw new Error("Global-admin session revocation requires an explicit principal");
      const scope: AuthSessionScope = { kind: "global_admin", globalAdminPrincipalId: input.globalAdminPrincipalId };
      return withPrincipalLock(scope, (transaction) => transaction.revokeByGlobalAdmin(input.globalAdminPrincipalId, input.reason, input.now ?? now()));
    },
  };
}

function scopeFilter(scope: AuthSessionScope) {
  if (scope.kind === "user") {
    return and(
      eq(authSessions.accountId, scope.accountId),
      eq(authSessions.userId, scope.userId),
      eq(authSessions.principalId, scope.userId),
    );
  }
  return and(
    eq(authSessions.principalType, "global_admin"),
    eq(authSessions.globalAdminPrincipalId, scope.globalAdminPrincipalId),
    eq(authSessions.principalId, scope.globalAdminPrincipalId),
    isNull(authSessions.accountId),
    isNull(authSessions.userId),
  );
}

function kindFilter(kind: AuthSessionKind) {
  return kind === "user"
    ? eq(authSessions.principalType, "user")
    : eq(authSessions.principalType, "global_admin");
}

export function createDrizzleAuthSessionRepository(database: any): AuthSessionRepository {
  const repository: AuthSessionRepository = {
    async transaction<T>(work: (transaction: AuthSessionRepository) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction: any) => work(createDrizzleAuthSessionRepository(transaction)));
    },

    async lockPrincipal(scope) {
      await database.execute(sql`SELECT pg_advisory_xact_lock(${principalLockKey(scope)}::bigint)`);
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

    async findByRefreshHashAndKind(kind, refreshTokenHash) {
      const [session] = await database.select().from(authSessions).where(and(
        kindFilter(kind),
        eq(authSessions.refreshTokenHash, refreshTokenHash),
      ));
      return session;
    },

    async findByIdAndKind(kind, sessionId) {
      const [session] = await database.select().from(authSessions).where(and(
        kindFilter(kind),
        eq(authSessions.id, sessionId),
      ));
      return session;
    },

    async linkRotation(scope, sourceSessionId, replacementSessionId, familyId) {
      const [replacement] = await database.select({ id: authSessions.id }).from(authSessions).where(and(
        scopeFilter(scope),
        eq(authSessions.id, replacementSessionId),
        eq(authSessions.familyId, familyId),
        eq(authSessions.rotatedFromSessionId, sourceSessionId),
      ));
      if (!replacement) throw new Error("Rotation replacement does not match source scope or family");
      const linked = await database.update(authSessions).set({ replacedBySessionId: replacementSessionId }).where(and(
        scopeFilter(scope),
        eq(authSessions.id, sourceSessionId),
        eq(authSessions.familyId, familyId),
        isNull(authSessions.replacedBySessionId),
      )).returning({ id: authSessions.id });
      if (linked.length !== 1) throw new Error("Rotation predecessor already has a replacement");
    },

    async markUsed(scope, sessionId, lastUsedAt) {
      const rows = await database.update(authSessions).set({ lastUsedAt }).where(and(
        scopeFilter(scope),
        eq(authSessions.id, sessionId),
        isNull(authSessions.revokedAt),
      )).returning({ id: authSessions.id });
      return rows.length;
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

    async revokeByGlobalAdmin(globalAdminPrincipalId, reason, revokedAt) {
      const rows = await database.update(authSessions).set({ revokedAt, revocationReason: reason }).where(and(
        eq(authSessions.principalType, "global_admin"),
        eq(authSessions.globalAdminPrincipalId, globalAdminPrincipalId),
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

export async function findRefreshSession(input: { scope: AuthSessionScope; refreshToken: string }) {
  return (await getRuntimeStore()).findRefreshSession(input);
}

export async function resolveRefreshSession(input: { kind: "user" | "admin"; refreshToken: string; includeInactive?: boolean }) {
  return (await getRuntimeStore()).resolveRefreshSession(input);
}

export async function rotateRefreshSession(input: { kind: "user" | "admin"; refreshToken: string; nextRefreshToken: string }) {
  return (await getRuntimeStore()).rotateRefreshSession(input);
}

export async function revokeSessionById(input: { kind: "user" | "admin"; sessionId: string; reason: string; now?: Date }) {
  return (await getRuntimeStore()).revokeSessionById(input);
}

export async function resolveAccessSession(input: { kind: "user" | "admin"; sessionId: string }) {
  return (await getRuntimeStore()).resolveAccessSession(input);
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

export async function revokeGlobalAdminSessions(input: { globalAdminPrincipalId: string; reason: string; now?: Date }) {
  return (await getRuntimeStore()).revokeGlobalAdminSessions(input);
}

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import * as schema from "@shared/schema";
import {
  createAuthSessionStore,
  createDrizzleAuthSessionRepository,
  hashRefreshToken,
} from "./auth-session-store";
import { createAuthPasswordMutationService } from "./auth-password-mutations";
import { runProductionMigrations } from "./production-migrations";

const integrationDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const integrationIt = integrationDatabaseUrl ? it : it.skip;
const rootDir = process.cwd();

function poolOptions(connectionString: string) {
  return {
    connectionString,
    ssl: /sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : false,
  };
}

describe("auth session store PostgreSQL integration", () => {
  integrationIt("enforces database session integrity and preserves rotation transactions [MIGRATION_TEST_DATABASE_URL]", async () => {
    const adminConnectionString = process.env.MIGRATION_TEST_DATABASE_URL;
    if (!adminConnectionString) throw new Error("MIGRATION_TEST_DATABASE_URL is required");

    const databaseName = `politicall_auth_session_test_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool(poolOptions(adminConnectionString));
    const isolatedUrl = new URL(adminConnectionString);
    isolatedUrl.pathname = `/${databaseName}`;
    let pool: Pool | undefined;
    let databaseCreated = false;

    try {
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);
      databaseCreated = true;
      pool = new Pool(poolOptions(isolatedUrl.toString()));
      await runProductionMigrations(pool, rootDir);

      await pool.query(`
        INSERT INTO accounts (id, name) VALUES ('account-a', 'Account A'), ('account-b', 'Account B');
        INSERT INTO users (id, account_id, email, password, name) VALUES
          ('user-a', 'account-a', 'user-a@example.test', 'hash', 'User A'),
          ('user-b', 'account-b', 'user-b@example.test', 'hash', 'User B');
      `);

      const clock = new Date("2030-01-01T00:00:00.000Z");
      const repository = createDrizzleAuthSessionRepository(drizzle(pool, { schema }));
      const store = createAuthSessionStore(repository, { now: () => clock });
      const scope = { kind: "user" as const, accountId: "account-a", userId: "user-a" };
      const expiry = new Date("2030-01-01T01:00:00.000Z");

      const source = await store.createSession({
        scope,
        refreshToken: "source-token",
        expiresAt: expiry,
        deviceMetadata: "a".repeat(64),
        ipMetadata: "192.0.2.10",
      });
      const persisted = await pool.query(
        "SELECT refresh_token_hash, device_hash, ip_hash FROM auth_sessions WHERE id = $1",
        [source.id],
      );
      expect(persisted.rows[0]).toMatchObject({
        refresh_token_hash: hashRefreshToken("source-token"),
        device_hash: hashRefreshToken("a".repeat(64)),
        ip_hash: hashRefreshToken("192.0.2.10"),
      });
      expect((await pool.query("SELECT last_used_at FROM auth_sessions WHERE id = $1", [source.id])).rows[0]?.last_used_at)
        .toBeNull();

      await expect(pool.query(`
        INSERT INTO auth_sessions (
          id, family_id, account_id, user_id, principal_id, principal_type, refresh_token_hash, expires_at
        ) VALUES ('cross-tenant', 'family-cross', 'account-a', 'user-b', 'user-b', 'user', repeat('a', 64), now() + interval '1 hour')
      `)).rejects.toThrow();

      await expect(pool.query(`
        INSERT INTO auth_sessions (
          id, family_id, account_id, user_id, principal_id, principal_type, refresh_token_hash, expires_at, rotated_from_session_id
        ) VALUES ('cross-family', 'other-family', 'account-a', 'user-a', 'user-a', 'user', repeat('b', 64), now() + interval '1 hour', $1)
      `, [source.id])).rejects.toThrow();
      await expect(pool.query(`
        INSERT INTO auth_sessions (
          id, family_id, account_id, user_id, principal_id, principal_type, refresh_token_hash, expires_at, rotated_from_session_id
        ) VALUES ('cross-principal', $1, 'account-b', 'user-b', 'user-b', 'user', repeat('c', 64), now() + interval '1 hour', $2)
      `, [source.familyId, source.id])).rejects.toThrow();

      const unlinkedReplacement = await store.createSession({
        scope,
        refreshToken: "unlinked-replacement",
        expiresAt: expiry,
      });
      await expect(repository.linkRotation(scope, source.id, unlinkedReplacement.id, source.familyId))
        .rejects.toThrow("replacement");
      const afterRejectedLink = await pool.query("SELECT replaced_by_session_id FROM auth_sessions WHERE id = $1", [source.id]);
      expect(afterRejectedLink.rows[0]?.replaced_by_session_id).toBeNull();

      await store.createSession({ scope, refreshToken: "duplicate-next-token", expiresAt: expiry });
      await expect(store.rotateRefreshSession({
        kind: "user",
        refreshToken: "source-token",
        nextRefreshToken: "duplicate-next-token",
      })).rejects.toThrow();
      await expect(store.findRefreshSession({ scope, refreshToken: "source-token" }))
        .resolves.toMatchObject({ id: source.id });
      expect((await pool.query("SELECT last_used_at FROM auth_sessions WHERE id = $1", [source.id])).rows[0]?.last_used_at)
        .toBeNull();

      const concurrentSource = await store.createSession({ scope, refreshToken: "concurrent-source", expiresAt: expiry });
      const concurrent = await Promise.all([
        store.rotateRefreshSession({ kind: "user", refreshToken: "concurrent-source", nextRefreshToken: "concurrent-next-a" }),
        store.rotateRefreshSession({ kind: "user", refreshToken: "concurrent-source", nextRefreshToken: "concurrent-next-b" }),
      ]);
      expect(concurrent.map((result) => result.status).sort()).toEqual(["reuse_detected", "rotated"]);
      const family = await pool.query(
        "SELECT revoked_at, rotated_from_session_id FROM auth_sessions WHERE family_id = $1 ORDER BY created_at",
        [concurrentSource.familyId],
      );
      expect(family.rows).toHaveLength(2);
      expect(family.rows.every((row) => row.revoked_at !== null)).toBe(true);
      const used = await pool.query("SELECT last_used_at FROM auth_sessions WHERE id = $1", [concurrentSource.id]);
      expect(used.rows[0]?.last_used_at).not.toBeNull();

      const deleteSource = await store.createSession({ scope, refreshToken: "delete-source", expiresAt: expiry });
      const deleteRotation = await store.rotateRefreshSession({
        kind: "user",
        refreshToken: "delete-source",
        nextRefreshToken: "delete-source-next",
      });
      await pool.query("DELETE FROM auth_sessions WHERE id = $1", [deleteSource.id]);
      const afterPredecessorDelete = await pool.query(
        "SELECT rotated_from_session_id FROM auth_sessions WHERE id = $1",
        [deleteRotation.session?.id],
      );
      expect(afterPredecessorDelete.rows[0]?.rotated_from_session_id).toBeNull();

      const deleteReplacement = await store.createSession({ scope, refreshToken: "delete-replacement", expiresAt: expiry });
      const replacementRotation = await store.rotateRefreshSession({
        kind: "user",
        refreshToken: "delete-replacement",
        nextRefreshToken: "delete-replacement-next",
      });
      await pool.query("DELETE FROM auth_sessions WHERE id = $1", [replacementRotation.session?.id]);
      const afterReplacementDelete = await pool.query(
        "SELECT replaced_by_session_id FROM auth_sessions WHERE id = $1",
        [deleteReplacement.id],
      );
      expect(afterReplacementDelete.rows[0]?.replaced_by_session_id).toBeNull();

      const activeFamilyCount = async (familyId: string) => Number((await pool.query(
        "SELECT count(*) AS count FROM auth_sessions WHERE family_id = $1 AND revoked_at IS NULL",
        [familyId],
      )).rows[0]?.count);
      const activePrincipalCount = async (principalId: string) => Number((await pool.query(
        "SELECT count(*) AS count FROM auth_sessions WHERE principal_id = $1 AND revoked_at IS NULL",
        [principalId],
      )).rows[0]?.count);

      const logoutSource = await store.createSession({ scope, refreshToken: "logout-race-source", expiresAt: expiry });
      await Promise.all([
        store.rotateRefreshSession({ kind: "user", refreshToken: "logout-race-source", nextRefreshToken: "logout-race-next" }),
        store.revokeSession({ scope, sessionId: logoutSource.id, reason: "logout" }),
      ]);
      expect(await activeFamilyCount(logoutSource.familyId)).toBe(0);

      const replaySource = await store.createSession({ scope, refreshToken: "replay-race-source", expiresAt: expiry });
      const replayFirst = await store.rotateRefreshSession({ kind: "user", refreshToken: "replay-race-source", nextRefreshToken: "replay-race-current" });
      await Promise.all([
        store.rotateRefreshSession({ kind: "user", refreshToken: "replay-race-current", nextRefreshToken: "replay-race-next" }),
        store.rotateRefreshSession({ kind: "user", refreshToken: "replay-race-source", nextRefreshToken: "replay-race-ancestor" }),
      ]);
      expect(replayFirst.status).toBe("rotated");
      expect(await activeFamilyCount(replaySource.familyId)).toBe(0);

      const userWideSource = await store.createSession({ scope, refreshToken: "user-wide-race-source", expiresAt: expiry });
      await Promise.all([
        store.rotateRefreshSession({ kind: "user", refreshToken: "user-wide-race-source", nextRefreshToken: "user-wide-race-next" }),
        store.revokeUserSessions({ accountId: scope.accountId, userId: scope.userId, reason: "password_change" }),
      ]);
      expect(await activeFamilyCount(userWideSource.familyId)).toBe(0);
      expect(await activePrincipalCount(scope.userId)).toBe(0);

      const adminScope = { kind: "global_admin" as const, globalAdminPrincipalId: "politicall:global-admin" };
      const adminSource = await store.createSession({ scope: adminScope, refreshToken: "admin-wide-race-source", expiresAt: new Date("2030-01-01T03:00:00.000Z") });
      await Promise.all([
        store.rotateRefreshSession({ kind: "admin", refreshToken: "admin-wide-race-source", nextRefreshToken: "admin-wide-race-next" }),
        store.revokeGlobalAdminSessions({ globalAdminPrincipalId: adminScope.globalAdminPrincipalId, reason: "password_change" }),
      ]);
      expect(await activeFamilyCount(adminSource.familyId)).toBe(0);
      expect(await activePrincipalCount(adminScope.globalAdminPrincipalId)).toBe(0);

      const passwordMutations = createAuthPasswordMutationService(drizzle(pool, { schema }));
      const userPasswordSource = await store.createSession({ scope, refreshToken: "password-user-source", expiresAt: expiry });
      const userMutation = await passwordMutations.changeUserPassword({
        accountId: scope.accountId,
        userId: scope.userId,
        passwordHash: "user-password-after",
        userData: {},
      });
      expect(userMutation.password).toBe("user-password-after");
      expect(await activeFamilyCount(userPasswordSource.familyId)).toBe(0);

      const adminPasswordSource = await store.createSession({ scope: adminScope, refreshToken: "password-admin-source", expiresAt: new Date("2030-01-01T03:00:00.000Z") });
      await passwordMutations.persistGlobalAdminPasswordHash({ passwordHash: "admin-password-after" });
      expect((await pool.query("SELECT value FROM system_settings WHERE key = 'auth.global_admin_password_hash'")).rows[0]?.value)
        .toBe("admin-password-after");
      expect(await activeFamilyCount(adminPasswordSource.familyId)).toBe(0);

      const rollbackSource = await store.createSession({ scope: { kind: "user", accountId: "account-b", userId: "user-b" }, refreshToken: "password-rollback-source", expiresAt: expiry });
      await expect(passwordMutations.changeUserPassword({
        accountId: "account-b",
        userId: "user-b",
        passwordHash: "user-password-should-rollback",
        userData: {},
        beforeRevocation: () => { throw new Error("injected revocation failure"); },
      })).rejects.toThrow("injected revocation failure");
      expect((await pool.query("SELECT password FROM users WHERE id = 'user-b'")).rows[0]?.password).toBe("hash");
      expect(await activeFamilyCount(rollbackSource.familyId)).toBe(1);

      const adminRollbackSource = await store.createSession({ scope: adminScope, refreshToken: "password-admin-rollback-source", expiresAt: new Date("2030-01-01T03:00:00.000Z") });
      await expect(passwordMutations.persistGlobalAdminPasswordHash({
        passwordHash: "admin-password-should-rollback",
        beforeRevocation: () => { throw new Error("injected global revocation failure"); },
      })).rejects.toThrow("injected global revocation failure");
      expect((await pool.query("SELECT value FROM system_settings WHERE key = 'auth.global_admin_password_hash'")).rows[0]?.value)
        .toBe("admin-password-after");
      expect(await activeFamilyCount(adminRollbackSource.familyId)).toBe(1);
    } finally {
      if (pool) await pool.end();
      if (databaseCreated) {
        await adminPool.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [databaseName],
        );
        await adminPool.query(`DROP DATABASE "${databaseName}"`);
      }
      await adminPool.end();
    }
  }, 120_000);
});

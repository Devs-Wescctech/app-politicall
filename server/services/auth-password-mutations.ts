import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import { systemSettings, users, type User } from "@shared/schema";
import { ADMIN_PASSWORD_SETTING_KEY } from "../admin-credentials";
import { createDrizzleAuthSessionRepository, type AuthSessionScope } from "./auth-session-store";

type Database = {
  transaction<T>(work: (transaction: any) => Promise<T>): Promise<T>;
};

export type UserPasswordMutation = {
  accountId: string;
  userId: string;
  passwordHash: string;
  userData: Record<string, unknown>;
  beforeRevocation?: () => void | Promise<void>;
};

export function createAuthPasswordMutationService(database: Database, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());

  const changeUserPassword = async (input: UserPasswordMutation): Promise<User> => {
    const scope: AuthSessionScope = { kind: "user", accountId: input.accountId, userId: input.userId };
    return database.transaction(async (transaction) => {
      const sessions = createDrizzleAuthSessionRepository(transaction);
      await sessions.lockPrincipal(scope);
      const [updated] = await transaction.update(users).set({ ...input.userData, password: input.passwordHash })
        .where(and(eq(users.id, input.userId), eq(users.accountId, input.accountId))).returning();
      if (!updated) throw new Error("Password target user was not found");
      await input.beforeRevocation?.();
      await sessions.revokeByUser(input.accountId, input.userId, "password_change", now());
      return updated as User;
    });
  };

  const persistGlobalAdminPasswordHash = async (input: { passwordHash: string; beforeRevocation?: () => void | Promise<void> }): Promise<void> => {
    const scope: AuthSessionScope = { kind: "global_admin", globalAdminPrincipalId: "politicall:global-admin" };
    await database.transaction(async (transaction) => {
      const sessions = createDrizzleAuthSessionRepository(transaction);
      await sessions.lockPrincipal(scope);
      await transaction.insert(systemSettings).values({
        key: ADMIN_PASSWORD_SETTING_KEY,
        value: input.passwordHash,
        description: "Reserved global-admin credential hash",
        updatedAt: now(),
      }).onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: input.passwordHash, updatedAt: now() },
      });
      await input.beforeRevocation?.();
      await sessions.revokeByGlobalAdmin(scope.globalAdminPrincipalId, "password_change", now());
    });
  };

  return {
    changeUserPassword,
    persistGlobalAdminPasswordHash,
    async changeGlobalAdminPassword(newPassword: string): Promise<void> {
      await persistGlobalAdminPasswordHash({ passwordHash: await bcrypt.hash(newPassword, 12) });
    },
  };
}

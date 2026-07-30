import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";

const INSECURE_DEFAULT_PASSWORD = "politicall123";
export const ADMIN_PASSWORD_SETTING_KEY = "auth.global_admin_password_hash";

export interface AdminCredentialRepository {
  get(): Promise<string | undefined>;
  upsert(passwordHash: string): Promise<void>;
}

interface AdminCredentialOptions {
  configPath?: string;
  env?: Pick<NodeJS.ProcessEnv, "ADMIN_MASTER_PASSWORD_HASH">;
  repository?: AdminCredentialRepository;
}

const defaultConfigPath = () => path.join(process.cwd(), ".admin-config.json");

function runtimeRepository(): AdminCredentialRepository {
  return {
    async get() {
      const { db } = await import("./db");
      const [setting] = await db.select({ value: systemSettings.value }).from(systemSettings)
        .where(eq(systemSettings.key, ADMIN_PASSWORD_SETTING_KEY));
      return setting?.value;
    },
    async upsert(passwordHash) {
      const { db } = await import("./db");
      await db.insert(systemSettings).values({
        key: ADMIN_PASSWORD_SETTING_KEY,
        value: passwordHash,
        description: "Reserved global-admin credential hash",
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: passwordHash, updatedAt: new Date() },
      });
    },
  };
}

async function assertSecureHash(passwordHash: unknown): Promise<string> {
  if (typeof passwordHash !== "string" || passwordHash.trim().length === 0) throw new Error("Admin master password hash is invalid");
  if (await bcrypt.compare(INSECURE_DEFAULT_PASSWORD, passwordHash)) throw new Error("Insecure default admin password detected; rotate the admin credential");
  return passwordHash;
}

export function isReservedAdminSettingKey(key: string): boolean {
  return key === ADMIN_PASSWORD_SETTING_KEY;
}

export async function getAdminPasswordHash(options: AdminCredentialOptions = {}): Promise<string> {
  const repository = options.repository ?? runtimeRepository();
  const persistedHash = await repository.get();
  if (persistedHash) return assertSecureHash(persistedHash);

  const configPath = options.configPath ?? defaultConfigPath();
  if (fs.existsSync(configPath)) return assertSecureHash(JSON.parse(fs.readFileSync(configPath, "utf8")).passwordHash);
  const env = options.env ?? process.env;
  if (env.ADMIN_MASTER_PASSWORD_HASH) return assertSecureHash(env.ADMIN_MASTER_PASSWORD_HASH);
  throw new Error("Admin master credential is not configured. Set ADMIN_MASTER_PASSWORD_HASH or provide .admin-config.json");
}

export async function updateAdminPasswordHash(newPassword: string, options: { repository?: AdminCredentialRepository } = {}): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await (options.repository ?? runtimeRepository()).upsert(passwordHash);
}

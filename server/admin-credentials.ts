import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";

const INSECURE_DEFAULT_PASSWORD = "politicall123";

interface AdminCredentialOptions {
  configPath?: string;
  env?: Pick<NodeJS.ProcessEnv, "ADMIN_MASTER_PASSWORD_HASH">;
}

const defaultConfigPath = () => path.join(process.cwd(), ".admin-config.json");

async function assertSecureHash(passwordHash: unknown): Promise<string> {
  if (typeof passwordHash !== "string" || passwordHash.trim().length === 0) {
    throw new Error("Admin master password hash is invalid");
  }

  if (await bcrypt.compare(INSECURE_DEFAULT_PASSWORD, passwordHash)) {
    throw new Error("Insecure default admin password detected; rotate the admin credential");
  }

  return passwordHash;
}

export async function getAdminPasswordHash(options: AdminCredentialOptions = {}): Promise<string> {
  const configPath = options.configPath ?? defaultConfigPath();
  const env = options.env ?? process.env;

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return assertSecureHash(config.passwordHash);
  }

  if (env.ADMIN_MASTER_PASSWORD_HASH) {
    return assertSecureHash(env.ADMIN_MASTER_PASSWORD_HASH);
  }

  throw new Error(
    "Admin master credential is not configured. Set ADMIN_MASTER_PASSWORD_HASH or provide .admin-config.json",
  );
}

export async function updateAdminPasswordHash(
  newPassword: string,
  configPath = defaultConfigPath(),
): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const temporaryPath = `${configPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({ passwordHash }), { mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
}

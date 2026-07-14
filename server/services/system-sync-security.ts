const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const SAFE_ENV_KEYS = new Set([
  "PUBLIC_APP_URL",
  "PUBLIC_BASE_URL",
  "APP_URL",
]);

function isEnabled(value: string | undefined): boolean {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function isSafeEnvKey(key: string): boolean {
  return SAFE_ENV_KEYS.has(key) || key.startsWith("VITE_PUBLIC_");
}

export function isSystemSyncEnabled(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  return isEnabled(env.ENABLE_SYSTEM_SYNC);
}

export function shouldImportSystemSyncSecrets(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  return isSystemSyncEnabled(env) && isEnabled(env.ALLOW_SYSTEM_SYNC_SECRET_IMPORT);
}

export function collectSafeSyncEnvVars(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value && isSafeEnvKey(key)) {
      safe[key] = value;
    }
  }

  return safe;
}

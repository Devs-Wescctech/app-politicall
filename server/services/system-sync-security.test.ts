import { describe, expect, it } from "vitest";
import {
  collectSafeSyncEnvVars,
  isSystemSyncEnabled,
  shouldImportSystemSyncSecrets,
} from "./system-sync-security";

describe("system sync security policy", () => {
  it("keeps the sync endpoints disabled unless explicitly enabled", () => {
    expect(isSystemSyncEnabled({})).toBe(false);
    expect(isSystemSyncEnabled({ ENABLE_SYSTEM_SYNC: "false" })).toBe(false);
    expect(isSystemSyncEnabled({ ENABLE_SYSTEM_SYNC: "true" })).toBe(true);
  });

  it("exports only non-secret allowlisted environment values", () => {
    expect(collectSafeSyncEnvVars({
      PUBLIC_APP_URL: "https://politicall.example",
      VITE_PUBLIC_BASE_URL: "https://politicall.example",
      DATABASE_URL: "postgres://user:pass@example/db",
      SESSION_SECRET: "secret",
      SYNC_API_KEY: "sync-token",
      OPENAI_API_KEY: "sk-secret",
      NORMAL_FLAG: "ignored",
    })).toEqual({
      PUBLIC_APP_URL: "https://politicall.example",
      VITE_PUBLIC_BASE_URL: "https://politicall.example",
    });
  });

  it("does not import env vars or admin config without a second explicit opt-in", () => {
    expect(shouldImportSystemSyncSecrets({ ENABLE_SYSTEM_SYNC: "true" })).toBe(false);
    expect(shouldImportSystemSyncSecrets({
      ENABLE_SYSTEM_SYNC: "true",
      ALLOW_SYSTEM_SYNC_SECRET_IMPORT: "true",
    })).toBe(true);
  });
});

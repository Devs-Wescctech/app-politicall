import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD_SETTING_KEY,
  getAdminPasswordHash,
  isReservedAdminSettingKey,
  updateAdminPasswordHash,
} from "./admin-credentials";

describe("admin master credentials", () => {
  const emptyRepository = {
    get: async () => undefined,
    upsert: async () => undefined,
  };

  it("prefers a durable database hash over bootstrap environment and local fallback", async () => {
    const persistedHash = await bcrypt.hash("persisted-password", 4);
    const repository = {
      get: async () => persistedHash,
      upsert: async () => undefined,
    };

    await expect(getAdminPasswordHash({
      repository,
      configPath: path.join(tmpdir(), "missing-admin-config.json"),
      env: { ADMIN_MASTER_PASSWORD_HASH: "$2b$10$bootstrap" },
    })).resolves.toBe(persistedHash);
  });

  it("uses the bootstrap hash when the durable setting has not been initialized", async () => {
    const repository = {
      get: async () => undefined,
      upsert: async () => undefined,
    };

    await expect(getAdminPasswordHash({
      repository,
      configPath: path.join(tmpdir(), "missing-admin-config.json"),
      env: { ADMIN_MASTER_PASSWORD_HASH: "$2b$10$bootstrap" },
    })).resolves.toBe("$2b$10$bootstrap");
  });

  it("persists only a bcrypt hash with an atomic repository upsert", async () => {
    let stored: string | undefined;
    const repository = {
      get: async () => stored,
      upsert: async (value: string) => { stored = value; },
    };

    await updateAdminPasswordHash("new-admin-password", { repository });

    expect(stored).toMatch(/^\$2[aby]\$12\$/);
    await expect(bcrypt.compare("new-admin-password", stored!)).resolves.toBe(true);
  });

  it("reserves the durable global-admin password setting from generic settings access", () => {
    expect(ADMIN_PASSWORD_SETTING_KEY).toBe("auth.global_admin_password_hash");
    expect(isReservedAdminSettingKey(ADMIN_PASSWORD_SETTING_KEY)).toBe(true);
    expect(isReservedAdminSettingKey("budget_ads")).toBe(false);
  });

  it("uses an explicitly configured password hash", async () => {
    await expect(
      getAdminPasswordHash({
        repository: emptyRepository,
        configPath: path.join(tmpdir(), "missing-admin-config.json"),
        env: { ADMIN_MASTER_PASSWORD_HASH: "$2b$10$configured" },
      }),
    ).resolves.toBe("$2b$10$configured");
  });

  it("keeps backward compatibility with an existing local hash", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "politicall-admin-"));
    const configPath = path.join(directory, ".admin-config.json");
    await writeFile(configPath, JSON.stringify({ passwordHash: "$2b$10$existing" }));

    await expect(getAdminPasswordHash({ repository: emptyRepository, configPath, env: {} })).resolves.toBe("$2b$10$existing");
  });

  it("fails closed when no admin credential is configured", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "politicall-admin-"));

    await expect(
      getAdminPasswordHash({
        repository: emptyRepository,
        configPath: path.join(directory, ".admin-config.json"),
        env: {},
      }),
    ).rejects.toThrow("ADMIN_MASTER_PASSWORD_HASH");
  });

  it("rejects the former hardcoded default even when a hash already exists", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "politicall-admin-"));
    const configPath = path.join(directory, ".admin-config.json");
    const passwordHash = await bcrypt.hash("politicall123", 4);
    await writeFile(configPath, JSON.stringify({ passwordHash }));

    await expect(getAdminPasswordHash({ repository: emptyRepository, configPath, env: {} })).rejects.toThrow(
      "Insecure default admin password",
    );
  });
});

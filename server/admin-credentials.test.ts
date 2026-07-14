import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { getAdminPasswordHash } from "./admin-credentials";

describe("admin master credentials", () => {
  it("uses an explicitly configured password hash", async () => {
    await expect(
      getAdminPasswordHash({
        configPath: path.join(tmpdir(), "missing-admin-config.json"),
        env: { ADMIN_MASTER_PASSWORD_HASH: "$2b$10$configured" },
      }),
    ).resolves.toBe("$2b$10$configured");
  });

  it("keeps backward compatibility with an existing local hash", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "politicall-admin-"));
    const configPath = path.join(directory, ".admin-config.json");
    await writeFile(configPath, JSON.stringify({ passwordHash: "$2b$10$existing" }));

    await expect(getAdminPasswordHash({ configPath, env: {} })).resolves.toBe("$2b$10$existing");
  });

  it("fails closed when no admin credential is configured", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "politicall-admin-"));

    await expect(
      getAdminPasswordHash({
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

    await expect(getAdminPasswordHash({ configPath, env: {} })).rejects.toThrow(
      "Insecure default admin password",
    );
  });
});

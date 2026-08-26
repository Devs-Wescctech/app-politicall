import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  createProductionPoolOptions,
  runProductionMigrationCli,
} from "../../scripts/migrate-production";

const rootDir = process.cwd();
const productionUrl = "postgresql://database.example.test/politicall";

function createFakePool() {
  return {
    endCalls: 0,
    async connect() {
      throw new Error("connect should be owned by the injected migration runner");
    },
    async end() {
      this.endCalls += 1;
    },
  };
}

describe("production migration CLI", () => {
  it.each([
    { env: {}, label: "NODE_ENV is absent" },
    { env: { NODE_ENV: "development" }, label: "NODE_ENV is not production" },
    { env: { NODE_ENV: "production" }, label: "PROD_DATABASE_URL is absent" },
  ])("rejects invalid environment when $label", async ({ env }) => {
    const errors: string[] = [];
    let poolFactoryCalls = 0;

    const exitCode = await runProductionMigrationCli({
      env,
      rootDir,
      createPool() {
        poolFactoryCalls += 1;
        return createFakePool();
      },
      stderr: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(poolFactoryCalls).toBe(0);
    expect(errors).toEqual(["Production migration runner failed"]);
  });

  it("matches the application SSL rule for require and non-SSL URLs", () => {
    expect(createProductionPoolOptions(`${productionUrl}?sslmode=require`)).toEqual({
      connectionString: `${productionUrl}?sslmode=require`,
      ssl: { rejectUnauthorized: false },
    });
    expect(createProductionPoolOptions(productionUrl)).toEqual({
      connectionString: productionUrl,
      ssl: false,
    });
  });

  it("closes the pool and logs only migration IDs and counts on success", async () => {
    const pool = createFakePool();
    const logs: string[] = [];
    const errors: string[] = [];

    const exitCode = await runProductionMigrationCli({
      env: {
        NODE_ENV: "production",
        PROD_DATABASE_URL: productionUrl,
      },
      rootDir,
      createPool: () => pool,
      runMigrations: async () => ({
        baselineApplied: true,
        applied: ["0001_add_permissions.sql", "0002_remove_permissions_default.sql"],
        skipped: ["0003_add_google_event_id.sql"],
      }),
      stdout: (message) => logs.push(message),
      stderr: (message) => errors.push(message),
    });

    expect(exitCode).toBe(0);
    expect(pool.endCalls).toBe(1);
    expect(logs).toEqual([
      "baseline_applied=1",
      "applied_count=2",
      "skipped_count=1",
      "applied_ids=0001_add_permissions.sql,0002_remove_permissions_default.sql",
      "skipped_ids=0003_add_google_event_id.sql",
    ]);
    expect(errors).toEqual([]);
    expect(logs.join("\n")).not.toContain(productionUrl);
  });

  it("closes the pool and sanitizes migration errors", async () => {
    const pool = createFakePool();
    const logs: string[] = [];
    const errors: string[] = [];
    const privateMarker = "private-error-marker";
    const privateSql = "SELECT confidential_column FROM confidential_table";

    const exitCode = await runProductionMigrationCli({
      env: {
        NODE_ENV: "production",
        PROD_DATABASE_URL: productionUrl,
      },
      rootDir,
      createPool: () => pool,
      runMigrations: async () => {
        throw new Error(`${privateMarker}: ${privateSql}: ${productionUrl}`);
      },
      stdout: (message) => logs.push(message),
      stderr: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(pool.endCalls).toBe(1);
    expect(logs).toEqual([]);
    expect(errors).toEqual(["Production migration runner failed"]);
    const output = errors.join("\n");
    expect(output).not.toContain(privateMarker);
    expect(output).not.toContain(privateSql);
    expect(output).not.toContain(productionUrl);
  });

  it("preserves only the actionable global WHU duplicate remediation", async () => {
    const pool = createFakePool();
    const errors: string[] = [];
    const privateSql = "UPDATE channel_connections SET token_fingerprint = 'secret'";
    const duplicateRemediation = "WHU token fingerprint backfill found a global active WHU token conflict; disable or rotate the duplicate connection before retrying";

    const exitCode = await runProductionMigrationCli({
      env: { NODE_ENV: "production", PROD_DATABASE_URL: productionUrl },
      rootDir,
      createPool: () => pool,
      runMigrations: async () => {
        throw new Error(duplicateRemediation);
      },
      stderr: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(pool.endCalls).toBe(1);
    expect(errors).toEqual([duplicateRemediation]);
    expect(errors.join("\n")).not.toContain(privateSql);
    expect(errors.join("\n")).not.toContain(productionUrl);
  });

  it("executes the guarded entrypoint from the production bundle", async () => {
    const runtimeRoot = path.join(rootDir, ".runtime");
    await mkdir(runtimeRoot, { recursive: true });
    const outputDirectory = await mkdtemp(path.join(runtimeRoot, "migration-cli-"));
    const outputFile = path.join(outputDirectory, "migrate-production.js");

    try {
      await build({
        absWorkingDir: rootDir,
        entryPoints: ["scripts/migrate-production.ts"],
        bundle: true,
        format: "esm",
        outfile: outputFile,
        packages: "external",
        platform: "node",
      });

      const result = spawnSync(process.execPath, [outputFile], {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "development",
          PROD_DATABASE_URL: "",
        },
        windowsHide: true,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("Production migration runner failed");
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});

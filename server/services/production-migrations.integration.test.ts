import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { runProductionMigrations } from "./production-migrations";

const rootDir = process.cwd();
const integrationDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const integrationIt = integrationDatabaseUrl ? it : it.skip;
const migrationNames = [
  "0001_add_permissions.sql",
  "0002_remove_permissions_default.sql",
  "0003_add_google_event_id.sql",
  "0005_attendance_omni.sql",
  "0006_campaign_center.sql",
  "0007_contact_neighborhood.sql",
  "0008_att_messages_external_id_unique.sql",
  "0009_petitionsbr_module.sql",
  "0010_auth_sessions.sql",
  "0011_auth_session_integrity.sql",
];

function poolOptions(connectionString: string) {
  return {
    connectionString,
    ssl: /sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : false,
  };
}

async function createRollbackFixtureRoot(): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "politicall-migration-integration-"));
  await mkdir(path.join(fixtureRoot, "scripts"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "migrations"), { recursive: true });
  await copyFile(
    path.join(rootDir, "scripts/full_schema.sql"),
    path.join(fixtureRoot, "scripts/full_schema.sql"),
  );
  await Promise.all(migrationNames.map((name) => copyFile(
    path.join(rootDir, "migrations", name),
    path.join(fixtureRoot, "migrations", name),
  )));

  const firstMigrationPath = path.join(fixtureRoot, "migrations", migrationNames[0]);
  const firstMigration = await readFile(firstMigrationPath, "utf8");
  await writeFile(
    firstMigrationPath,
    `${firstMigration}\nCREATE TABLE production_migration_rollback_probe (id integer PRIMARY KEY);\n`,
    "utf8",
  );
  return fixtureRoot;
}

describe("production migrations PostgreSQL integration", () => {
  integrationIt(
    "runs in a disposable database and rolls back SQL when history persistence fails [MIGRATION_TEST_DATABASE_URL]",
    async () => {
      const adminConnectionString = process.env.MIGRATION_TEST_DATABASE_URL;
      if (!adminConnectionString) throw new Error("MIGRATION_TEST_DATABASE_URL is required");

      const databaseName = `politicall_migration_test_${randomUUID().replaceAll("-", "")}`;
      const adminPool = new Pool(poolOptions(adminConnectionString));
      const isolatedUrl = new URL(adminConnectionString);
      isolatedUrl.pathname = `/${databaseName}`;
      let isolatedPool: Pool | undefined;
      let fixtureRoot: string | undefined;
      let databaseCreated = false;

      try {
        await adminPool.query(`CREATE DATABASE "${databaseName}"`);
        databaseCreated = true;
        isolatedPool = new Pool(poolOptions(isolatedUrl.toString()));

        const result = await runProductionMigrations(isolatedPool, rootDir);
        expect(result).toEqual({
          baselineApplied: true,
          applied: migrationNames,
          skipped: [],
        });
        const history = await isolatedPool.query(
          "SELECT name FROM politicall_schema_migrations ORDER BY name",
        );
        expect(history.rows).toHaveLength(migrationNames.length + 1);

        await isolatedPool.query(
          "DELETE FROM politicall_schema_migrations WHERE name = $1",
          [migrationNames[0]],
        );
        fixtureRoot = await createRollbackFixtureRoot();
        const failingPool = {
          async connect() {
            const client = await isolatedPool!.connect();
            return {
              async query(sql: string, parameters?: unknown[]) {
                if (
                  sql.startsWith("INSERT INTO politicall_schema_migrations")
                  && parameters?.[0] === migrationNames[0]
                ) {
                  throw new Error("simulated history persistence failure");
                }
                return client.query(sql, parameters as never);
              },
              release() {
                client.release();
              },
            };
          },
        };

        await expect(runProductionMigrations(failingPool as never, fixtureRoot))
          .rejects.toThrow(`Production migration ${migrationNames[0]} failed`);

        const probe = await isolatedPool.query(
          "SELECT to_regclass('public.production_migration_rollback_probe') AS relation",
        );
        expect(probe.rows[0]?.relation).toBeNull();
        const record = await isolatedPool.query(
          "SELECT name FROM politicall_schema_migrations WHERE name = $1",
          [migrationNames[0]],
        );
        expect(record.rows).toHaveLength(0);
      } finally {
        if (isolatedPool) await isolatedPool.end();
        if (fixtureRoot) await rm(fixtureRoot, { force: true, recursive: true });
        if (databaseCreated) {
          await adminPool.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
            [databaseName],
          );
          await adminPool.query(`DROP DATABASE "${databaseName}"`);
        }
        await adminPool.end();
      }
    },
    120_000,
  );
});

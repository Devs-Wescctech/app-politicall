import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

const MIGRATION_LOCK_ID = 741202607;
const MIGRATION_TABLE = "politicall_schema_migrations";

const BASELINE = "scripts/full_schema.sql";
const MIGRATIONS = [
  "0001_add_permissions.sql",
  "0002_remove_permissions_default.sql",
  "0003_add_google_event_id.sql",
  "0005_attendance_omni.sql",
  "0006_campaign_center.sql",
  "0007_contact_neighborhood.sql",
  "0008_att_messages_external_id_unique.sql",
  "0009_petitionsbr_module.sql",
  "0010_auth_sessions.sql",
] as const;

export interface MigrationRunResult {
  baselineApplied: boolean;
  applied: string[];
  skipped: string[];
}

type MigrationArtifact = {
  name: string;
  relativePath: string;
  sql: string;
  hash: string;
};

type ProductionMigrationPool = Pick<Pool, "connect">;
type ProductionMigrationClient = Pick<PoolClient, "query" | "release">;

function hash(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function loadArtifact(rootDir: string, name: string, relativePath: string): Promise<MigrationArtifact> {
  const contents = await readFile(path.resolve(rootDir, relativePath));
  return {
    name,
    relativePath,
    sql: contents.toString("utf8"),
    hash: hash(contents),
  };
}

async function createMigrationTable(client: ProductionMigrationClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      name text PRIMARY KEY,
      hash text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function recordedHash(client: ProductionMigrationClient, name: string): Promise<string | undefined> {
  const result = await client.query(
    `SELECT hash FROM ${MIGRATION_TABLE} WHERE name = $1`,
    [name],
  );
  return result.rows[0]?.hash;
}

async function assertMatchingHash(
  client: ProductionMigrationClient,
  artifact: MigrationArtifact,
): Promise<boolean> {
  const recorded = await recordedHash(client, artifact.name);
  if (recorded === undefined) return false;
  if (recorded !== artifact.hash) {
    throw new Error(`Production migration hash mismatch for migration ${artifact.name}`);
  }
  return true;
}

async function applyArtifact(client: ProductionMigrationClient, artifact: MigrationArtifact): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(artifact.sql);
    await client.query(
      `INSERT INTO ${MIGRATION_TABLE} (name, hash) VALUES ($1, $2)`,
      [artifact.name, artifact.hash],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error(`Production migration ${artifact.name} failed`);
  }
}

async function accountsTableExists(client: ProductionMigrationClient): Promise<boolean> {
  const result = await client.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') AS exists",
  );
  return result.rows[0]?.exists === true;
}

export async function runProductionMigrations(
  pool: ProductionMigrationPool,
  rootDir: string,
): Promise<MigrationRunResult> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    lockAcquired = true;
    await createMigrationTable(client);

    const baseline = await loadArtifact(rootDir, BASELINE, BASELINE);
    const migrations = await Promise.all(MIGRATIONS.map((name) =>
      loadArtifact(rootDir, name, path.join("migrations", name)),
    ));

    const baselineRecorded = await assertMatchingHash(client, baseline);
    const baselineApplied = !await accountsTableExists(client) && !baselineRecorded;
    if (baselineApplied) await applyArtifact(client, baseline);

    const applied: string[] = [];
    const skipped: string[] = [];
    for (const migration of migrations) {
      if (await assertMatchingHash(client, migration)) {
        skipped.push(migration.name);
        continue;
      }
      await applyArtifact(client, migration);
      applied.push(migration.name);
    }

    return { baselineApplied, applied, skipped };
  } finally {
    try {
      if (lockAcquired) await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

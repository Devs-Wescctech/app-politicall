import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import {
  backfillWhuTokenFingerprints,
  type DataKeyRotationReport,
  type DataKeyRotationStore,
  type RotationRow,
} from "./data-key-rotation";

const MIGRATION_LOCK_ID = 741202607;
const MIGRATION_TABLE = "politicall_schema_migrations";

const BASELINE = "scripts/full_schema.sql";
export const WHU_TOKEN_FINGERPRINT_DUPLICATE_CONFLICT_MESSAGE = "WHU token fingerprint backfill found a global active WHU token conflict; disable or rotate the duplicate connection before retrying";
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
  "0011_demand_ecosystem.sql",
  "0012_attendance_follow_up.sql",
  "0013_petition_signature_contact.sql",
  "0014_contact_identity_ecosystem.sql",
  "0015_contact_deduplication.sql",
  "0016_demand_lifecycle_automation.sql",
  "0017_demand_forwarding_workflow.sql",
  "0018_custom_alliance_lines.sql",
  "0019_multiple_whu_connections.sql",
  "0020_canonical_whu_connection_identity.sql",
  "0021_normalize_whu_connection_identity.sql",
  "0022_attendance_connection_thread_identity.sql",
  "0023_reconcile_schema_contract.sql",
  "0024_remove_empty_stale_baseline_tables.sql",
  "0025_reconcile_remaining_baseline_drift.sql",
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
export type ProductionMigrationClient = Pick<PoolClient, "query" | "release">;
export type ProductionMigrationOptions = {
  beforeMigrations?: (client: ProductionMigrationClient) => Promise<void>;
  backfillWhuTokenFingerprints?: (client: ProductionMigrationClient) => Promise<DataKeyRotationReport>;
};

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

function createWhuTokenFingerprintBackfillStore(client: ProductionMigrationClient): DataKeyRotationStore {
  let transactionActive = false;
  return {
    async readBatch(cursor, limit) {
      const result = await client.query(
         `SELECT id::text AS id, token AS value, token_fingerprint, channel, provider
          FROM channel_connections
         WHERE lower(btrim(channel)) = 'whatsapp'
           AND lower(btrim(provider)) = 'wescctech'
           AND lower(btrim(status)) <> 'disabled'
           AND token IS NOT NULL
           AND token <> ''
           AND ($1::text IS NULL OR id::text > $1)
         ORDER BY id::text
         LIMIT $2`,
        [cursor, limit],
      );
      const rows = result.rows.map((row) => ({
        table: "channel_connections",
        id: row.id,
        field: "token",
        value: row.value,
        tokenFingerprint: row.token_fingerprint,
        channel: row.channel,
        provider: row.provider,
      })) as RotationRow[];
      return { rows, nextCursor: rows.length === limit ? rows.at(-1)!.id : null };
    },
    async transaction(work) {
      if (transactionActive) return work();
      transactionActive = true;
      await client.query("BEGIN");
      try {
        const result = await work();
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        transactionActive = false;
      }
    },
    async compareAndSet(row, encrypted, tokenFingerprint) {
      const result = await client.query(
        `UPDATE channel_connections
         SET token = $1, token_fingerprint = $2, updated_at = NOW()
         WHERE id::text = $3 AND token IS NOT DISTINCT FROM $4 AND token_fingerprint IS NOT DISTINCT FROM $5`,
        [encrypted, tokenFingerprint, row.id, row.value, row.tokenFingerprint],
      );
      return result.rowCount === 1;
    },
  };
}

async function runWhuTokenFingerprintBackfill(client: ProductionMigrationClient): Promise<DataKeyRotationReport> {
  try {
    return await backfillWhuTokenFingerprints(createWhuTokenFingerprintBackfillStore(client), { apply: true });
  } catch (error: any) {
    if (error?.code === "23505") {
      throw new Error(WHU_TOKEN_FINGERPRINT_DUPLICATE_CONFLICT_MESSAGE);
    }
    throw error;
  }
}

export async function runProductionMigrations(
  pool: ProductionMigrationPool,
  rootDir: string,
  options: ProductionMigrationOptions = {},
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

    await options.beforeMigrations?.(client);

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

    const report = await (options.backfillWhuTokenFingerprints ?? runWhuTokenFingerprintBackfill)(client);
    if (report.errors > 0) throw new Error("WHU token fingerprint backfill failed");

    return { baselineApplied, applied, skipped };
  } finally {
    try {
      if (lockAcquired) await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

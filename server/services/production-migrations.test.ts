import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { encryptApiKey } from "../crypto";
import {
  runProductionMigrations,
  WHU_TOKEN_FINGERPRINT_DUPLICATE_CONFLICT_MESSAGE,
} from "./production-migrations";

const rootDir = process.cwd();
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
];

type Query = { sql: string; parameters?: unknown[] };

class FakePoolClient {
  readonly queries: Query[] = [];
  readonly recorded = new Map<string, string>();
  private pendingRecords: Map<string, string> | undefined;
  released = false;
  accountsExists = false;
  failSql: string | undefined;
  backfillRows: Array<Record<string, unknown>> = [];
  backfillUpdateError: Error | undefined;

  async query(sql: string, parameters?: unknown[]) {
    this.queries.push({ sql, parameters });

    if (sql === "BEGIN") {
      this.pendingRecords = new Map();
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      this.pendingRecords = undefined;
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      if (this.failSql && sql.includes(this.failSql)) {
        throw new Error("simulated database failure");
      }
      if (!this.pendingRecords) throw new Error("COMMIT without BEGIN");
      for (const [name, hash] of this.pendingRecords) this.recorded.set(name, hash);
      this.pendingRecords = undefined;
      return { rows: [] };
    }
    if (this.failSql && sql.includes(this.failSql)) {
      throw new Error("simulated database failure");
    }
    if (sql.includes("information_schema.tables")) {
      return { rows: [{ exists: this.accountsExists }] };
    }
    if (sql.startsWith("SELECT hash FROM politicall_schema_migrations")) {
      const name = parameters?.[0] as string;
      const hash = this.recorded.get(name);
      return { rows: hash ? [{ hash }] : [] };
    }
    if (sql.startsWith("INSERT INTO politicall_schema_migrations")) {
      if (!this.pendingRecords) throw new Error("migration record inserted outside a transaction");
      this.pendingRecords.set(parameters?.[0] as string, parameters?.[1] as string);
    }
    if (sql.startsWith("SELECT id::text AS id, token AS value,")) {
      return { rows: this.backfillRows };
    }
    if (sql.startsWith("UPDATE channel_connections")) {
      if (this.backfillUpdateError) throw this.backfillUpdateError;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  }

  release() {
    this.released = true;
  }
}

class FakePool {
  connectCalls = 0;

  constructor(readonly client: FakePoolClient) {}

  async connect() {
    this.connectCalls += 1;
    return this.client;
  }
}

async function sha256(relativePath: string): Promise<string> {
  const contents = await readFile(path.join(rootDir, relativePath));
  return createHash("sha256").update(contents).digest("hex");
}

function queriesMatching(client: FakePoolClient, pattern: RegExp): Query[] {
  return client.queries.filter(({ sql }) => pattern.test(sql));
}

describe("runProductionMigrations", () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 5).toString("base64");
  });

  it("applies the approved baseline and migrations with durable hashes under one session lock", async () => {
    const client = new FakePoolClient();
    const result = await runProductionMigrations(new FakePool(client), rootDir);

    expect(result).toEqual({
      baselineApplied: true,
      applied: migrationNames,
      skipped: [],
    });
    expect(client.recorded.get("scripts/full_schema.sql")).toBe(await sha256("scripts/full_schema.sql"));
    await Promise.all(migrationNames.map(async (name) => {
      expect(client.recorded.get(name)).toBe(await sha256(path.join("migrations", name)));
    }));
    expect(client.queries[0]).toMatchObject({
      sql: "SELECT pg_advisory_lock($1)",
      parameters: [741202607],
    });
    expect(client.queries.at(-1)).toMatchObject({
      sql: "SELECT pg_advisory_unlock($1)",
      parameters: [741202607],
    });
    expect(queriesMatching(client, /^BEGIN$/)).toHaveLength(migrationNames.length + 1);
    expect(queriesMatching(client, /^COMMIT$/)).toHaveLength(migrationNames.length + 1);
    expect(client.released).toBe(true);
  });

  it("does not apply the baseline to an existing schema and skips matching migrations", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    await Promise.all(migrationNames.map(async (name) => {
      client.recorded.set(name, await sha256(path.join("migrations", name)));
    }));

    const result = await runProductionMigrations(new FakePool(client), rootDir);

    expect(result).toEqual({
      baselineApplied: false,
      applied: [],
      skipped: migrationNames,
    });
    expect(client.queries.some(({ sql }) => sql.includes("PostgreSQL database dump"))).toBe(false);
    expect(queriesMatching(client, /^BEGIN$/)).toHaveLength(0);
  });

  it("upgrades a legacy schema without recording or executing the baseline", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;

    const result = await runProductionMigrations(new FakePool(client), rootDir);

    expect(result).toEqual({
      baselineApplied: false,
      applied: migrationNames,
      skipped: [],
    });
    expect(client.recorded.has("scripts/full_schema.sql")).toBe(false);
    await Promise.all(migrationNames.map(async (name) => {
      expect(client.recorded.get(name)).toBe(await sha256(path.join("migrations", name)));
    }));
    expect(client.queries.some(({ sql }) => sql.includes("PostgreSQL database dump"))).toBe(false);
    expect(queriesMatching(client, /^BEGIN$/)).toHaveLength(migrationNames.length);
    expect(queriesMatching(client, /^COMMIT$/)).toHaveLength(migrationNames.length);
  });

  it("runs an optional bootstrap hook after the baseline and before incremental migrations", async () => {
    const client = new FakePoolClient();
    let queryCountAtHook = -1;

    await runProductionMigrations(new FakePool(client), rootDir, {
      beforeMigrations: async () => {
        queryCountAtHook = client.queries.length;
      },
      backfillWhuTokenFingerprints: async () => ({
        scanned: 0,
        unchanged: 0,
        rotatable: 0,
        rotated: 0,
        skipped: 0,
        errors: 0,
      }),
    });

    const baselineQueryIndex = client.queries.findIndex(({ sql }) =>
      sql.includes("PostgreSQL database dump"));
    const firstMigrationIndex = client.queries.findIndex(({ sql }) =>
      sql.includes("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions"));

    expect(baselineQueryIndex).toBeGreaterThan(-1);
    expect(queryCountAtHook).toBeGreaterThan(baselineQueryIndex);
    expect(queryCountAtHook).toBeLessThan(firstMigrationIndex);
  });

  it("rejects a previously recorded migration when its hash diverges", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    client.recorded.set(migrationNames[0], "different-hash");

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow(`hash mismatch for migration ${migrationNames[0]}`);

    expect(client.queries.at(-1)).toMatchObject({ sql: "SELECT pg_advisory_unlock($1)" });
    expect(client.released).toBe(true);
  });

  it("rolls back the failed migration and releases its lock", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    client.failSql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions";

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow(`Production migration ${migrationNames[0]} failed`);

    expect(queriesMatching(client, /^BEGIN$/)).toHaveLength(1);
    expect(queriesMatching(client, /^ROLLBACK$/)).toHaveLength(1);
    expect(client.recorded.has(migrationNames[0])).toBe(false);
    expect(client.queries.at(-1)).toMatchObject({ sql: "SELECT pg_advisory_unlock($1)" });
    expect(client.released).toBe(true);
  });

  it("does not persist the migration record when commit fails after the SQL and insert", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    client.failSql = "COMMIT";

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow(`Production migration ${migrationNames[0]} failed`);

    expect(queriesMatching(client, /^ROLLBACK$/)).toHaveLength(1);
    expect(client.recorded.has(migrationNames[0])).toBe(false);
    expect(client.queries.at(-1)).toMatchObject({ sql: "SELECT pg_advisory_unlock($1)" });
    expect(client.released).toBe(true);
  });

  it("rolls back after migration SQL when inserting its history record fails", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    client.failSql = "INSERT INTO politicall_schema_migrations";

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow(`Production migration ${migrationNames[0]} failed`);

    const migrationSqlIndex = client.queries.findIndex(({ sql }) =>
      sql.includes("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions"));
    const insertIndex = client.queries.findIndex(({ sql }) =>
      sql.startsWith("INSERT INTO politicall_schema_migrations"));
    const rollbackIndex = client.queries.findIndex(({ sql }) => sql === "ROLLBACK");
    expect(migrationSqlIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(migrationSqlIndex);
    expect(rollbackIndex).toBeGreaterThan(insertIndex);
    expect(client.recorded.has(migrationNames[0])).toBe(false);
  });

  it("uses only the approved production manifest and never the development seeding script", async () => {
    const service = await readFile(path.join(rootDir, "server/services/production-migrations.ts"), "utf8");

    expect(service).toContain("scripts/full_schema.sql");
    for (const name of migrationNames) expect(service).toContain(name);
    expect(service).not.toContain("setup-dev-db");
    expect(service).not.toMatch(/seed(?:Account|Admin|Sample)/i);
    expect(service).not.toContain("0000_yummy_microchip.sql");
    expect(service).not.toContain("0001_unusual_mentor.sql");
  });

  it("registers the WHU identity migrations and keeps trim-aware unique predicates in the fresh schema", async () => {
    const [migration, canonicalMigration, normalizationMigration, schema, setup, service] = await Promise.all([
      readFile(path.join(rootDir, "migrations/0019_multiple_whu_connections.sql"), "utf8"),
      readFile(path.join(rootDir, "migrations/0020_canonical_whu_connection_identity.sql"), "utf8"),
      readFile(path.join(rootDir, "migrations/0021_normalize_whu_connection_identity.sql"), "utf8"),
      readFile(path.join(rootDir, "scripts/full_schema.sql"), "utf8"),
      readFile(path.join(rootDir, "scripts/setup-dev-db.ts"), "utf8"),
      readFile(path.join(rootDir, "server/services/production-migrations.ts"), "utf8"),
    ]);

    expect(migration).toContain("RAISE EXCEPTION 'Cannot create global active WHU token uniqueness index");
    expect(migration).toContain("ON channel_connections (account_id, phone_number)");
    expect(migration).toContain("ON channel_connections (token_fingerprint)");
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(canonicalMigration).not.toMatch(/\bDELETE\b/i);
    expect(normalizationMigration).toContain("lower(btrim(channel)) = 'whatsapp'");
    expect(normalizationMigration).toContain("lower(btrim(provider)) = 'wescctech'");
    expect(normalizationMigration).toContain("lower(btrim(status)) <> 'disabled'");
    expect(normalizationMigration).toContain("NULLIF(btrim(phone_number), '')");
    expect(normalizationMigration).toMatch(/SET\s+channel = lower\(btrim\(channel\)\)/);
    expect(canonicalMigration).toContain("regexp_replace");
    expect(canonicalMigration).toContain("jsonb_set");
    expect(canonicalMigration).toContain("channel_connections_account_phone_active_uidx");
    expect(canonicalMigration).not.toMatch(/\bDELETE\b/i);
    expect(schema).toContain("phone_number text");
    expect(schema).toContain("token_fingerprint text");
    expect(schema).toContain("channel_connections_token_active_uidx");
    expect(schema).toContain("lower(btrim(channel)) = 'whatsapp'");
    expect(schema).toContain("lower(btrim(provider)) = 'wescctech'");
    expect(schema).toContain("lower(btrim(status)) <> 'disabled'");
    expect(schema).toContain("NULLIF(btrim(phone_number), ''::text) IS NOT NULL");
    expect(setup).toContain('import { runProductionMigrations } from "../server/services/production-migrations"');
    expect(service).toContain("0021_normalize_whu_connection_identity.sql");
  });

  it("runs the WHU fingerprint backfill after applying migration 0019", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    let queryCountWhenBackfilled = -1;

    await runProductionMigrations(new FakePool(client), rootDir, {
      backfillWhuTokenFingerprints: async () => {
        queryCountWhenBackfilled = client.queries.length;
        return { scanned: 0, unchanged: 0, rotatable: 0, rotated: 0, skipped: 0, errors: 0 };
      },
    });

    const migrationIndex = client.queries.findIndex(({ sql }) =>
      sql.includes("Cannot create global active WHU token uniqueness index"));
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(queryCountWhenBackfilled).toBeGreaterThan(migrationIndex);
  });

  it("uses a WHU-only token compare-and-set backfill store", async () => {
    const service = await readFile(path.join(rootDir, "server/services/production-migrations.ts"), "utf8");

    expect(service).toContain("FROM channel_connections");
    expect(service).toContain("lower(btrim(channel)) = 'whatsapp'");
    expect(service).toContain("lower(btrim(provider)) = 'wescctech'");
    expect(service).toContain("lower(btrim(status)) <> 'disabled'");
    expect(service).not.toContain("token_fingerprint IS NULL");
    expect(service).toContain("SET token = $1, token_fingerprint = $2");
    expect(service).toContain("WHERE id::text = $3 AND token IS NOT DISTINCT FROM $4");
  });

  it("rejects an invalid fingerprint key before querying an empty backfill source", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    process.env.TOKEN_FINGERPRINT_KEY = "not-canonical-base64";

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow("TOKEN_FINGERPRINT_KEY must be a canonical base64 encoding of exactly 32 bytes");

    expect(client.queries.some(({ sql }) => sql.startsWith("SELECT id::text AS id, token AS value,"))).toBe(false);
    expect(client.released).toBe(true);
  });

  it("fails closed with a sanitized duplicate remediation and preserves the conflicting row", async () => {
    const client = new FakePoolClient();
    client.accountsExists = true;
    const token = encryptApiKey("retained-whu-token", { table: "channel_connections", field: "token", recordId: "whu-duplicate" });
    const originalRow = {
      id: "whu-duplicate",
      value: token,
      token_fingerprint: "old-fingerprint",
      channel: "whatsapp",
      provider: "wescctech",
    };
    client.backfillRows = [originalRow];
    client.backfillUpdateError = Object.assign(new Error("provider duplicate detail"), { code: "23505" });

    await expect(runProductionMigrations(new FakePool(client), rootDir))
      .rejects.toThrow(WHU_TOKEN_FINGERPRINT_DUPLICATE_CONFLICT_MESSAGE);

    expect(client.backfillRows).toEqual([originalRow]);
    expect(queriesMatching(client, /^ROLLBACK$/).length).toBeGreaterThan(0);
    expect(client.released).toBe(true);
  });

  it("keeps the final auth-session schema in 0010 for the shared production and development runner", async () => {
    const [service, setup, authSessionMigration] = await Promise.all([
      readFile(path.join(rootDir, "server/services/production-migrations.ts"), "utf8"),
      readFile(path.join(rootDir, "scripts/setup-dev-db.ts"), "utf8"),
      readFile(path.join(rootDir, "migrations/0010_auth_sessions.sql"), "utf8"),
    ]);

    expect(service).toContain("0010_auth_sessions.sql");
    expect(setup).toContain("runProductionMigrations(pool, process.cwd()");
    expect(service).not.toContain("0011_auth_session_integrity.sql");
    expect(setup).not.toContain("applyMigration");
    expect(authSessionMigration).not.toMatch(/DO\s+\$\$/);
    expect(authSessionMigration).not.toContain("CREATE EXTENSION pgcrypto");
  });
});

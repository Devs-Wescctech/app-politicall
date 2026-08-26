import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationTestDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const describeMigration = migrationTestDatabaseUrl ? describe : describe.skip;
const migration = readFileSync(
  resolve(process.cwd(), "migrations/0025_reconcile_remaining_baseline_drift.sql"),
  "utf8",
);
const schemaName = `remaining_baseline_drift_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;

describeMigration("0025 remaining baseline drift reconciliation", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: migrationTestDatabaseUrl });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA ${quotedSchemaName}`);
  });

  beforeEach(async () => {
    await client.query(`SET search_path TO ${quotedSchemaName}, public`);
    await client.query(`
      DROP TABLE IF EXISTS api_key_usage, api_keys, google_calendar_integrations, contacts CASCADE;
      CREATE TABLE api_key_usage (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        message text
      );
      CREATE TABLE api_keys (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid())::text
      );
      CREATE TABLE google_calendar_integrations (
        id varchar PRIMARY KEY,
        sync_enabled boolean NOT NULL DEFAULT true,
        is_active boolean DEFAULT true,
        scopes text,
        token_expiry timestamptz,
        token_expiry_date timestamp
      );
      CREATE TABLE contacts (
        id varchar PRIMARY KEY,
        account_id varchar NOT NULL,
        normalized_name text
      );
      CREATE INDEX contacts_account_normalized_name_idx
        ON contacts(account_id, normalized_name)
        WHERE normalized_name IS NOT NULL;
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
      client.release();
    }
    if (pool) await pool.end();
  });

  it("preserves the canonical token expiry, removes empty stale columns, and remains idempotent", async () => {
    await client.query(`
      INSERT INTO api_key_usage DEFAULT VALUES;
      INSERT INTO api_keys DEFAULT VALUES;
      INSERT INTO google_calendar_integrations (
        id, sync_enabled, is_active, token_expiry
      ) VALUES (
        'google-a', true, true, '2026-08-25T15:30:00-03:00'
      );
    `);

    await client.query(migration);
    await client.query(migration);

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'api_key_usage' AND column_name = 'message')
          OR (table_name = 'google_calendar_integrations' AND column_name IN ('is_active', 'scopes', 'token_expiry'))
        )
    `);
    expect(columns.rows).toEqual([]);

    const integration = await client.query<{ token_expiry_date: Date }>(
      "SELECT token_expiry_date FROM google_calendar_integrations WHERE id = 'google-a'",
    );
    expect(integration.rows[0].token_expiry_date.toISOString()).toBe("2026-08-25T18:30:00.000Z");

    const index = await client.query<{ predicate: string | null }>(`
      SELECT pg_get_expr(index.indpred, index.indrelid) AS predicate
      FROM pg_index index
      JOIN pg_class relation ON relation.oid = index.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = 'contacts_account_normalized_name_idx'
    `);
    expect(index.rows).toEqual([{ predicate: null }]);
  });

  it("rolls back without dropping columns when stale values would be lost", async () => {
    await client.query("INSERT INTO api_key_usage (message) VALUES ('preserve me')");
    await client.query("BEGIN");
    await expect(client.query(migration)).rejects.toThrow(/Cannot remove api_key_usage\.message/);
    await client.query("ROLLBACK");

    const value = await client.query<{ message: string }>("SELECT message FROM api_key_usage");
    expect(value.rows).toEqual([{ message: "preserve me" }]);
  });

  it("rejects conflicting Google Calendar compatibility values", async () => {
    await client.query(`
      INSERT INTO google_calendar_integrations (
        id, sync_enabled, is_active, token_expiry, token_expiry_date
      ) VALUES (
        'google-conflict', true, false, '2026-08-25T18:30:00Z', '2026-08-26T18:30:00'
      )
    `);
    await client.query("BEGIN");
    await expect(client.query(migration)).rejects.toThrow(/conflicts with sync_enabled/);
    await client.query("ROLLBACK");

    const columns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'google_calendar_integrations'
        AND column_name IN ('is_active', 'token_expiry')
      ORDER BY column_name
    `);
    expect(columns.rows).toEqual([
      { column_name: "is_active" },
      { column_name: "token_expiry" },
    ]);
  });
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationTestDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const describeMigration = migrationTestDatabaseUrl ? describe : describe.skip;
const migration = readFileSync(resolve(process.cwd(), "migrations/0018_custom_alliance_lines.sql"), "utf8");
const schemaName = `alliance_lines_migration_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;

describeMigration("0018 custom alliance lines migration", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: migrationTestDatabaseUrl });
    client = await pool.connect();

    await client.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await client.query(`SET search_path TO ${quotedSchemaName}, public`);
    await client.query(`
      CREATE TABLE accounts (id varchar PRIMARY KEY);
      CREATE TABLE users (id varchar PRIMARY KEY, account_id varchar NOT NULL REFERENCES accounts(id));
      CREATE TABLE political_parties (id varchar PRIMARY KEY, ideology text NOT NULL);
      CREATE TABLE political_alliances (
        id varchar PRIMARY KEY,
        account_id varchar NOT NULL REFERENCES accounts(id),
        user_id varchar NOT NULL REFERENCES users(id),
        party_id varchar NOT NULL REFERENCES political_parties(id)
      );
    `);

    await client.query(`
      INSERT INTO accounts (id) VALUES ('account-a'), ('account-b');
      INSERT INTO users (id, account_id) VALUES ('user-a', 'account-a'), ('user-b', 'account-b');
      INSERT INTO political_parties (id, ideology) VALUES ('party-left', 'Esquerda'), ('party-unknown', 'Indefinida');
      INSERT INTO political_alliances (id, account_id, user_id, party_id) VALUES
        ('alliance-a-left', 'account-a', 'user-a', 'party-left'),
        ('alliance-b-left', 'account-b', 'user-b', 'party-left'),
        ('alliance-a-unknown', 'account-a', 'user-a', 'party-unknown');
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
      client.release();
    }
    if (pool) await pool.end();
  });

  it("backfills once, remains idempotent, and enforces tenant-safe references", async () => {
    await client.query(migration);

    const firstLines = await client.query<{
      id: string;
      account_id: string;
      name: string;
      color: string;
    }>("SELECT id, account_id, name, color FROM alliance_lines ORDER BY account_id");
    expect(firstLines.rows).toEqual([
      expect.objectContaining({ account_id: "account-a", name: "Esquerda", color: "#ef4444" }),
      expect.objectContaining({ account_id: "account-b", name: "Esquerda", color: "#ef4444" }),
    ]);

    const firstAssignments = await client.query<{ id: string; line_id: string | null }>(
      "SELECT id, line_id FROM political_alliances ORDER BY id",
    );
    expect(firstAssignments.rows).toEqual([
      expect.objectContaining({ id: "alliance-a-left", line_id: firstLines.rows[0].id }),
      expect.objectContaining({ id: "alliance-a-unknown", line_id: null }),
      expect.objectContaining({ id: "alliance-b-left", line_id: firstLines.rows[1].id }),
    ]);

    await client.query(migration);

    const secondLines = await client.query<{ id: string }>("SELECT id FROM alliance_lines ORDER BY account_id");
    const secondAssignments = await client.query<{ id: string; line_id: string | null }>(
      "SELECT id, line_id FROM political_alliances ORDER BY id",
    );
    expect(secondLines.rows).toEqual(firstLines.rows.map(({ id }) => ({ id })));
    expect(secondAssignments.rows).toEqual(firstAssignments.rows);

    await expect(client.query(
      "INSERT INTO political_alliances (id, account_id, user_id, party_id, line_id) VALUES ('cross-tenant', 'account-b', 'user-b', 'party-left', $1)",
      [firstLines.rows[0].id],
    )).rejects.toMatchObject({ code: "23503" });

    await expect(client.query("DELETE FROM alliance_lines WHERE id = $1", [firstLines.rows[0].id]))
      .rejects.toMatchObject({ code: "23503" });
  });
});

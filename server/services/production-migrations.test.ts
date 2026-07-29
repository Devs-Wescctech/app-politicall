import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProductionMigrations } from "./production-migrations";

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
];

type Query = { sql: string; parameters?: unknown[] };

class FakePoolClient {
  readonly queries: Query[] = [];
  readonly recorded = new Map<string, string>();
  released = false;
  accountsExists = false;
  failSql: string | undefined;

  async query(sql: string, parameters?: unknown[]) {
    this.queries.push({ sql, parameters });

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
      this.recorded.set(parameters?.[0] as string, parameters?.[1] as string);
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
    expect(queriesMatching(client, /^BEGIN$/)).toHaveLength(9);
    expect(queriesMatching(client, /^COMMIT$/)).toHaveLength(9);
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

  it("uses only the approved production manifest and never the development seeding script", async () => {
    const service = await readFile(path.join(rootDir, "server/services/production-migrations.ts"), "utf8");

    expect(service).toContain("scripts/full_schema.sql");
    for (const name of migrationNames) expect(service).toContain(name);
    expect(service).not.toContain("setup-dev-db");
    expect(service).not.toMatch(/seed(?:Account|Admin|Sample)/i);
    expect(service).not.toContain("0000_yummy_microchip.sql");
    expect(service).not.toContain("0001_unusual_mentor.sql");
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

async function readArtifact(relativePath: string) {
  return readFile(path.join(rootDir, relativePath), "utf8").catch(() => "");
}

describe("attendance connection thread identity migration", () => {
  it("fails closed on duplicate non-null composite identities and creates an idempotent partial index", async () => {
    const migration = await readArtifact("migrations/0022_attendance_connection_thread_identity.sql");

    expect(migration).toMatch(/IF EXISTS\s*\(\s*SELECT 1\s+FROM att_conversations[\s\S]*GROUP BY account_id, connection_id, external_thread_id[\s\S]*HAVING COUNT\(\*\) > 1/s);
    expect(migration).toContain("RAISE EXCEPTION 'Duplicate attendance threads exist for account/connection/external_thread_id; resolve them before applying 0022'");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS att_conversations_account_connection_thread_uidx");
    expect(migration).toContain("ON att_conversations (account_id, connection_id, external_thread_id)");
    expect(migration).toContain("WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL");
    expect(migration).not.toMatch(/\bDELETE\b/i);
  });

  it("keeps fresh-schema and every migration manifest in parity", async () => {
    const [productionMigrations, productionIntegration, setup, freshSchema] = await Promise.all([
      readArtifact("server/services/production-migrations.ts"),
      readArtifact("server/services/production-migrations.integration.test.ts"),
      readArtifact("scripts/setup-dev-db.ts"),
      readArtifact("scripts/full_schema.sql"),
    ]);

    for (const manifest of [productionMigrations, productionIntegration]) {
      expect(manifest).toContain("0022_attendance_connection_thread_identity.sql");
    }
    expect(setup).toContain('import { runProductionMigrations } from "../server/services/production-migrations"');
    expect(setup).toContain("runProductionMigrations(pool, process.cwd()");
    expect(freshSchema).toContain("CREATE UNIQUE INDEX att_conversations_account_connection_thread_uidx");
    expect(freshSchema).toContain("(account_id, connection_id, external_thread_id)");
    expect(freshSchema).toContain("(connection_id IS NOT NULL) AND (external_thread_id IS NOT NULL)");
  });
});

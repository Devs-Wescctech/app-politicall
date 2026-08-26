import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectFile = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

describe("database migration strategy", () => {
  it("uses the transactional hashed migrator for both production and development", async () => {
    const [productionMigrator, developmentSetup, developmentServer] = await Promise.all([
      projectFile("server/services/production-migrations.ts"),
      projectFile("scripts/setup-dev-db.ts"),
      projectFile("server/index.ts"),
    ]);

    expect(productionMigrator).toContain("0023_reconcile_schema_contract.sql");
    expect(productionMigrator).toContain("0024_remove_empty_stale_baseline_tables.sql");
    expect(productionMigrator).toContain("0025_reconcile_remaining_baseline_drift.sql");
    expect(developmentSetup).toContain('import { runProductionMigrations } from "../server/services/production-migrations"');
    expect(developmentSetup).toContain("await runProductionMigrations(pool, process.cwd(), {");
    expect(developmentSetup).toContain("beforeMigrations:");
    expect(developmentSetup).not.toContain("async function applyMigration");
    expect(developmentSetup).not.toContain("applyBootstrapViaPsql");
    expect(developmentServer).toContain('execSync("npx tsx scripts/setup-dev-db.ts"');
    expect(developmentServer).not.toContain("if (missing.length === 0) return;");
  });

  it("ships a forward-only idempotent reconciliation without deleting production data", async () => {
    const migration = await projectFile("migrations/0023_reconcile_schema_contract.sql");

    expect(migration).toMatch(/ALTER TABLE leads\s+ADD COLUMN IF NOT EXISTS is_read/);
    expect(migration).toContain("ALTER TABLE google_calendar_integrations");
    expect(migration).toContain("ALTER TABLE survey_campaigns");
    expect(migration).toContain("ALTER TABLE survey_responses");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("removes stale baseline tables only after proving they contain no data", async () => {
    const migration = await projectFile("migrations/0024_remove_empty_stale_baseline_tables.sql");

    for (const table of [
      "contact_activities",
      "field_operatives",
      "google_ads_campaign_assets",
      "google_ads_campaigns",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toMatch(/IF EXISTS[\s\S]+count\(\*\)[\s\S]+RAISE EXCEPTION/i);
    expect(migration).toMatch(/DROP TABLE IF EXISTS/i);
    expect(migration).toContain("contacts.field_operative_id");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("reconciles remaining baseline columns and the contact identity index without silent data loss", async () => {
    const migration = await projectFile("migrations/0025_reconcile_remaining_baseline_drift.sql");

    for (const column of ["api_key_usage.message", "google_calendar_integrations.scopes", "is_active", "token_expiry"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toMatch(/count\(\*\)[\s\S]+RAISE EXCEPTION/i);
    expect(migration).toContain("token_expiry_date = token_expiry AT TIME ZONE 'UTC'");
    expect(migration).toContain("DROP INDEX IF EXISTS contacts_account_normalized_name_idx");
    expect(migration).toMatch(/CREATE INDEX contacts_account_normalized_name_idx\s+ON contacts\(account_id, normalized_name\)/);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});

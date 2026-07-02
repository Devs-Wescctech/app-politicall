import { createRequire } from "module";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { SQL, is } from "drizzle-orm";
import * as schema from "../shared/schema";

const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const dialect = new PgDialect();

const ATTENDANCE_TABLE_EXPORTS = [
  "channelConnections",
  "attSectors",
  "sectorMembers",
  "attQueues",
  "attQueueMembers",
  "attConversations",
  "attMessages",
  "attAttachments",
  "quickReplies",
  "attNotes",
  "attAutomation",
  "attLabels",
  "attContactLabels",
  "attConversationLabels",
  "attImportJobs",
  "integrationLogs",
  "attConversationEvents",
  "attTransfers",
] as const;

// Tables that already exist in production and should only receive additive
// ADD COLUMN IF NOT EXISTS statements (never CREATE / never destructive).
const ALTER_ONLY_TABLE_EXPORTS = ["integrations"] as const;

function formatDefault(column: any): string | null {
  if (!column.hasDefault) return null;
  const def = column.default;
  if (def === undefined) return null;
  if (is(def, SQL)) {
    return dialect.sqlToQuery(def as SQL).sql;
  }
  if (typeof def === "string") {
    return `'${def.replace(/'/g, "''")}'`;
  }
  if (typeof def === "boolean" || typeof def === "number") {
    return String(def);
  }
  // Arrays / objects -> serialize as JSON literal for jsonb columns.
  return `'${JSON.stringify(def).replace(/'/g, "''")}'`;
}

function buildInlinePkColumnDefs(table: any): string {
  // Re-render including "PRIMARY KEY" inline for the single primary column.
  const { name, columns } = getTableConfig(table);
  const colDefs: string[] = [];
  for (const column of columns) {
    let def = `"${column.name}" ${column.getSQLType()}`;
    const defaultText = formatDefault(column);
    if (defaultText !== null) def += ` DEFAULT ${defaultText}`;
    if (column.primary) def += " PRIMARY KEY";
    if (column.notNull && !column.primary) def += " NOT NULL";
    colDefs.push(def);
  }
  const body = colDefs.join(",\n  ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (\n  ${body}\n);`;
}

function buildAddColumns(table: any): string[] {
  const { name, columns } = getTableConfig(table);
  const stmts: string[] = [];
  for (const column of columns) {
    // Additive & safe: never NOT NULL here (may run against tables with rows).
    let def = `ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS "${column.name}" ${column.getSQLType()}`;
    const defaultText = formatDefault(column);
    if (defaultText !== null) def += ` DEFAULT ${defaultText}`;
    stmts.push(def + ";");
  }
  return stmts;
}

function buildFullSql(): string {
  const parts: string[] = [];
  parts.push("-- Additive attendance + integrations migration (idempotent).");
  parts.push("-- Generated from shared/schema.ts. Safe to run repeatedly.");
  parts.push("-- CREATE TABLE IF NOT EXISTS for new attendance tables; ADD COLUMN IF NOT EXISTS for additive columns.");
  parts.push("");
  for (const exportName of ATTENDANCE_TABLE_EXPORTS) {
    const table = (schema as any)[exportName];
    if (!table) throw new Error(`Missing schema export: ${exportName}`);
    parts.push(buildInlinePkColumnDefs(table));
    for (const alter of buildAddColumns(table)) parts.push(alter);
    parts.push("");
  }
  parts.push("-- Additive columns on pre-existing production tables (never destructive).");
  for (const exportName of ALTER_ONLY_TABLE_EXPORTS) {
    const table = (schema as any)[exportName];
    if (!table) throw new Error(`Missing schema export: ${exportName}`);
    for (const alter of buildAddColumns(table)) parts.push(alter);
    parts.push("");
  }
  return parts.join("\n");
}

async function emitSqlFile() {
  const { writeFileSync, mkdirSync } = require("fs");
  const path = require("path");
  const outPath = path.resolve(process.cwd(), "migrations", "0005_attendance_omni.sql");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildFullSql(), "utf8");
  console.log(`Wrote idempotent migration SQL to ${outPath}`);
}

async function main() {
  if (process.env.EMIT_SQL) {
    await emitSqlFile();
    return;
  }
  const url = process.env.DATABASE_URL as string;
  const isNeon = url.includes("neon.tech") || url.includes("neon-");
  let pool: any;
  if (isNeon) {
    const { Pool, neonConfig } = require("@neondatabase/serverless");
    const ws = require("ws");
    neonConfig.webSocketConstructor = ws;
    pool = new Pool({ connectionString: url });
  } else {
    const { Pool } = require("pg");
    try {
      pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
      await pool.query("SELECT 1");
    } catch (e) {
      await pool?.end?.().catch(() => {});
      pool = new Pool({ connectionString: url, ssl: false });
      await pool.query("SELECT 1");
    }
  }

  const verifyTables = ["accounts", "users", "contacts", "petitions", "integrations"];
  const before: Record<string, number> = {};
  for (const t of verifyTables) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      before[t] = r.rows[0].c;
    } catch {
      before[t] = -1;
    }
  }
  console.log("Row counts BEFORE:", JSON.stringify(before));

  let created = 0;
  let altered = 0;

  for (const exportName of ATTENDANCE_TABLE_EXPORTS) {
    const table = (schema as any)[exportName];
    if (!table) throw new Error(`Missing schema export: ${exportName}`);
    const createSql = buildInlinePkColumnDefs(table);
    await pool.query(createSql);
    created++;
    for (const alter of buildAddColumns(table)) {
      await pool.query(alter);
      altered++;
    }
  }

  for (const exportName of ALTER_ONLY_TABLE_EXPORTS) {
    const table = (schema as any)[exportName];
    if (!table) throw new Error(`Missing schema export: ${exportName}`);
    for (const alter of buildAddColumns(table)) {
      await pool.query(alter);
      altered++;
    }
  }

  const after: Record<string, number> = {};
  for (const t of verifyTables) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      after[t] = r.rows[0].c;
    } catch {
      after[t] = -1;
    }
  }
  console.log("Row counts AFTER: ", JSON.stringify(after));

  const attList = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'att_%' OR table_name IN ('channel_connections','quick_replies','sector_members','integration_logs')) ORDER BY table_name`,
  );
  console.log("Attendance tables present:", attList.rows.map((r: any) => r.table_name).join(", "));

  const intCols = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='integrations'`,
  );
  console.log("integrations column count:", intCols.rows[0].c);

  // Data-intact assertion (ignore tables that did not exist before).
  for (const t of verifyTables) {
    if (before[t] >= 0 && after[t] >= 0 && after[t] < before[t]) {
      throw new Error(`Row count regression on ${t}: ${before[t]} -> ${after[t]}`);
    }
  }

  console.log(`Migration complete. Tables ensured: ${created}. Column checks: ${altered}.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

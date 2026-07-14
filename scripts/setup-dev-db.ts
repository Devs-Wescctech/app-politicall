/**
 * setup-dev-db.ts
 *
 * Bootstraps the Replit-managed development database (DATABASE_URL) with the
 * full schema and minimum seed data required to test the Politicall platform.
 *
 * Usage (run once after provisioning the workspace Replit DB):
 *   npx tsx scripts/setup-dev-db.ts
 *
 * What it does:
 *   1. On a FRESH DB: applies scripts/full_schema.sql (complete pg_dump schema —
 *      all 47 tables, indexes, and constraints) via psql.
 *   2. On an EXISTING DB: applies incremental migrations idempotently to catch up.
 *   3. Seeds: 1 gabinete (account), 1 admin user, 5 contacts, 4 demands, 3 events.
 *
 * Test credentials:
 *   Email   : adm@politicall.com.br
 *   Password: admin123
 *
 * IMPORTANT: This script targets DATABASE_URL (workspace dev DB only).
 *            NEVER point it at PROD_DATABASE_URL.
 */

import { createRequire } from "module";
import * as fs from "fs";
import { execSync } from "child_process";
import * as bcrypt from "bcrypt";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Provision the Replit managed DB first.");

if (/204\.157\.108\.76/.test(url)) {
  throw new Error(
    "DATABASE_URL appears to point at the production server. Aborting to protect production data."
  );
}

const ssl = /sslmode=require/i.test(url) ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: url, ssl });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
    [name]
  );
  return rows.length > 0;
}

/**
 * Apply the full schema dump via psql.
 * This is the most reliable approach for a complete pg_dump SQL file because
 * psql handles multi-line statements, comments, and SET commands correctly.
 */
function applyBootstrapViaPsql(file: string) {
  const parsed = new URL(url!);
  const env = {
    ...process.env,
    PGPASSWORD: parsed.password,
  };
  const cmd = [
    "psql",
     `-h ${parsed.hostname}`,
     `-p ${parsed.port || 5432}`,
     `-U ${parsed.username}`,
     "-v ON_ERROR_STOP=1",
     `-f ${file}`,
     "--no-password",
     "--quiet",
    parsed.pathname.slice(1), // database name (strip leading slash)
  ].join(" ");

  execSync(cmd, { env, stdio: ["ignore", "ignore", "pipe"] });
  console.log(`  ✓ Applied ${file} via psql`);
}

/**
 * Apply an incremental migration SQL file.
 * Swallows "already exists" / "duplicate column" errors (idempotent re-runs)
 * but re-throws unexpected failures.
 */
async function applyMigration(file: string) {
  if (!fs.existsSync(file)) {
    console.log(`  skip (file not found): ${file}`);
    return;
  }
  const raw = fs.readFileSync(file, "utf8");
  const statements = raw
    .split(/;[ \t]*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(";") ? s : s + ";"));

  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      applied++;
    } catch (e: any) {
      const msg: string = e.message ?? "";
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate column") ||
        msg.includes("42701") || // duplicate_column
        msg.includes("42P07")    // duplicate_table
      ) {
        skipped++;
      } else {
        throw new Error(
          `Migration failed in ${file}:\n  SQL: ${stmt.slice(0, 120)}\n  Error: ${e.message}`
        );
      }
    }
  }
  console.log(`  ✓ ${file} (applied: ${applied}, already-existing skipped: ${skipped})`);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const ADMIN_ACCOUNT_ID = "a1111111-1111-1111-1111-111111111111";
const ADMIN_USER_ID    = "d0476e06-f1b0-4204-8280-111fa6478fc9";
const ADMIN_EMAIL      = "adm@politicall.com.br";
const ADMIN_PASSWORD   = "admin123";

const DEFAULT_ADMIN_PERMISSIONS = {
  dashboard: true, contacts: true, alliances: true, demands: true, agenda: true,
  ai: true, marketing: true, petitions: true, users: true, settings: true,
  whatsappAttendance: true, emailAttendance: true, socialAttendance: true,
  whatsappBroadcast: true, emailBroadcast: true, smsBroadcast: true,
  attendanceReports: true, attendanceSettings: true, attendanceView: true,
  attendanceAssume: true, attendanceRelease: true, attendanceTransfer: true,
  attendanceClose: true, attendanceReopen: true, attendancePause: true,
  attendanceReply: true, attendanceReplyAny: true, attendanceChangePriority: true,
  attendanceChangeAssignee: true, attendanceManageQueues: true,
  attendanceManageDepartments: true, attendanceManageTags: true,
  attendanceFullHistory: true, attendanceAudit: true, attendanceExport: true,
  attendanceEditMessages: true, attendanceDeleteMessages: true,
};

async function seedAccount() {
  await pool.query(
    `INSERT INTO accounts (id, name, created_at)
     VALUES ($1, 'Gabinete Politicall Demo', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN_ACCOUNT_ID]
  );
  console.log("  ✓ Account: Gabinete Politicall Demo");
}

async function seedAdminUser() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, account_id, email, name, password, role, political_position, permissions, slug, created_at)
     VALUES ($1, $2, $3, 'Carlos Nedel', $4, 'admin', 'Vereador', $5::jsonb, 'carlosnedel', NOW())
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
    [ADMIN_USER_ID, ADMIN_ACCOUNT_ID, ADMIN_EMAIL, hash, JSON.stringify(DEFAULT_ADMIN_PERMISSIONS)]
  );
  console.log(`  ✓ Admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

async function seedSampleData() {
  const contacts = [
    ["cnt-dev-001", "Maria Silva",    "maria.silva@email.com",   "(11) 98765-4321", 45, "Feminino",  "SP", "São Paulo"],
    ["cnt-dev-002", "João Oliveira",  "joao.oliveira@email.com", "(11) 91234-5678", 38, "Masculino", "SP", "Campinas"],
    ["cnt-dev-003", "Ana Costa",      "ana.costa@email.com",     "(21) 99887-7665", 52, "Feminino",  "RJ", "Rio de Janeiro"],
    ["cnt-dev-004", "Pedro Santos",   "pedro.santos@email.com",  "(31) 98001-1234", 29, "Masculino", "MG", "Belo Horizonte"],
    ["cnt-dev-005", "Lucia Ferreira", "lucia.f@email.com",       "(85) 97654-3210", 61, "Feminino",  "CE", "Fortaleza"],
  ];
  for (const [id, name, email, phone, age, gender, state, city] of contacts) {
    await pool.query(
      `INSERT INTO contacts (id,account_id,user_id,name,email,phone,age,gender,state,city,source,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Evento Político',NOW()) ON CONFLICT (id) DO NOTHING`,
      [id, ADMIN_ACCOUNT_ID, ADMIN_USER_ID, name, email, phone, age, gender, state, city]
    );
  }
  console.log("  ✓ 5 sample contacts");

  const demands = [
    ["dem-dev-001", "Asfalto Rua das Flores",    "Moradores solicitam recapeamento urgente.", "em_andamento", "alta",  "Secretaria de Obras"],
    ["dem-dev-002", "Iluminação Pública Central", "Lâmpadas queimadas no Bairro Central.",    "aberta",       "media", "SAAE"],
    ["dem-dev-003", "Nova Creche Comunitária",    "Famílias pedem creche no bairro.",         "aberta",       "alta",  "Secretaria de Educação"],
    ["dem-dev-004", "Posto de Saúde 24h",         "Ampliar atendimento noturno.",             "concluida",    "media", "Secretaria de Saúde"],
  ];
  for (const [id, title, desc, status, priority, assignee] of demands) {
    await pool.query(
      `INSERT INTO demands (id,account_id,user_id,title,description,status,priority,assignee,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
      [id, ADMIN_ACCOUNT_ID, ADMIN_USER_ID, title, desc, status, priority, assignee]
    );
  }
  console.log("  ✓ 4 sample demands");

  const base = new Date();
  const events: [string, string, string, number, number, string, string][] = [
    ["evt-dev-001", "Reunião com Lideranças",   "Encontro com líderes do bairro.",  1, 2, "reuniao",   "Câmara Municipal"],
    ["evt-dev-002", "Visita à Escola Estadual", "Visita de rotina — ouvidoria.",    3, 4, "visita",    "Escola Estadual Centro"],
    ["evt-dev-003", "Audiência Pública Saúde",  "Audiência sobre saúde municipal.", 5, 8, "audiencia", "Câmara de Vereadores"],
  ];
  for (const [id, title, desc, dStart, dEnd, cat, loc] of events) {
    const s = new Date(base); s.setDate(s.getDate() + dStart); s.setHours(9, 0, 0, 0);
    const e = new Date(base); e.setDate(e.getDate() + dEnd);   e.setHours(11, 0, 0, 0);
    await pool.query(
      `INSERT INTO events (id,account_id,user_id,title,description,start_date,end_date,category,location,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT (id) DO NOTHING`,
      [id, ADMIN_ACCOUNT_ID, ADMIN_USER_ID, title, desc, s, e, cat, loc]
    );
  }
  console.log("  ✓ 3 sample events (upcoming)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { rows } = await pool.query("SELECT version()");
  console.log("Connected:", rows[0].version.split(" ").slice(0, 2).join(" "));
  console.log("Host:", new URL(url!).host);

  // Step 1 — schema bootstrap
  const fresh = !(await tableExists("accounts"));
  if (fresh) {
    console.log("\n=== Schema bootstrap (fresh DB) ===");
    console.log("  Applying scripts/full_schema.sql via psql …");
    applyBootstrapViaPsql("scripts/full_schema.sql");
  } else {
    // Step 2 — incremental migrations for existing DBs
    console.log("\n=== Incremental migrations (existing DB) ===");
    await applyMigration("migrations/0001_add_permissions.sql");
    await applyMigration("migrations/0002_remove_permissions_default.sql");
    await applyMigration("migrations/0003_add_google_event_id.sql");
    await applyMigration("migrations/0005_attendance_omni.sql");
  }

  await applyMigration("migrations/0006_campaign_center.sql");
  await applyMigration("migrations/0007_contact_neighborhood.sql");
  await applyMigration("migrations/0008_att_messages_external_id_unique.sql");
  await applyMigration("migrations/0009_petitionsbr_module.sql");

  // Step 3 — seed test data
  console.log("\n=== Seeding test data ===");
  await seedAccount();
  await seedAdminUser();
  await seedSampleData();

  // Summary
  const [c, d, e, p] = await Promise.all([
    pool.query("SELECT count(*) n FROM contacts  WHERE account_id=$1", [ADMIN_ACCOUNT_ID]),
    pool.query("SELECT count(*) n FROM demands   WHERE account_id=$1", [ADMIN_ACCOUNT_ID]),
    pool.query("SELECT count(*) n FROM events    WHERE account_id=$1", [ADMIN_ACCOUNT_ID]),
    pool.query("SELECT count(*) n FROM political_parties"),
  ]);
  console.log("\n=== DB summary ===");
  console.log(`  contacts: ${c.rows[0].n}  demands: ${d.rows[0].n}  events: ${e.rows[0].n}  parties: ${p.rows[0].n}`);
  console.log("\nDone. Log in at /login with:");
  console.log(`  Email   : ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);

  await pool.end();
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});

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
 *   1. Uses the same transactional, hashed migration runner as production.
 *   2. Seeds demo data after the baseline and before incremental migrations.
 *   3. Re-runs safely: recorded migration hashes must remain immutable.
 *
 * Test credentials:
 *   Email   : adm@politicall.com.br
 *   Password: admin123
 *
 * IMPORTANT: This script targets DATABASE_URL (workspace dev DB only).
 *            NEVER point it at PROD_DATABASE_URL.
 */

import { createRequire } from "module";
import * as bcrypt from "bcrypt";
import { runProductionMigrations } from "../server/services/production-migrations";
import { assertDevelopmentSeedTarget } from "./development-database-safety";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Provision the Replit managed DB first.");

assertDevelopmentSeedTarget({
  databaseUrl: url,
  productionDatabaseUrl: process.env.PROD_DATABASE_URL,
  confirmation: process.env.ALLOW_DEVELOPMENT_SEED,
  nodeEnv: process.env.NODE_ENV,
});

const ssl = /sslmode=require/i.test(url) ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: url, ssl });

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

  console.log("\n=== Transactional schema migration + demo seed ===");
  const migrationResult = await runProductionMigrations(pool, process.cwd(), {
    beforeMigrations: async () => {
      console.log("\n=== Seeding test data before incremental migrations ===");
      await seedAccount();
      await seedAdminUser();
      await seedSampleData();
    },
  });
  console.log(
    `  migrations applied: ${migrationResult.applied.length}; ` +
    `already current: ${migrationResult.skipped.length}; ` +
    `baseline applied: ${migrationResult.baselineApplied ? "yes" : "no"}`,
  );

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

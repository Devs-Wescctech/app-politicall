import { Pool } from "pg";
import { runProductionMigrations } from "../server/services/production-migrations";

function createProductionPool(connectionString: string): Pool {
  const needsSsl = /sslmode=require/i.test(connectionString);
  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("Production migration runner requires NODE_ENV=production");
  }
  if (!process.env.PROD_DATABASE_URL) {
    throw new Error("Production migration runner requires PROD_DATABASE_URL");
  }

  const pool = createProductionPool(process.env.PROD_DATABASE_URL);
  try {
    const result = await runProductionMigrations(pool, process.cwd());
    console.log(`baseline=${result.baselineApplied ? "applied" : "skipped"}`);
    console.log(`applied=${result.applied.length} skipped=${result.skipped.length}`);
    if (result.applied.length > 0) console.log(`applied_ids=${result.applied.join(",")}`);
    if (result.skipped.length > 0) console.log(`skipped_ids=${result.skipped.join(",")}`);
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Production migration runner failed");
  process.exitCode = 1;
});

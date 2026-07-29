import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool, type PoolConfig } from "pg";
import {
  runProductionMigrations,
  type MigrationRunResult,
} from "../server/services/production-migrations";

type MigrationPool = Parameters<typeof runProductionMigrations>[0];
type ClosableMigrationPool = MigrationPool & { end(): Promise<void> };
type CliEnvironment = Readonly<Record<string, string | undefined>>;

export interface ProductionMigrationCliOptions {
  env?: CliEnvironment;
  rootDir?: string;
  createPool?: (options: PoolConfig) => ClosableMigrationPool;
  runMigrations?: (
    pool: MigrationPool,
    rootDir: string,
  ) => Promise<MigrationRunResult>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

export function createProductionPoolOptions(connectionString: string): PoolConfig {
  const needsSsl = /sslmode=require/i.test(connectionString);
  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  };
}

function requireProductionDatabaseUrl(env: CliEnvironment): string {
  if (env.NODE_ENV !== "production") {
    throw new Error("Production migration runner requires NODE_ENV=production");
  }
  if (!env.PROD_DATABASE_URL) {
    throw new Error("Production migration runner requires PROD_DATABASE_URL");
  }
  return env.PROD_DATABASE_URL;
}

export async function runProductionMigrationCli(
  options: ProductionMigrationCliOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const rootDir = options.rootDir ?? process.cwd();
  const createPool = options.createPool ?? ((poolOptions) => new Pool(poolOptions));
  const runMigrations = options.runMigrations ?? runProductionMigrations;
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  let pool: ClosableMigrationPool | undefined;

  try {
    const connectionString = requireProductionDatabaseUrl(env);
    pool = createPool(createProductionPoolOptions(connectionString));
    const result = await runMigrations(pool, rootDir);
    stdout(`baseline_applied=${result.baselineApplied ? 1 : 0}`);
    stdout(`applied_count=${result.applied.length}`);
    stdout(`skipped_count=${result.skipped.length}`);
    if (result.applied.length > 0) stdout(`applied_ids=${result.applied.join(",")}`);
    if (result.skipped.length > 0) stdout(`skipped_ids=${result.skipped.join(",")}`);
    return 0;
  } catch {
    stderr("Production migration runner failed");
    return 1;
  } finally {
    if (pool) await pool.end();
  }
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  void runProductionMigrationCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      console.error("Production migration runner failed");
      process.exitCode = 1;
    },
  );
}

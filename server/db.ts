// Database connection - supports both Neon (Replit) and standard PostgreSQL (production)
import { createRequire } from 'module';
import * as schema from "@shared/schema";

const require = createRequire(import.meta.url);

// Connection selection:
// - In production (NODE_ENV=production) PROD_DATABASE_URL is required so the live site
//   always uses the external production database — never the workspace dev database.
//   If PROD_DATABASE_URL is absent in production the server fails fast at startup.
// - In development/testing DATABASE_URL is used, which points to the Replit-managed
//   workspace PostgreSQL database (never the production database).
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.PROD_DATABASE_URL) {
  throw new Error(
    "PROD_DATABASE_URL must be set in production. " +
    "Add the external production database URL as a secret named PROD_DATABASE_URL " +
    "in the Replit Secrets panel before publishing."
  );
}

const connectionString = isProduction
  ? process.env.PROD_DATABASE_URL!
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

const isNeonDatabase = connectionString.includes('neon.tech') ||
                       connectionString.includes('neon-');

// Enable SSL when the connection string requests it (Replit-managed and most
// hosted providers use sslmode=require). Standard/self-hosted PostgreSQL that
// does not advertise SSL keeps ssl disabled to preserve existing behavior.
const needsSsl = /sslmode=require/i.test(connectionString);

let db: any;
let pool: any;

if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  const { Pool, neonConfig } = require('@neondatabase/serverless');
  const { drizzle } = require('drizzle-orm/neon-serverless');
  const ws = require('ws');
  
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString });
  db = drizzle({ client: pool, schema });
} else {
  // Use standard pg driver for regular PostgreSQL
  const { Pool: PgPool } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  
  pool = new PgPool({ 
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false
  });
  db = drizzle(pool, { schema });
}

export { pool, db };

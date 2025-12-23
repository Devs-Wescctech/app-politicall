// Database connection - supports both Neon (Replit) and standard PostgreSQL (production)
import { createRequire } from 'module';
import * as schema from "@shared/schema";

const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') || 
                       process.env.DATABASE_URL.includes('neon-');

let db: any;
let pool: any;

if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  const { Pool, neonConfig } = require('@neondatabase/serverless');
  const { drizzle } = require('drizzle-orm/neon-serverless');
  const ws = require('ws');
  
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  // Use standard pg driver for regular PostgreSQL
  const { Pool: PgPool } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  
  pool = new PgPool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: false
  });
  db = drizzle(pool, { schema });
}

export { pool, db };

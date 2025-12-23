// Database connection - supports both Neon (Replit) and standard PostgreSQL (production)
import * as schema from "@shared/schema";

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
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = (await import('ws')).default;
  
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  // Use standard pg driver for regular PostgreSQL
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  
  pool = new pg.default.Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: false  // Disable SSL for local PostgreSQL
  });
  db = drizzle(pool, { schema });
}

export { pool, db };

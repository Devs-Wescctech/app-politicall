import { Pool } from "pg";

const accountId = "a1111111-1111-1111-1111-111111111111";

export default async function globalTeardown(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM demands WHERE account_id = $1 AND title LIKE 'E2E Playwright%'", [accountId]);
    await pool.query("DELETE FROM petitions WHERE account_id = $1 AND slug = 'e2e-playwright-petition'", [accountId]);
    await pool.query("DELETE FROM contacts WHERE account_id = $1 AND email = 'e2e.playwright@politicall.test'", [accountId]);
    await pool.query("DELETE FROM att_messages WHERE account_id = $1 AND conversation_id = 'e2e-attendance-conversation'", [accountId]);
    await pool.query("DELETE FROM att_conversations WHERE account_id = $1 AND id = 'e2e-attendance-conversation'", [accountId]);
    await pool.query("DELETE FROM contacts WHERE account_id = $1 AND id = 'e2e-attendance-contact'", [accountId]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

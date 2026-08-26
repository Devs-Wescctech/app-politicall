import { Pool } from "pg";

export const E2E_ALLIANCE_ACCOUNT_ID = "a1111111-1111-1111-1111-111111111111";
const E2E_ALLIANCE_ADMIN_USER_ID = "d0476e06-f1b0-4204-8280-111fa6478fc9";
const E2E_LEGACY_ALLIANCE_ID = "e2e-legacy-alliance-line";
export const E2E_ALLIANCE_LINE_NAME = "Linha E2E Playwright";
export const E2E_ALLY_NAME = "Aliado E2E Linha Politica";
export const E2E_LEGACY_ALLY_NAME = "Aliado E2E Sem Linha";

export async function cleanupAllianceLineFixtures(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for alliance-line E2E cleanup");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("BEGIN");
    await pool.query(
      "DELETE FROM political_alliances WHERE account_id = $1 AND (ally_name = $2 OR id = $3)",
      [E2E_ALLIANCE_ACCOUNT_ID, E2E_ALLY_NAME, E2E_LEGACY_ALLIANCE_ID],
    );
    await pool.query(
      "DELETE FROM alliance_lines WHERE account_id = $1 AND name = $2",
      [E2E_ALLIANCE_ACCOUNT_ID, E2E_ALLIANCE_LINE_NAME],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

export async function seedLegacyAllianceFixture(): Promise<string> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for alliance-line E2E setup");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const partyResult = await pool.query<{ id: string; acronym: string }>(
      "SELECT id, acronym FROM political_parties ORDER BY acronym LIMIT 1",
    );
    const party = partyResult.rows[0];
    if (!party) throw new Error("At least one political party is required for alliance-line E2E setup");

    await pool.query(
      `INSERT INTO political_alliances (id, account_id, user_id, party_id, ally_name, notes, line_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'Registro legado E2E', NULL, NOW())
       ON CONFLICT (id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         user_id = EXCLUDED.user_id,
         party_id = EXCLUDED.party_id,
         ally_name = EXCLUDED.ally_name,
         notes = EXCLUDED.notes,
         line_id = NULL`,
      [E2E_LEGACY_ALLIANCE_ID, E2E_ALLIANCE_ACCOUNT_ID, E2E_ALLIANCE_ADMIN_USER_ID, party.id, E2E_LEGACY_ALLY_NAME],
    );
    return party.acronym;
  } finally {
    await pool.end();
  }
}

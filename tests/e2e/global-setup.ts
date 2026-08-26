import { Pool } from "pg";

const accountId = "a1111111-1111-1111-1111-111111111111";
const adminUserId = "d0476e06-f1b0-4204-8280-111fa6478fc9";
const contactId = "e2e-attendance-contact";
const conversationId = "e2e-attendance-conversation";
const messageId = "e2e-attendance-message";

export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for E2E setup");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM demands WHERE account_id = $1 AND title LIKE 'E2E Playwright%'", [accountId]);
    await pool.query("DELETE FROM petitions WHERE account_id = $1 AND slug = 'e2e-playwright-petition'", [accountId]);
    await pool.query("DELETE FROM contacts WHERE account_id = $1 AND email = 'e2e.playwright@politicall.test'", [accountId]);

    await pool.query(`
      INSERT INTO contacts (id, account_id, user_id, name, email, phone, source, created_at)
      VALUES ($1, $2, $3, 'Eleitor E2E Atendimento', 'e2e.attendance@politicall.test', '5551999990000', 'E2E', NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
    `, [contactId, accountId, adminUserId]);

    await pool.query(`
      INSERT INTO att_conversations (
        id, account_id, contact_id, channel, provider, external_thread_id,
        external_contact_id, contact_name, contact_phone, mode, status,
        assigned_user_id, assigned_at, assigned_by_user_id, last_message_at,
        last_message_preview, unread_count, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'whatsapp', 'wescctech', 'e2e-thread', '5551999990000',
        'Eleitor E2E Atendimento', '5551999990000', 'automatic', 'waiting_agent',
        NULL, NULL, NULL, '2026-08-12 10:15:30', 'Mensagem recebida no horário correto', 1, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        mode = 'automatic', status = 'waiting_agent', assigned_user_id = NULL,
        assigned_at = NULL, assigned_by_user_id = NULL,
        last_message_at = EXCLUDED.last_message_at, updated_at = NOW()
    `, [conversationId, accountId, contactId]);

    await pool.query(`
      INSERT INTO att_messages (
        id, account_id, conversation_id, contact_id, direction, channel, provider,
        external_message_id, body, message_type, status, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, 'inbound', 'whatsapp', 'wescctech', 'e2e-provider-message',
        'Mensagem recebida no horário correto', 'text', 'received',
        '{"remote":{"dhMessage":"2026-08-12T10:15:30"}}'::jsonb,
        '2026-08-12 10:15:30'
      )
      ON CONFLICT (id) DO UPDATE SET
        metadata = EXCLUDED.metadata, created_at = EXCLUDED.created_at
    `, [messageId, accountId, conversationId, contactId]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

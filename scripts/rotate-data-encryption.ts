import { Pool, type PoolClient } from "pg";
import {
  DATA_ENCRYPTION_ROTATION_INVENTORY,
  rotateDataEncryption,
  type DataKeyRotationStore,
  type RotationRow,
} from "../server/services/data-key-rotation";

const COLUMN_NAMES: Record<string, string> = {
  sendgridApiKey: "sendgrid_api_key", twilioAuthToken: "twilio_auth_token", whatsappToken: "whatsapp_token", smsCode: "sms_code",
  smtpPassword: "smtp_password", imapPassword: "imap_password", locawebApiKey: "locaweb_api_key",
  facebookAppSecret: "facebook_app_secret", facebookPageAccessToken: "facebook_page_access_token", facebookWebhookVerifyToken: "facebook_webhook_verify_token",
  instagramAppSecret: "instagram_app_secret", instagramAccessToken: "instagram_access_token", instagramWebhookVerifyToken: "instagram_webhook_verify_token",
  twitterApiKey: "twitter_api_key", twitterApiSecretKey: "twitter_api_secret_key", twitterBearerToken: "twitter_bearer_token",
  twitterAccessToken: "twitter_access_token", twitterAccessTokenSecret: "twitter_access_token_secret", twitterClientSecret: "twitter_client_secret",
  whatsappAccessToken: "whatsapp_access_token", whatsappAppSecret: "whatsapp_app_secret", whatsappWebhookVerifyToken: "whatsapp_webhook_verify_token",
  openaiApiKey: "openai_api_key", token: "token", clientSecret: "client_secret", accessToken: "access_token", refreshToken: "refresh_token",
};

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error("Invalid internal identifier");
  return `"${identifier}"`;
}

function selectStatement(table: string, field: string): string {
  const tableName = quoteIdentifier(table);
  if (field === "metadata.webhookSecret") {
    return `SELECT '${table}' AS table_name, id::text AS id, '${field}' AS field_name, metadata->>'webhookSecret' AS value FROM ${tableName} WHERE metadata->>'webhookSecret' IS NOT NULL AND metadata->>'webhookSecret' <> ''`;
  }
  const column = quoteIdentifier(COLUMN_NAMES[field]);
  return `SELECT '${table}' AS table_name, id::text AS id, '${field}' AS field_name, ${column} AS value FROM ${tableName} WHERE ${column} IS NOT NULL AND ${column} <> ''`;
}

function createStore(pool: Pool): DataKeyRotationStore {
  const sources = DATA_ENCRYPTION_ROTATION_INVENTORY.map(([table, field]) => selectStatement(table, field)).join(" UNION ALL ");
  let transactionClient: PoolClient | null = null;
  const query = (text: string, values: unknown[]) => (transactionClient ?? pool).query(text, values);
  return {
    async readBatch(cursor, limit) {
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid rotation cursor");
      const result = await pool.query(`${sources} ORDER BY table_name, id, field_name LIMIT $1 OFFSET $2`, [limit, offset]);
      const rows = result.rows.map((row) => ({ table: row.table_name, id: row.id, field: row.field_name, value: row.value })) as RotationRow[];
      return { rows, nextCursor: rows.length === limit ? String(offset + rows.length) : null };
    },
    async transaction(work) {
      if (transactionClient) return work();
      const client = await pool.connect();
      transactionClient = client;
      try {
        await client.query("BEGIN");
        const result = await work();
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        transactionClient = null;
        client.release();
      }
    },
    async compareAndSet(row, encrypted) {
      const table = quoteIdentifier(row.table);
      if (row.field === "metadata.webhookSecret") {
        const result = await query(
          `UPDATE ${table} SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{webhookSecret}', to_jsonb($1::text), true), updated_at = NOW() WHERE id::text = $2 AND metadata->>'webhookSecret' IS NOT DISTINCT FROM $3`,
          [encrypted, row.id, row.value],
        );
        return result.rowCount === 1;
      }
      const column = quoteIdentifier(COLUMN_NAMES[row.field]);
      const result = await query(
        `UPDATE ${table} SET ${column} = $1, updated_at = NOW() WHERE id::text = $2 AND ${column} IS NOT DISTINCT FROM $3`,
        [encrypted, row.id, row.value],
      );
      return result.rowCount === 1;
    },
  };
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  if (process.argv.slice(2).some((argument) => argument !== "--apply" && argument !== "--dry-run")) {
    throw new Error("Usage: node dist/rotate-data-encryption.js [--apply]");
  }
  const databaseUrl = process.env.PROD_DATABASE_URL;
  if (!databaseUrl) throw new Error("PROD_DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const report = await rotateDataEncryption(createStore(pool), {
      apply,
      log: (entry) => console.log(JSON.stringify(entry)),
    });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }));
    if (report.errors > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Data encryption rotation failed");
  process.exitCode = 1;
});

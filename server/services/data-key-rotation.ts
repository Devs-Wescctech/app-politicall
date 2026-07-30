import {
  DataEncryptionError,
  decryptApiKey,
  encryptApiKey,
  getActiveDataEncryptionKeyId,
  getV2KeyId,
  isEncryptedDataValue,
  isMalformedEncryptedDataValue,
} from "../crypto";
import { AI_CONFIG_PROVIDER_SECRET_FIELDS } from "./ai-config-secrets";

export const DATA_ENCRYPTION_ROTATION_INVENTORY = [
  ["integrations", "sendgridApiKey"], ["integrations", "twilioAuthToken"], ["integrations", "whatsappToken"],
  ["integrations", "smsCode"], ["integrations", "smtpPassword"], ["integrations", "imapPassword"], ["integrations", "locawebApiKey"],
  ...AI_CONFIG_PROVIDER_SECRET_FIELDS.map((field) => ["ai_configurations", field] as const),
  ["ai_configurations", "openaiApiKey"],
  ["channel_connections", "token"], ["channel_connections", "metadata.webhookSecret"],
  ["google_calendar_integrations", "clientSecret"], ["google_calendar_integrations", "accessToken"], ["google_calendar_integrations", "refreshToken"],
] as const;

export type RotationRow = { table: string; id: string; field: string; value: string };
export type DataKeyRotationStore = {
  readBatch(cursor: string | null, limit: number): Promise<{ rows: RotationRow[]; nextCursor: string | null }>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  compareAndSet(row: RotationRow, encrypted: string): Promise<boolean>;
};

export type DataKeyRotationReport = {
  scanned: number;
  unchanged: number;
  rotatable: number;
  rotated: number;
  skipped: number;
  errors: number;
};

type RotationCategory = "active_v2" | "previous_v2" | "legacy_v1" | "plaintext" | "malformed" | "undecryptable";
type RotationLog = { table: string; id: string; field: string; category: RotationCategory };

function classify(row: RotationRow): { category: RotationCategory; plaintext?: string } {
  if (isMalformedEncryptedDataValue(row.value)) return { category: "malformed" };
  try {
    const context = row.table === "channel_connections"
      ? { table: row.table, field: row.field, recordId: row.id }
      : undefined;
    const plaintext = decryptApiKey(row.value, context);
    if (!isEncryptedDataValue(row.value)) return { category: "plaintext", plaintext };
    const v2KeyId = getV2KeyId(row.value);
    if (v2KeyId) return { category: v2KeyId === getActiveDataEncryptionKeyId() ? "active_v2" : "previous_v2", plaintext };
    return { category: "legacy_v1", plaintext };
  } catch (error) {
    if (error instanceof DataEncryptionError) return { category: "undecryptable" };
    return { category: "undecryptable" };
  }
}

export async function rotateDataEncryption(
  store: DataKeyRotationStore,
  options: { apply?: boolean; batchSize?: number; log?: (entry: RotationLog) => void } = {},
): Promise<DataKeyRotationReport> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
  const report: DataKeyRotationReport = { scanned: 0, unchanged: 0, rotatable: 0, rotated: 0, skipped: 0, errors: 0 };
  let cursor: string | null = null;
  do {
    const batch = await store.readBatch(cursor, batchSize);
    cursor = batch.nextCursor;
    await store.transaction(async () => {
      for (const row of batch.rows) {
        report.scanned += 1;
        const result = classify(row);
        options.log?.({ table: row.table, id: row.id, field: row.field, category: result.category });
        if (result.category === "active_v2") {
          report.unchanged += 1;
          continue;
        }
        if (result.category === "malformed" || result.category === "undecryptable") {
          report.errors += 1;
          continue;
        }
        report.rotatable += 1;
        if (!options.apply) continue;
        const context = row.table === "channel_connections"
          ? { table: row.table, field: row.field, recordId: row.id }
          : undefined;
        const encrypted = encryptApiKey(result.plaintext!, context);
        if (await store.compareAndSet(row, encrypted)) report.rotated += 1;
        else report.skipped += 1;
      }
    });
  } while (cursor !== null);
  return report;
}

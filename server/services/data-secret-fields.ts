import crypto from "node:crypto";
import { decryptApiKey, encryptApiKey, isEncryptedDataValue } from "../crypto";

const MASKED_VALUES: Set<string> = new Set(["***", "configurado. deixe em branco para manter."]);

export function isBlankOrMaskedDataSecret(value: unknown): boolean {
  return value == null || (typeof value === "string" && (!value.trim() || MASKED_VALUES.has(value.trim().toLowerCase())));
}

function encryptIfProvided(value: unknown, context: { recordId?: string; field: string }): unknown {
  if (typeof value !== "string" || isBlankOrMaskedDataSecret(value)) return undefined;
  const plaintext = isEncryptedDataValue(value) ? decryptApiKey(value) : value.trim();
  return encryptApiKey(plaintext, { table: "channel_connections", field: context.field, recordId: context.recordId });
}

export function prepareChannelConnectionSecrets<T extends Record<string, any>>(input: T, existing?: T | null): T {
  const result: Record<string, any> = { ...input };
  const token = encryptIfProvided(input.token, { recordId: input.id ?? existing?.id, field: "token" });
  if (token === undefined) {
    if (existing?.token != null) result.token = existing.token;
    else delete result.token;
  } else result.token = token;

  const inputMetadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const existingMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const webhookSecret = encryptIfProvided((inputMetadata as any).webhookSecret, { recordId: input.id ?? existing?.id, field: "metadata.webhookSecret" });
  const metadata = { ...existingMetadata, ...inputMetadata } as Record<string, any>;
  if (webhookSecret === undefined) {
    if ((existingMetadata as any).webhookSecret != null) metadata.webhookSecret = (existingMetadata as any).webhookSecret;
    else delete metadata.webhookSecret;
  } else metadata.webhookSecret = webhookSecret;
  result.metadata = metadata;
  return result as T;
}

export function prepareWhatsappOmniConnection<T extends Record<string, any>>(config: T, existing?: T | null): T {
  return prepareChannelConnectionSecrets({ ...config, id: existing?.id ?? crypto.randomUUID() } as T, existing);
}

export function maskChannelConnectionSecrets<T extends Record<string, any>>(connection: T): T {
  const result: Record<string, any> = { ...connection, metadata: { ...(connection.metadata ?? {}) } };
  result.token = connection.token ? "***" : null;
  if (result.metadata.webhookSecret != null) result.metadata.webhookSecret = "***";
  return result as T;
}

export function verifyWebhookSecret(stored: unknown, supplied: unknown, context: { recordId?: string } = {}): boolean {
  if (typeof stored !== "string" || typeof supplied !== "string") return false;
  try {
    const expectedDigest = crypto.createHash("sha256")
      .update(decryptApiKey(stored, { table: "channel_connections", field: "metadata.webhookSecret", recordId: context.recordId }), "utf8")
      .digest();
    const suppliedDigest = crypto.createHash("sha256").update(supplied, "utf8").digest();
    return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
  } catch {
    return false;
  }
}

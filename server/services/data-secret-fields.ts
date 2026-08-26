import crypto from "node:crypto";
import { decryptApiKey, encryptApiKey, isEncryptedDataValue } from "../crypto";
import { fingerprintWhuToken, isWhuConnection, normalizeWhuPhone } from "./whu-connection-identity";

const MASKED_VALUES: Set<string> = new Set(["***", "configurado. deixe em branco para manter."]);

export function isBlankOrMaskedDataSecret(value: unknown): boolean {
  return value == null || (typeof value === "string" && (!value.trim() || MASKED_VALUES.has(value.trim().toLowerCase())));
}

function plaintextIfProvided(value: unknown): string | undefined {
  if (typeof value !== "string" || isBlankOrMaskedDataSecret(value)) return undefined;
  return isEncryptedDataValue(value) ? decryptApiKey(value) : value.trim();
}

function isDisabledConnectionStatus(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "disabled";
}

function isActiveConnectionStatus(status: unknown): boolean {
  return typeof status === "string" && status.trim() !== "" && !isDisabledConnectionStatus(status);
}

function canonicalConnectionValue(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function hasOwn(object: Record<string, any> | null | undefined, property: string): boolean {
  return object != null && Object.prototype.hasOwnProperty.call(object, property);
}

function preparedWhuPhone(value: unknown): string | null {
  return isBlankOrMaskedDataSecret(value) ? null : normalizeWhuPhone(value);
}

function effectiveWhuPhone(
  input: Record<string, any>,
  inputMetadata: Record<string, any>,
  existing: Record<string, any> | null | undefined,
  existingMetadata: Record<string, any>,
): string | null | undefined {
  if (hasOwn(input, "phoneNumber")) return preparedWhuPhone(input.phoneNumber);
  if (hasOwn(inputMetadata, "phoneNumber")) return preparedWhuPhone(inputMetadata.phoneNumber);
  if (hasOwn(existing, "phoneNumber")) return preparedWhuPhone(existing?.phoneNumber);
  if (hasOwn(existingMetadata, "phoneNumber")) return preparedWhuPhone(existingMetadata.phoneNumber);
  return undefined;
}

export function prepareChannelConnectionSecrets<T extends Record<string, any>>(input: T, existing?: T | null): T {
  const result: Record<string, any> = { ...input };
  const recordId = input.id ?? existing?.id;
  const inputMetadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const existingMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const effectiveConnection = {
    channel: canonicalConnectionValue(input.channel ?? existing?.channel),
    provider: canonicalConnectionValue(input.provider ?? existing?.provider ?? "wescctech"),
    status: canonicalConnectionValue(input.status ?? existing?.status),
  };
  const existingConnection = {
    channel: canonicalConnectionValue(existing?.channel),
    provider: canonicalConnectionValue(existing?.provider),
    status: canonicalConnectionValue(existing?.status),
  };
  if (typeof effectiveConnection.channel === "string") result.channel = effectiveConnection.channel;
  if (typeof effectiveConnection.provider === "string") result.provider = effectiveConnection.provider;
  if (typeof effectiveConnection.status === "string") result.status = effectiveConnection.status;
  const tokenPlaintext = plaintextIfProvided(input.token);
  if (tokenPlaintext === undefined) {
    if (existing?.token != null) result.token = existing.token;
    else delete result.token;
  } else result.token = encryptApiKey(tokenPlaintext, { table: "channel_connections", field: "token", recordId });

  delete result.tokenFingerprint;
  if (tokenPlaintext !== undefined && isWhuConnection(effectiveConnection)) {
    result.tokenFingerprint = fingerprintWhuToken(tokenPlaintext);
  } else if (
    isWhuConnection(effectiveConnection)
    && existing?.token
    && (
      existing.tokenFingerprint == null
      || (
        isActiveConnectionStatus(effectiveConnection.status)
        && (
          isDisabledConnectionStatus(existingConnection.status)
          || isActiveConnectionStatus(input.status)
          || !isWhuConnection(existingConnection)
        )
      )
    )
  ) {
    const retainedToken = decryptApiKey(existing.token, { table: "channel_connections", field: "token", recordId });
    result.tokenFingerprint = fingerprintWhuToken(retainedToken);
  } else if (existing?.tokenFingerprint != null) {
    result.tokenFingerprint = existing.tokenFingerprint;
  }

  const webhookSecretPlaintext = plaintextIfProvided((inputMetadata as any).webhookSecret);
  const webhookSecret = webhookSecretPlaintext === undefined
    ? undefined
    : encryptApiKey(webhookSecretPlaintext, { table: "channel_connections", field: "metadata.webhookSecret", recordId });
  const metadata = { ...existingMetadata, ...inputMetadata } as Record<string, any>;
  if (webhookSecret === undefined) {
    if ((existingMetadata as any).webhookSecret != null) metadata.webhookSecret = (existingMetadata as any).webhookSecret;
    else delete metadata.webhookSecret;
  } else metadata.webhookSecret = webhookSecret;
  if (isWhuConnection(effectiveConnection)) {
    const phoneNumber = effectiveWhuPhone(
      input,
      inputMetadata as Record<string, any>,
      existing,
      existingMetadata as Record<string, any>,
    );
    if (phoneNumber !== undefined) {
      result.phoneNumber = phoneNumber;
      metadata.phoneNumber = phoneNumber;
    }
  }
  result.metadata = metadata;
  return result as T;
}

export function prepareWhatsappOmniConnection<T extends Record<string, any>>(config: T, existing?: T | null): T {
  return prepareChannelConnectionSecrets({ ...config, id: existing?.id ?? crypto.randomUUID() } as T, existing);
}

export function maskChannelConnectionSecrets<T extends Record<string, any>>(connection: T): T {
  const result: Record<string, any> = { ...connection, metadata: { ...(connection.metadata ?? {}) } };
  result.hasToken = Boolean(connection.token);
  result.token = connection.token ? "***" : null;
  delete result.tokenFingerprint;
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

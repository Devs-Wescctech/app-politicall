import {
  decryptApiKey,
  encryptApiKey,
  getActiveDataEncryptionKeyId,
  getV2KeyId,
  isEncryptedDataValue,
  isMalformedEncryptedDataValue,
} from "../crypto";

export function normalizeIntegrationSecretForWrite<T>(value: T, existingValue: unknown): T {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "***") return value;
  if (isMalformedEncryptedDataValue(trimmed)) throw new Error("Invalid encrypted integration secret");

  const isTrustedActiveValue = trimmed === existingValue
    && getV2KeyId(trimmed) === getActiveDataEncryptionKeyId();
  if (isTrustedActiveValue) return trimmed as T;

  const plaintext = isEncryptedDataValue(trimmed) ? decryptApiKey(trimmed) : trimmed;
  return encryptApiKey(plaintext) as T;
}

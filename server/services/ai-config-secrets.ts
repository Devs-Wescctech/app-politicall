import {
  decryptApiKey,
  encryptApiKey,
  getActiveDataEncryptionKeyId,
  getV2KeyId,
  isEncryptedDataValue,
  isMalformedEncryptedDataValue,
} from "../crypto";

export const AI_CONFIG_PROVIDER_SECRET_FIELDS = [
  "facebookAppSecret",
  "facebookPageAccessToken",
  "facebookWebhookVerifyToken",
  "instagramAppSecret",
  "instagramAccessToken",
  "instagramWebhookVerifyToken",
  "twitterApiKey",
  "twitterApiSecretKey",
  "twitterBearerToken",
  "twitterAccessToken",
  "twitterAccessTokenSecret",
  "twitterClientSecret",
  "whatsappAccessToken",
  "whatsappAppSecret",
  "whatsappWebhookVerifyToken",
] as const;

const MASKED_SECRET_VALUES = new Set(["***", "configurado. deixe em branco para manter."]);
export function isEncryptedSecret(value: string): boolean {
  return isEncryptedDataValue(value);
}

function isBlankOrMaskedSecret(value: unknown): boolean {
  if (value == null) return true;
  return typeof value === "string" && (!value.trim() || MASKED_SECRET_VALUES.has(value.trim().toLowerCase()));
}

export function encryptAiConfigProviderSecrets<T extends Record<string, any>>(config: T, existing?: Record<string, any> | null): T {
  const encrypted: Record<string, any> = { ...config };

  for (const field of AI_CONFIG_PROVIDER_SECRET_FIELDS) {
    if (!(field in encrypted)) continue;

    const value = encrypted[field];
    if (isBlankOrMaskedSecret(value)) {
      delete encrypted[field];
      continue;
    }

    if (isMalformedEncryptedDataValue(value)) {
      throw new Error("Invalid encrypted provider secret");
    }
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    const isTrustedActiveValue = trimmed === existing?.[field]
      && getV2KeyId(trimmed) === getActiveDataEncryptionKeyId();
    if (isTrustedActiveValue) continue;

    const plaintext = isEncryptedSecret(trimmed) ? decryptApiKey(trimmed) : trimmed;
    encrypted[field] = encryptApiKey(plaintext);
  }

  return encrypted as T;
}

export function decryptAiConfigProviderSecrets<T extends Record<string, any> | null | undefined>(config: T): T {
  if (!config) return config;

  const decrypted: Record<string, any> = { ...config };
  for (const field of AI_CONFIG_PROVIDER_SECRET_FIELDS) {
    const value = decrypted[field];
    if (typeof value !== "string") continue;
    if (isMalformedEncryptedDataValue(value)) throw new Error("Invalid encrypted provider secret");
    if (isEncryptedSecret(value)) decrypted[field] = decryptApiKey(value);
  }

  return decrypted as T;
}

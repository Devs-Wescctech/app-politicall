import { decryptApiKey, encryptApiKey } from "../crypto";

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
const ENCRYPTED_SECRET_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;

export function isEncryptedSecret(value: string): boolean {
  return ENCRYPTED_SECRET_PATTERN.test(value);
}

function isBlankOrMaskedSecret(value: unknown): boolean {
  if (value == null) return true;
  return typeof value === "string" && (!value.trim() || MASKED_SECRET_VALUES.has(value.trim().toLowerCase()));
}

export function encryptAiConfigProviderSecrets<T extends Record<string, any>>(config: T): T {
  const encrypted: Record<string, any> = { ...config };

  for (const field of AI_CONFIG_PROVIDER_SECRET_FIELDS) {
    if (!(field in encrypted)) continue;

    const value = encrypted[field];
    if (isBlankOrMaskedSecret(value)) {
      delete encrypted[field];
      continue;
    }

    if (typeof value === "string" && !isEncryptedSecret(value)) {
      encrypted[field] = encryptApiKey(value.trim());
    }
  }

  return encrypted as T;
}

export function decryptAiConfigProviderSecrets<T extends Record<string, any> | null | undefined>(config: T): T {
  if (!config) return config;

  const decrypted: Record<string, any> = { ...config };
  for (const field of AI_CONFIG_PROVIDER_SECRET_FIELDS) {
    const value = decrypted[field];
    if (typeof value !== "string" || !isEncryptedSecret(value)) continue;

    try {
      decrypted[field] = decryptApiKey(value);
    } catch {
      decrypted[field] = value;
    }
  }

  return decrypted as T;
}

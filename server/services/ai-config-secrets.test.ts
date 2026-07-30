import { beforeEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, getActiveDataEncryptionKeyId, getV2KeyId } from "../crypto";
import {
  decryptAiConfigProviderSecrets,
  encryptAiConfigProviderSecrets,
  isEncryptedSecret,
} from "./ai-config-secrets";

describe("AI config provider secrets", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-ai-config-secrets";
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  });

  it("encrypts and decrypts provider secrets", () => {
    const encrypted = encryptAiConfigProviderSecrets({
      facebookAppId: "app-id",
      facebookAppSecret: "plain-secret",
      facebookPageAccessToken: "page-token",
    });

    expect(encrypted.facebookAppId).toBe("app-id");
    expect(encrypted.facebookAppSecret).not.toBe("plain-secret");
    expect(isEncryptedSecret(encrypted.facebookAppSecret)).toBe(true);

    expect(decryptAiConfigProviderSecrets(encrypted)).toMatchObject({
      facebookAppSecret: "plain-secret",
      facebookPageAccessToken: "page-token",
    });
  });

  it("drops blank and masked provider secrets so existing values are preserved on update", () => {
    expect(encryptAiConfigProviderSecrets({
      facebookAppSecret: "",
      instagramAccessToken: "***",
      facebookPageId: "page-1",
    })).toEqual({
      facebookPageId: "page-1",
    });
  });

  it("preserves only the matching active server value and rewrites legacy or client ciphertext with the active key", () => {
    const active = Buffer.alloc(32, 11).toString("base64");
    const previous = Buffer.alloc(32, 12).toString("base64");
    process.env.DATA_ENCRYPTION_KEY = previous;
    const previousEnvelope = encryptApiKey("stored-secret");
    process.env.DATA_ENCRYPTION_KEY = active;
    process.env.LEGACY_DATA_ENCRYPTION_KEY = previous;
    const storedActive = encryptApiKey("stored-secret");
    const clientActive = encryptApiKey("client-secret");

    const rewrittenPrevious = encryptAiConfigProviderSecrets(
      { whatsappAppSecret: previousEnvelope },
      { whatsappAppSecret: storedActive },
    );
    const preservedStored = encryptAiConfigProviderSecrets(
      { whatsappAppSecret: storedActive },
      { whatsappAppSecret: storedActive },
    );
    const rewrittenClient = encryptAiConfigProviderSecrets(
      { whatsappAppSecret: clientActive },
      { whatsappAppSecret: storedActive },
    );

    expect(rewrittenPrevious.whatsappAppSecret).not.toBe(previousEnvelope);
    expect(getV2KeyId(rewrittenPrevious.whatsappAppSecret)).toBe(getActiveDataEncryptionKeyId());
    expect(decryptApiKey(rewrittenPrevious.whatsappAppSecret)).toBe("stored-secret");
    expect(preservedStored.whatsappAppSecret).toBe(storedActive);
    expect(rewrittenClient.whatsappAppSecret).not.toBe(clientActive);
    expect(decryptApiKey(rewrittenClient.whatsappAppSecret)).toBe("client-secret");
  });
});

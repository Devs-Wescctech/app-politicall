import { beforeEach, describe, expect, it } from "vitest";
import { encryptApiKey } from "../crypto";
import {
  decryptAiConfigProviderSecrets,
  encryptAiConfigProviderSecrets,
  isEncryptedSecret,
} from "./ai-config-secrets";

describe("AI config provider secrets", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-ai-config-secrets";
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

  it("does not re-encrypt existing encrypted values", () => {
    const alreadyEncrypted = encryptApiKey("stored-secret");
    const result = encryptAiConfigProviderSecrets({
      whatsappAppSecret: alreadyEncrypted,
    });

    expect(result.whatsappAppSecret).toBe(alreadyEncrypted);
  });
});

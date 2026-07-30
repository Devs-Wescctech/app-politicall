import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, getActiveDataEncryptionKeyId, getV2KeyId } from "../crypto";
import { normalizeIntegrationSecretForWrite } from "./integration-secret-fields";

describe("integration secret writes", () => {
  it("preserves only the matching active stored value and rewrites legacy or client ciphertext with the active key", () => {
    const active = Buffer.alloc(32, 13).toString("base64");
    const previous = Buffer.alloc(32, 14).toString("base64");
    process.env.DATA_ENCRYPTION_KEY = previous;
    const previousEnvelope = encryptApiKey("integration-secret");
    process.env.DATA_ENCRYPTION_KEY = active;
    process.env.LEGACY_DATA_ENCRYPTION_KEY = previous;
    const storedActive = encryptApiKey("integration-secret");
    const clientActive = encryptApiKey("client-secret");

    const rewrittenPrevious = normalizeIntegrationSecretForWrite(previousEnvelope, storedActive);
    const preservedStored = normalizeIntegrationSecretForWrite(storedActive, storedActive);
    const rewrittenClient = normalizeIntegrationSecretForWrite(clientActive, storedActive);

    expect(rewrittenPrevious).not.toBe(previousEnvelope);
    expect(getV2KeyId(rewrittenPrevious)).toBe(getActiveDataEncryptionKeyId());
    expect(decryptApiKey(rewrittenPrevious)).toBe("integration-secret");
    expect(preservedStored).toBe(storedActive);
    expect(rewrittenClient).not.toBe(clientActive);
    expect(decryptApiKey(rewrittenClient)).toBe("client-secret");
  });
});

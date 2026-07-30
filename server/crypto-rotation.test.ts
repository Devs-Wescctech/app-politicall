import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  DataEncryptionError,
  decryptApiKey,
  encryptApiKey,
  getActiveDataEncryptionKeyId,
  isEncryptedDataValue,
} from "./crypto";

const originalEnvironment = { ...process.env };
const activeKey = Buffer.alloc(32, 7).toString("base64");
const previousKey = Buffer.alloc(32, 9).toString("base64");

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

function configureKeys(overrides: Record<string, string | undefined> = {}) {
  process.env.DATA_ENCRYPTION_KEY = activeKey;
  delete process.env.LEGACY_DATA_ENCRYPTION_KEY;
  Object.assign(process.env, overrides);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }
}

describe("versioned data encryption", () => {
  it("uses canonical 32-byte base64 key material and writes exact v2 envelopes", () => {
    configureKeys();
    const encrypted = encryptApiKey("credential", { table: "integrations", field: "sendgridApiKey", recordId: "int-1" });
    const parts = encrypted.split(":");

    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("v2");
    expect(parts[1]).toBe(getActiveDataEncryptionKeyId());
    expect(Buffer.from(parts[2], "base64url")).toHaveLength(12);
    expect(Buffer.from(parts[3], "base64url")).toHaveLength(16);
    expect(decryptApiKey(encrypted, { table: "integrations", field: "sendgridApiKey", recordId: "int-1" })).toBe("credential");
  });

  it("uses a fresh nonce and rejects tampering, wrong AAD, unknown keys, and malformed v2", () => {
    configureKeys();
    const context = { table: "integrations", field: "sendgridApiKey", recordId: "int-1" };
    const first = encryptApiKey("credential", context);
    const second = encryptApiKey("credential", context);
    const parts = first.split(":");

    expect(first).not.toBe(second);
    expect(() => decryptApiKey(first, { ...context, recordId: "int-2" })).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(`${parts[0]}:unknown:${parts.slice(2).join(":")}`, context)).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(`${parts[0]}:sha256-aaaaaaaaaaaaaaaaaaaaaaaa:${parts.slice(2).join(":")}`, context)).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(`${parts.slice(0, 3).join(":")}:AAAAAAAAAAAAAAAAAAAAAA:${parts[4]}`, context)).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(`v2:${getActiveDataEncryptionKeyId()}:bad:bad:bad`, context)).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(`${parts.slice(0, 4).join(":")}:A`, context)).toThrow(DataEncryptionError);
  });

  it("supports explicit historic v1 and immediately previous v2 keys, while new writes stay active v2", () => {
    configureKeys({ LEGACY_DATA_ENCRYPTION_KEY: previousKey });
    const legacyKey = crypto.scryptSync(previousKey, "salt", 32);
    const iv = Buffer.alloc(16, 5);
    const cipher = crypto.createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update("old-value", "utf8"), cipher.final()]);
    const v1 = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("hex")}`;

    expect(decryptApiKey(v1)).toBe("old-value");
    const activeCiphertext = encryptApiKey("new-value");
    expect(activeCiphertext).toContain(`v2:${getActiveDataEncryptionKeyId()}:`);

    process.env.DATA_ENCRYPTION_KEY = previousKey;
    const previousCiphertext = encryptApiKey("previous-value");
    process.env.DATA_ENCRYPTION_KEY = activeKey;
    expect(decryptApiKey(previousCiphertext)).toBe("previous-value");
  });

  it("recognizes only exact encrypted formats and preserves colon-containing plaintext", () => {
    configureKeys();
    expect(isEncryptedDataValue("http://provider:8080/token")).toBe(false);
    expect(decryptApiKey("http://provider:8080/token")).toBe("http://provider:8080/token");
    expect(isEncryptedDataValue(encryptApiKey("secret"))).toBe(true);
  });

  it("fails closed for absent, noncanonical, short, and oversized active keys", () => {
    for (const value of [undefined, "not-base64", Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64"), `${activeKey}\n`]) {
      configureKeys({ DATA_ENCRYPTION_KEY: value });
      expect(() => encryptApiKey("secret")).toThrow(DataEncryptionError);
    }
  });

  it("bounds plaintext and legacy envelopes before allocating or parsing them", () => {
    configureKeys({ LEGACY_DATA_ENCRYPTION_KEY: previousKey });
    const oversized = "a".repeat(128 * 1024 + 1);
    const oversizedV1 = `${"0".repeat(32)}:${"0".repeat(32)}:${"0".repeat((128 * 1024 + 1) * 2)}`;

    expect(() => encryptApiKey(oversized)).toThrow(DataEncryptionError);
    expect(() => decryptApiKey(oversizedV1)).toThrow(DataEncryptionError);
  });
});

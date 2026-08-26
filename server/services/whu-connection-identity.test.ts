import { describe, expect, it } from "vitest";
import { fingerprintWhuToken, isConnectionAvailableForSend, normalizeWhuPhone, requireTokenFingerprintKey } from "./whu-connection-identity";

describe("WHU connection identity", () => {
  it("normalizes Brazilian numbers for same-account uniqueness", () => {
    expect(normalizeWhuPhone("+55 (51) 99999-0000")).toBe("5551999990000");
    expect(normalizeWhuPhone("  ")).toBeNull();
  });

  it("creates stable non-plaintext token fingerprints", () => {
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    const first = fingerprintWhuToken("token-a");
    expect(first).toBe(fingerprintWhuToken("token-a"));
    expect(first).not.toContain("token-a");
    expect(first).not.toBe(fingerprintWhuToken("token-b"));
  });

  it("keeps token fingerprints stable when data encryption keys rotate", () => {
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 10).toString("base64");
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const first = fingerprintWhuToken("token-a");
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");

    expect(fingerprintWhuToken("token-a")).toBe(first);
  });

  it("requires the dedicated fingerprint key", () => {
    const configuredKey = process.env.TOKEN_FINGERPRINT_KEY;
    delete process.env.TOKEN_FINGERPRINT_KEY;

    try {
      expect(() => fingerprintWhuToken("token-a")).toThrow("TOKEN_FINGERPRINT_KEY is required");
    } finally {
      process.env.TOKEN_FINGERPRINT_KEY = configuredKey;
    }
  });

  it("accepts only canonical base64 keys with exactly 32 bytes", () => {
    const configuredKey = process.env.TOKEN_FINGERPRINT_KEY;

    try {
      for (const invalidKey of [
        "",
        "not-base64",
        Buffer.alloc(31, 1).toString("base64"),
        Buffer.alloc(33, 1).toString("base64"),
        Buffer.alloc(32, 1).toString("base64").replace(/=$/, ""),
      ]) {
        process.env.TOKEN_FINGERPRINT_KEY = invalidKey;
        expect(() => fingerprintWhuToken("token-a")).toThrow("TOKEN_FINGERPRINT_KEY");
      }

      process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 11).toString("base64");
      expect(requireTokenFingerprintKey()).toEqual(Buffer.alloc(32, 11));
      expect(fingerprintWhuToken("token-a")).toHaveLength(64);
    } finally {
      process.env.TOKEN_FINGERPRINT_KEY = configuredKey;
    }
  });

  it("allows sends only through connected, non-disabled WHU connections", () => {
    expect(isConnectionAvailableForSend({ channel: "whatsapp", provider: "wescctech", status: "connected" })).toBe(true);
    expect(isConnectionAvailableForSend({ channel: " WhatsApp ", provider: " WESCCTECH ", status: " CONNECTED " })).toBe(true);
    expect(isConnectionAvailableForSend({ channel: "whatsapp", provider: "wescctech", status: "error" })).toBe(false);
    expect(isConnectionAvailableForSend({ channel: "sms", provider: "wescctech", status: "connected" })).toBe(false);
  });
});

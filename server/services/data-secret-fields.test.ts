import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "../crypto";
import { maskChannelConnectionSecrets, prepareChannelConnectionSecrets, prepareWhatsappOmniConnection, verifyWebhookSecret } from "./data-secret-fields";
import { fingerprintWhuToken } from "./whu-connection-identity";

describe("channel connection secrets", () => {
  it("encrypts token and nested webhookSecret, preserves masked updates, and masks all response secrets", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const stored = prepareChannelConnectionSecrets({ id: "connection-1", token: "token", metadata: { webhookSecret: "webhook" } });
    const updated = prepareChannelConnectionSecrets({ id: "connection-1", token: "***", metadata: { webhookSecret: "***" } }, stored);

    expect(stored.token).not.toBe("token");
    expect((stored.metadata as any).webhookSecret).not.toBe("webhook");
    expect(updated).toEqual(stored);
    expect(maskChannelConnectionSecrets(stored)).toMatchObject({ token: "***", metadata: { webhookSecret: "***" } });
  });

  it("verifies a decrypted webhook secret without accepting a mismatched value", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const stored = prepareChannelConnectionSecrets({ id: "connection-1", metadata: { webhookSecret: "webhook" } });

    expect(verifyWebhookSecret((stored.metadata as any).webhookSecret, "webhook", { recordId: "connection-1" })).toBe(true);
    expect(verifyWebhookSecret((stored.metadata as any).webhookSecret, "wrong", { recordId: "connection-1" })).toBe(false);
    expect(verifyWebhookSecret((stored.metadata as any).webhookSecret, "webhookx", { recordId: "connection-1" })).toBe(false);
  });

  it("re-encrypts an integration token for an Omni destination connection AAD", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const integrationToken = encryptApiKey("sync-token");
    const connection = prepareWhatsappOmniConnection({ token: integrationToken, metadata: { source: "settings-omni" } });

    expect(decryptApiKey(connection.token, { table: "channel_connections", field: "token", recordId: connection.id })).toBe("sync-token");
  });

  it("normalizes accepted legacy and previous envelopes into a fresh active destination envelope", () => {
    const active = Buffer.alloc(32, 8).toString("base64");
    const previous = Buffer.alloc(32, 6).toString("base64");
    process.env.DATA_ENCRYPTION_KEY = previous;
    const priorEnvelope = encryptApiKey("token");
    process.env.DATA_ENCRYPTION_KEY = active;
    process.env.LEGACY_DATA_ENCRYPTION_KEY = previous;

    const stored = prepareChannelConnectionSecrets({ id: "connection-1", token: priorEnvelope });

    expect(stored.token).not.toBe(priorEnvelope);
    expect(decryptApiKey(stored.token, { table: "channel_connections", field: "token", recordId: "connection-1" })).toBe("token");
  });

  it("fingerprints supplied WHU tokens and exposes only whether a token is configured", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    const stored = prepareChannelConnectionSecrets({
      id: "connection-1",
      channel: "whatsapp",
      token: "whu-token",
    });

    expect(stored.tokenFingerprint).toHaveLength(64);
    expect(maskChannelConnectionSecrets(stored)).toMatchObject({ token: "***", hasToken: true });
    expect(maskChannelConnectionSecrets(stored)).not.toHaveProperty("tokenFingerprint");
  });

  it("backfills a retained token when a partial PATCH converts a connection to WHU", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    const existing = prepareChannelConnectionSecrets({
      id: "connection-1",
      channel: "sms",
      provider: "other-provider",
      token: "retained-token",
    });

    const converted = prepareChannelConnectionSecrets({
      id: "connection-1",
      channel: "whatsapp",
      provider: "wescctech",
    }, existing);
    const masked = prepareChannelConnectionSecrets({ id: "connection-1", token: "***" }, converted);
    const blank = prepareChannelConnectionSecrets({ id: "connection-1", token: " " }, converted);

    expect(converted.token).toBe(existing.token);
    expect(converted.tokenFingerprint).toHaveLength(64);
    expect(masked.tokenFingerprint).toBe(converted.tokenFingerprint);
    expect(blank.tokenFingerprint).toBe(converted.tokenFingerprint);
  });

  it("recomputes a disabled retained WHU token with the current fingerprint key when PATCH reactivates it", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 6).toString("base64");
    const disabled = prepareChannelConnectionSecrets({
      id: "connection-disabled",
      channel: "whatsapp",
      provider: "wescctech",
      status: "disabled",
      token: "retained-token",
    });
    const oldFingerprint = disabled.tokenFingerprint;
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");

    const reactivated = prepareChannelConnectionSecrets({
      id: "connection-disabled",
      status: "connected",
      token: "***",
    }, disabled);

    expect(reactivated.token).toBe(disabled.token);
    expect(decryptApiKey(reactivated.token, { table: "channel_connections", field: "token", recordId: "connection-disabled" })).toBe("retained-token");
    expect(reactivated.tokenFingerprint).toBe(fingerprintWhuToken("retained-token"));
    expect(reactivated.tokenFingerprint).not.toBe(oldFingerprint);
  });

  it("keeps a current retained WHU fingerprint unchanged when PATCH explicitly writes an active status", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    process.env.TOKEN_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString("base64");
    const disabled = prepareChannelConnectionSecrets({
      id: "connection-current",
      channel: "whatsapp",
      provider: "wescctech",
      status: "disabled",
      token: "retained-token",
    });

    const reactivated = prepareChannelConnectionSecrets({
      id: "connection-current",
      status: "connected",
      token: " ",
    }, disabled);

    expect(reactivated.token).toBe(disabled.token);
    expect(reactivated.tokenFingerprint).toBe(disabled.tokenFingerprint);
  });

  it("canonicalizes whitespace-padded WHU identity and phone fields from top-level or legacy metadata", () => {
    const formatted = prepareChannelConnectionSecrets({
      id: "connection-phone-formatted",
      channel: " WhatsApp ",
      provider: "WESCCTECH",
      status: " CONNECTED ",
      phoneNumber: "+55 (51) 99999-0000",
      metadata: {},
    });
    const digits = prepareChannelConnectionSecrets({
      id: "connection-phone-digits",
      channel: "WHATSAPP",
      provider: "wescctech",
      status: "connected",
      phoneNumber: "5551999990000",
      metadata: {},
    });
    const legacy = prepareChannelConnectionSecrets({
      id: "connection-phone-legacy",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      metadata: { phoneNumber: "+55 (51) 99999-0000" },
    });
    const retained = prepareChannelConnectionSecrets({ id: "connection-phone-formatted" }, formatted);

    for (const connection of [formatted, digits, legacy, retained]) {
      expect(connection.channel).toBe("whatsapp");
      expect(connection.provider).toBe("wescctech");
      expect(connection.status).toBe("connected");
      expect(connection.phoneNumber).toBe("5551999990000");
      expect((connection.metadata as any).phoneNumber).toBe("5551999990000");
    }
    expect(formatted.phoneNumber).toBe(digits.phoneNumber);
  });

  it("normalizes explicit blank WHU phones to null while omitted PATCHes retain the existing normalized phone", () => {
    const created = prepareChannelConnectionSecrets({
      id: "connection-blank-phone",
      channel: " WhatsApp ",
      provider: " WESCCTECH ",
      status: " connected ",
      phoneNumber: "  ",
      metadata: {},
    });
    const existing = prepareChannelConnectionSecrets({
      id: "connection-existing-phone",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      phoneNumber: "+55 (51) 99999-0000",
      metadata: {},
    });
    const omitted = prepareChannelConnectionSecrets({ id: "connection-existing-phone", status: " CONNECTED " }, existing);
    const blanked = prepareChannelConnectionSecrets({ id: "connection-existing-phone", phoneNumber: " \t", metadata: {} }, existing);

    expect(created).toMatchObject({
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      phoneNumber: null,
      metadata: { phoneNumber: null },
    });
    expect(omitted).toMatchObject({ phoneNumber: "5551999990000", metadata: { phoneNumber: "5551999990000" } });
    expect(blanked).toMatchObject({ phoneNumber: null, metadata: { phoneNumber: null } });
  });
});

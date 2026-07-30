import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "../crypto";
import { maskChannelConnectionSecrets, prepareChannelConnectionSecrets, prepareWhatsappOmniConnection, verifyWebhookSecret } from "./data-secret-fields";

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
});

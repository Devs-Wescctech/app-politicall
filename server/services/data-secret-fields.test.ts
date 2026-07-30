import { describe, expect, it } from "vitest";
import { maskChannelConnectionSecrets, prepareChannelConnectionSecrets, verifyWebhookSecret } from "./data-secret-fields";

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
  });
});

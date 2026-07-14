import { describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  extractMetaWebhookTargetIds,
  redactWebhookHeaders,
  summarizeWebhookPayload,
  verifyMetaWebhookSignature,
  verifyTwitterWebhookSignature,
} from "./webhook-security";

describe("webhook security helpers", () => {
  it("redacts sensitive webhook headers", () => {
    expect(redactWebhookHeaders({
      authorization: "Bearer secret",
      cookie: "session=secret",
      "x-hub-signature-256": "sha256=secret",
      "content-type": "application/json",
    })).toEqual({
      authorization: "[redacted]",
      cookie: "[redacted]",
      "x-hub-signature-256": "[redacted]",
      "content-type": "application/json",
    });
  });

  it("summarizes webhook payloads without logging message text", () => {
    expect(summarizeWebhookPayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [{ sender: { id: "u1" }, message: { text: "secret text" } }],
          changes: [{ field: "feed", value: { message: "private comment" } }],
        },
      ],
    })).toEqual({
      object: "page",
      entryCount: 1,
      messagingEventCount: 1,
      changeEventCount: 1,
      fields: ["object", "entry"],
    });
  });

  it("accepts a valid Meta webhook HMAC signature", () => {
    const rawBody = Buffer.from(JSON.stringify({ object: "page", entry: [{ id: "page-1" }] }));
    const signature = crypto.createHmac("sha256", "app-secret").update(rawBody).digest("hex");

    expect(verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      appSecret: "app-secret",
    })).toBe(true);
  });

  it("rejects invalid Meta webhook signatures", () => {
    const rawBody = Buffer.from(JSON.stringify({ object: "page", entry: [{ id: "page-1" }] }));
    const signature = crypto.createHmac("sha256", "other-secret").update(rawBody).digest("hex");

    expect(verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      appSecret: "app-secret",
    })).toBe(false);

    expect(verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: signature,
      appSecret: "app-secret",
    })).toBe(false);

    expect(verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: "sha256=abc",
      appSecret: "app-secret",
    })).toBe(false);

    expect(verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      appSecret: "",
    })).toBe(false);

    expect(verifyMetaWebhookSignature({
      rawBody: { object: "page" },
      signatureHeader: `sha256=${signature}`,
      appSecret: "app-secret",
    })).toBe(false);
  });

  it("extracts only trusted Meta webhook target identifiers", () => {
    expect(Array.from(extractMetaWebhookTargetIds({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "business-account-1",
          messaging: [
            {
              sender: { id: "external-user" },
              recipient: { id: "page-1" },
            },
          ],
          changes: [
            {
              value: {
                recipient_id: "page-2",
                metadata: { phone_number_id: "phone-number-1" },
              },
            },
          ],
        },
      ],
    }))).toEqual([
      "business-account-1",
      "page-1",
      "page-2",
      "phone-number-1",
    ]);
  });

  it("accepts a valid X/Twitter webhook HMAC signature", () => {
    const rawBody = Buffer.from(JSON.stringify({ direct_message_events: [] }));
    const signature = crypto.createHmac("sha256", "consumer-secret").update(rawBody).digest("base64");

    expect(verifyTwitterWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      consumerSecret: "consumer-secret",
    })).toBe(true);
  });

  it("rejects invalid X/Twitter webhook signatures", () => {
    const rawBody = Buffer.from(JSON.stringify({ direct_message_events: [] }));
    const signature = crypto.createHmac("sha256", "wrong-secret").update(rawBody).digest("base64");

    expect(verifyTwitterWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      consumerSecret: "consumer-secret",
    })).toBe(false);

    expect(verifyTwitterWebhookSignature({
      rawBody,
      signatureHeader: signature,
      consumerSecret: "consumer-secret",
    })).toBe(false);

    expect(verifyTwitterWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      consumerSecret: "",
    })).toBe(false);
  });
});

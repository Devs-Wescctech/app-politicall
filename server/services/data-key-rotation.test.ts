import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptApiKey } from "../crypto";
import {
  DATA_ENCRYPTION_ROTATION_INVENTORY,
  rotateDataEncryption,
  type DataKeyRotationStore,
} from "./data-key-rotation";

const activeKey = Buffer.alloc(32, 3).toString("base64");
const previousKey = Buffer.alloc(32, 4).toString("base64");

function withKeys() {
  process.env.DATA_ENCRYPTION_KEY = activeKey;
  process.env.LEGACY_DATA_ENCRYPTION_KEY = previousKey;
}

function createStore(rows: Array<{ table: string; id: string; field: string; value: string; metadata?: Record<string, unknown> }>) {
  const writes: Array<{ id: string; field: string; value: string }> = [];
  let transactionCount = 0;
  const store: DataKeyRotationStore = {
    async readBatch(cursor, limit) {
      const start = cursor ? Number(cursor) : 0;
      const batch = rows.slice(start, start + limit);
      return { rows: batch, nextCursor: start + batch.length < rows.length ? String(start + batch.length) : null };
    },
    async transaction(work) {
      transactionCount += 1;
      return work();
    },
    async compareAndSet(row, encrypted) {
      const source = rows.find((candidate) => candidate.id === row.id && candidate.table === row.table && candidate.field === row.field);
      if (!source || source.value !== row.value) return false;
      source.value = encrypted;
      writes.push({ id: row.id, field: row.field, value: encrypted });
      return true;
    },
  };
  return { store, writes, transactionCount: () => transactionCount };
}

describe("data encryption rotation", () => {
  it("has an exact closed inventory and does not include unrelated credential columns", () => {
    expect(DATA_ENCRYPTION_ROTATION_INVENTORY).toEqual([
      ["integrations", "sendgridApiKey"], ["integrations", "twilioAuthToken"], ["integrations", "whatsappToken"],
      ["integrations", "smsCode"], ["integrations", "smtpPassword"], ["integrations", "imapPassword"], ["integrations", "locawebApiKey"],
      ["ai_configurations", "facebookAppSecret"], ["ai_configurations", "facebookPageAccessToken"], ["ai_configurations", "facebookWebhookVerifyToken"],
      ["ai_configurations", "instagramAppSecret"], ["ai_configurations", "instagramAccessToken"], ["ai_configurations", "instagramWebhookVerifyToken"],
      ["ai_configurations", "twitterApiKey"], ["ai_configurations", "twitterApiSecretKey"], ["ai_configurations", "twitterBearerToken"],
      ["ai_configurations", "twitterAccessToken"], ["ai_configurations", "twitterAccessTokenSecret"], ["ai_configurations", "twitterClientSecret"],
      ["ai_configurations", "whatsappAccessToken"], ["ai_configurations", "whatsappAppSecret"], ["ai_configurations", "whatsappWebhookVerifyToken"],
      ["ai_configurations", "openaiApiKey"], ["channel_connections", "token"], ["channel_connections", "metadata.webhookSecret"],
      ["google_calendar_integrations", "clientSecret"], ["google_calendar_integrations", "accessToken"], ["google_calendar_integrations", "refreshToken"],
    ]);
  });

  it("classifies active, previous, v1, plaintext, and malformed values without exposing values", async () => {
    withKeys();
    const active = encryptApiKey("active");
    process.env.DATA_ENCRYPTION_KEY = previousKey;
    const previous = encryptApiKey("previous");
    process.env.DATA_ENCRYPTION_KEY = activeKey;
    const legacyKey = crypto.scryptSync(previousKey, "salt", 32);
    const legacyIv = Buffer.alloc(16, 2);
    const legacyCipher = crypto.createCipheriv("aes-256-gcm", legacyKey, legacyIv);
    const legacyData = Buffer.concat([legacyCipher.update("legacy", "utf8"), legacyCipher.final()]);
    const legacy = `${legacyIv.toString("hex")}:${legacyCipher.getAuthTag().toString("hex")}:${legacyData.toString("hex")}`;
    const fixture = createStore([
      { table: "integrations", id: "active", field: "sendgridApiKey", value: active },
      { table: "integrations", id: "previous", field: "sendgridApiKey", value: previous },
      { table: "integrations", id: "legacy", field: "sendgridApiKey", value: legacy },
      { table: "integrations", id: "plain", field: "sendgridApiKey", value: "plain:credential" },
      { table: "integrations", id: "bad", field: "sendgridApiKey", value: "v2:bad:bad:bad:bad" },
    ]);
    const output: string[] = [];

    const report = await rotateDataEncryption(fixture.store, { apply: true, batchSize: 2, log: (entry) => output.push(JSON.stringify(entry)) });

    expect(report).toMatchObject({ scanned: 5, unchanged: 1, rotatable: 3, rotated: 3, errors: 1 });
    expect(fixture.writes).toHaveLength(3);
    expect(fixture.transactionCount()).toBe(3);
    expect(output.join("\n")).not.toContain("plain:credential");
    expect(output.join("\n")).not.toContain("v2:bad");
  });

  it("is dry-run by default, applies only with --apply semantics, and is idempotent", async () => {
    withKeys();
    const fixture = createStore([{ table: "integrations", id: "plain", field: "sendgridApiKey", value: "plain" }]);

    const dryRun = await rotateDataEncryption(fixture.store);
    expect(dryRun.rotatable).toBe(1);
    expect(dryRun.rotated).toBe(0);
    expect(fixture.writes).toHaveLength(0);

    const applied = await rotateDataEncryption(fixture.store, { apply: true });
    expect(applied.rotated).toBe(1);
    const secondRun = await rotateDataEncryption(fixture.store, { apply: true });
    expect(secondRun.unchanged).toBe(1);
  });

  it("uses compare-and-set protection for concurrent edits and reports the race without overwriting", async () => {
    withKeys();
    const fixture = createStore([{ table: "integrations", id: "race", field: "sendgridApiKey", value: "plain" }]);
    fixture.store.compareAndSet = async () => false;

    const report = await rotateDataEncryption(fixture.store, { apply: true });

    expect(report).toMatchObject({ skipped: 1, rotated: 0, errors: 0 });
  });
});

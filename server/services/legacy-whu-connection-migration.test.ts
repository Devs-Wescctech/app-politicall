import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "../crypto";
import { fingerprintWhuToken } from "./whu-connection-identity";
import {
  assertLegacyWhatsappCollectionWrite,
  legacyWhuMigrationConnectionId,
  migrateLegacyWhuIntegration,
  summarizeLegacyWhatsappConnections,
  type LegacyWhuConnectionRepository,
} from "./legacy-whu-connection-migration";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.TOKEN_FINGERPRINT_KEY = crypto.randomBytes(32).toString("base64");
});

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "integration-1",
    accountId: "account-1",
    service: "whatsapp",
    enabled: true,
    whatsappToken: encryptApiKey("legacy-token"),
    whatsappPhoneNumber: "+55 (51) 99999-0000",
    ...overrides,
  };
}

function fakeRepository(existing: Record<string, any> | null = null) {
  const created: Record<string, any>[] = [];
  const updated: Array<{ id: string; accountId: string; data: Record<string, any> }> = [];
  const repository: LegacyWhuConnectionRepository & { existing: Record<string, any> | null } = {
    existing,
    findLegacyOrigin: async () => repository.existing,
    create: async data => {
      const row = { ...data };
      created.push(row);
      repository.existing = row;
      return row;
    },
    update: async (id, accountId, data) => {
      const row = { ...repository.existing, ...data, id, accountId };
      updated.push({ id, accountId, data });
      repository.existing = row;
      return row;
    },
  };
  return { repository, created, updated };
}

describe("legacy WHU connection migration", () => {
  it("creates one canonical connection and reuses it when migration runs twice", async () => {
    const { repository, created, updated } = fakeRepository();

    const first = await migrateLegacyWhuIntegration("account-1", integration(), repository);
    const second = await migrateLegacyWhuIntegration("account-1", integration({
      whatsappToken: encryptApiKey("changed-integration-token"),
      whatsappPhoneNumber: "+55 11 98888-7777",
    }), repository);

    expect(second.id).toBe(first.id);
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
    expect(second.token).toBe(first.token);
    expect(second.phoneNumber).toBe("5551999990000");
    expect(second.metadata).toMatchObject({ source: "settings-omni", legacyOrigin: true, phoneNumber: "5551999990000" });
    expect(first.id).toBe(legacyWhuMigrationConnectionId("account-1", "integration-1"));
  });

  it("recovers the same legacy connection when concurrent migration wins the create race", async () => {
    let stored: Record<string, any> | null = null;
    const repository: LegacyWhuConnectionRepository = {
      findLegacyOrigin: async () => stored as any,
      create: async data => {
        stored = data;
        throw new Error("duplicate key");
      },
      update: async () => {
        throw new Error("unexpected update");
      },
    };

    const result = await migrateLegacyWhuIntegration("account-1", integration(), repository);

    expect(result).toBe(stored);
    expect(result.metadata).toMatchObject({ source: "settings-omni", legacyOrigin: true });
  });

  it("upgrades a pre-migration settings connection once while preserving its id and encrypted token", async () => {
    const encryptedToken = encryptApiKey("canonical-token", {
      table: "channel_connections",
      field: "token",
      recordId: "legacy-connection",
    });
    const existing = {
      id: "legacy-connection",
      accountId: "account-1",
      name: "Número principal",
      channel: "whatsapp",
      provider: "wescctech",
      token: encryptedToken,
      tokenFingerprint: null,
      phoneNumber: "+55 (41) 98888-0000",
      status: "connected",
      metadata: { source: "settings-omni", custom: "keep" },
    };
    const { repository, created, updated } = fakeRepository(existing);

    const result = await migrateLegacyWhuIntegration("account-1", integration(), repository);

    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(result).toMatchObject({
      id: "legacy-connection",
      name: "Número principal",
      token: encryptedToken,
      tokenFingerprint: fingerprintWhuToken("canonical-token"),
      phoneNumber: "5541988880000",
      status: "connected",
      metadata: { source: "settings-omni", legacyOrigin: true, custom: "keep", phoneNumber: "5541988880000" },
    });
    expect(decryptApiKey(result.token, {
      table: "channel_connections",
      field: "token",
      recordId: result.id,
    })).toBe("canonical-token");
  });

  it("preserves an existing fingerprint instead of rotating it during migration", async () => {
    const existing = {
      id: "legacy-connection",
      accountId: "account-1",
      name: "Número principal",
      channel: "whatsapp",
      provider: "wescctech",
      token: encryptApiKey("canonical-token", {
        table: "channel_connections",
        field: "token",
        recordId: "legacy-connection",
      }),
      tokenFingerprint: "existing-fingerprint",
      phoneNumber: "5551999990000",
      status: "connected",
      metadata: { source: "settings-omni" },
    };
    const { repository } = fakeRepository(existing);

    const result = await migrateLegacyWhuIntegration("account-1", integration(), repository);

    expect(result.tokenFingerprint).toBe("existing-fingerprint");
  });

  it("scopes lookup and creation to the requested tenant without touching arbitrary connections", async () => {
    const arbitrary = { id: "other", accountId: "account-1", metadata: { source: "attendance-manager" } };
    const lookedUp: string[] = [];
    const created: Record<string, any>[] = [];
    const repository: LegacyWhuConnectionRepository = {
      findLegacyOrigin: async accountId => {
        lookedUp.push(accountId);
        return null;
      },
      create: async data => {
        created.push(data);
        return data as any;
      },
      update: async () => {
        throw new Error("must not update an arbitrary connection");
      },
    };

    await migrateLegacyWhuIntegration("account-2", integration({ accountId: "account-1" }), repository);

    expect(lookedUp).toEqual(["account-2"]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ accountId: "account-2", metadata: { source: "settings-omni" } });
    expect(arbitrary).toEqual({ id: "other", accountId: "account-1", metadata: { source: "attendance-manager" } });
  });

  it("keeps official Meta integrations separate from normal WHU connections", async () => {
    const { repository, created } = fakeRepository();

    await migrateLegacyWhuIntegration("account-1", integration({
      whatsappPhoneNumberId: "phone-id",
      whatsappBusinessAccountId: "waba-id",
      whatsappAccessToken: encryptApiKey("meta-token"),
    }), repository);

    expect(created[0]).toMatchObject({
      channel: "whatsapp",
      provider: "meta_cloud",
      metadata: {
        source: "settings-omni",
        legacyOrigin: true,
        apiType: "official",
        official: true,
      },
    });
  });

  it("returns a safe summary without token, fingerprint or webhook secrets", () => {
    const summary = summarizeLegacyWhatsappConnections([{
      id: "connection-1",
      accountId: "account-1",
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      phoneNumber: "5551999990000",
      status: "connected",
      token: "ciphertext",
      tokenFingerprint: "fingerprint",
      lastTestedAt: new Date("2026-08-17T12:00:00.000Z"),
      lastError: "Bearer secret-token",
      metadata: { source: "settings-omni", webhookSecret: "ciphertext-secret" },
    } as any]);

    expect(summary).toEqual([{
      id: "connection-1",
      name: "Gabinete",
      phoneNumber: "5551999990000",
      provider: "wescctech",
      status: "connected",
      lastTestedAt: new Date("2026-08-17T12:00:00.000Z"),
      lastError: "Falha no último teste",
      type: "whu",
    }]);
    expect(JSON.stringify(summary)).not.toMatch(/ciphertext|fingerprint|webhook|secret-token/i);
  });

  it("blocks the legacy form from replacing a migrated collection", () => {
    expect(() => assertLegacyWhatsappCollectionWrite("whatsapp", [{
      id: "legacy-connection",
      metadata: { source: "settings-omni", legacyOrigin: true },
    } as any])).toThrowError(/gerenciador de conexões/i);

    expect(() => assertLegacyWhatsappCollectionWrite("sms", [{
      id: "legacy-connection",
      metadata: { source: "settings-omni", legacyOrigin: true },
    } as any])).not.toThrow();
  });
});

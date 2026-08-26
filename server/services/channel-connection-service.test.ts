import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionValidationError,
  assertWhuConnectionUnique,
  buildWhuConnectionCreate,
  buildWhuConnectionUpdate,
} from "./channel-connection-service";
import { fingerprintWhuToken } from "./whu-connection-identity";

const fingerprintKey = Buffer.alloc(32, 9).toString("base64");

describe("WHU connection lifecycle", () => {
  beforeEach(() => {
    process.env.TOKEN_FINGERPRINT_KEY = fingerprintKey;
  });

  it("requires a name, number, and token on create with stable error codes", () => {
    expect(() => buildWhuConnectionCreate({ name: "Gabinete", provider: "wescctech", token: "" }, "account-1"))
      .toThrow("Token WHU é obrigatório");

    try {
      buildWhuConnectionCreate({ name: "", phoneNumber: "5551999990000", token: "secret" }, "account-1");
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectionValidationError);
      expect((error as ConnectionValidationError).code).toBe("WHU_NAME_REQUIRED");
    }

    expect(() => buildWhuConnectionCreate({ name: "Gabinete", token: "secret" }, "account-1"))
      .toThrow("Número WHU é obrigatório");
  });

  it("normalizes the number and fingerprints the plaintext token before encryption", () => {
    const prepared = buildWhuConnectionCreate({
      name: " Gabinete ",
      provider: "other-provider",
      token: " secret ",
      phoneNumber: "+55 51 99999-0000",
      metadata: { source: "settings" },
    }, "account-1");

    expect(prepared).toMatchObject({
      accountId: "account-1",
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      token: "secret",
      tokenFingerprint: fingerprintWhuToken("secret"),
      phoneNumber: "5551999990000",
      status: "pending",
      metadata: { source: "settings", phoneNumber: "5551999990000" },
    });
  });

  it("preserves token identity when an update token is blank or masked", () => {
    const existing = {
      id: "c1",
      accountId: "a1",
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      token: "encrypted",
      tokenFingerprint: "fingerprint",
      phoneNumber: "5551999990000",
      metadata: { phoneNumber: "5551999990000" },
    };

    expect(buildWhuConnectionUpdate({ name: "Novo nome", token: "" }, existing)).toMatchObject({
      name: "Novo nome",
      tokenFingerprint: "fingerprint",
      phoneNumber: "5551999990000",
    });
    expect(buildWhuConnectionUpdate({ token: "***" }, existing)).not.toHaveProperty("token");
  });

  it("rejects active duplicate phone and global token matches with stable, non-identifying errors", async () => {
    const prepared = buildWhuConnectionCreate({
      name: "Gabinete",
      token: "secret",
      phoneNumber: "5551999990000",
    }, "account-1");
    const storage = {
      findActiveChannelConnectionByPhone: vi.fn().mockResolvedValue(null),
      findActiveChannelConnectionByTokenFingerprint: vi.fn().mockResolvedValue({ id: "other-tenant-connection" }),
    };

    await expect(assertWhuConnectionUnique(storage, prepared)).rejects.toMatchObject({
      code: "WHU_DUPLICATE_TOKEN",
      message: "Este token WHU já está em uso.",
    });
    expect(storage.findActiveChannelConnectionByPhone).toHaveBeenCalledWith("account-1", "5551999990000", undefined);
    expect(storage.findActiveChannelConnectionByTokenFingerprint).toHaveBeenCalledWith(
      "account-1",
      fingerprintWhuToken("secret"),
      undefined,
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildWhatsappConnectionConfig } from "./whatsapp-connection-config";

describe("buildWhatsappConnectionConfig", () => {
  it("maps complete Cloud credentials to a Meta official connection", () => {
    const result = buildWhatsappConnectionConfig({
      enabled: true,
      whatsappAccessToken: "secret",
      whatsappPhoneNumberId: "phone-id",
      whatsappBusinessAccountId: "waba-id",
    });
    expect(result).toMatchObject({
      name: "WhatsApp Cloud / Meta",
      provider: "meta_cloud",
      token: "secret",
      metadata: { apiType: "official", official: true, phoneNumberId: "phone-id", businessAccountId: "waba-id" },
    });
  });

  it("keeps token-only integrations as normal WHU", () => {
    const result = buildWhatsappConnectionConfig({ enabled: true, whatsappToken: "whu-secret" });
    expect(result).toMatchObject({ name: "WhatsApp / WHU", provider: "wescctech", token: "whu-secret" });
    expect(result.metadata.official).toBe(false);
  });

  it("normalizes a known legacy phone and marks its settings origin", () => {
    const result = buildWhatsappConnectionConfig({
      enabled: true,
      whatsappToken: "whu-secret",
      whatsappPhoneNumber: "+55 (51) 99999-0000",
    });

    expect(result).toMatchObject({
      phoneNumber: "5551999990000",
      metadata: {
        source: "settings-omni",
        phoneNumber: "5551999990000",
      },
    });
  });
});

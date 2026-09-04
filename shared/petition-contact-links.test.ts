import { describe, expect, it } from "vitest";
import {
  buildPetitionContactLinks,
  normalizePetitionSocialUrl,
  normalizePetitionWhatsapp,
  petitionContactConfigSchema,
} from "./petition-contact-links";

describe("petition contact links", () => {
  it("normalizes an international WhatsApp number", () => {
    expect(normalizePetitionWhatsapp("+55 (51) 99999-0000")).toBe("5551999990000");
    expect(normalizePetitionWhatsapp("123")).toBeNull();
    expect(normalizePetitionWhatsapp(" ")).toBeNull();
  });

  it("accepts only HTTPS URLs on official social hosts", () => {
    expect(normalizePetitionSocialUrl("facebook", "https://www.facebook.com/politico"))
      .toBe("https://www.facebook.com/politico");
    expect(normalizePetitionSocialUrl("x", "https://x.com/politico"))
      .toBe("https://x.com/politico");
    expect(normalizePetitionSocialUrl("telegram", "https://t.me/politico"))
      .toBe("https://t.me/politico");
    expect(normalizePetitionSocialUrl("facebook", "javascript:alert(1)"))
      .toBeNull();
    expect(normalizePetitionSocialUrl("x", "https://x.com.attacker.test/politico"))
      .toBeNull();
  });

  it("builds only configured links in stable order", () => {
    expect(buildPetitionContactLinks({
      contactWhatsapp: "+55 51 99999-0000",
      contactFacebookUrl: "https://facebook.com/politico",
      contactXUrl: null,
      contactTelegramUrl: "https://t.me/politico",
    })).toEqual([
      { network: "whatsapp", label: "WhatsApp", url: "https://wa.me/5551999990000" },
      { network: "facebook", label: "Facebook", url: "https://facebook.com/politico" },
      { network: "telegram", label: "Telegram", url: "https://t.me/politico" },
    ]);
  });

  it("rejects non-empty invalid administrative values", () => {
    expect(() => petitionContactConfigSchema.parse({ contactWhatsapp: "123" }))
      .toThrow("Informe um WhatsApp com código do país e DDD");
    expect(() => petitionContactConfigSchema.parse({
      contactFacebookUrl: "https://example.test/perfil",
    })).toThrow("Informe uma URL HTTPS válida do Facebook");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPetitionContactLinks,
  formatPetitionWhatsappInput,
  interpolatePetitionWhatsappMessage,
  normalizePetitionSocialUrl,
  normalizePetitionWhatsapp,
  petitionContactConfigSchema,
} from "./petition-contact-links";

describe("petition contact links", () => {
  it("normalizes an international WhatsApp number", () => {
    expect(normalizePetitionWhatsapp("+55 (51) 99999-0000")).toBe("5551999990000");
    expect(normalizePetitionWhatsapp("(51) 99999-0000")).toBe("5551999990000");
    expect(normalizePetitionWhatsapp("51 3333-4444")).toBe("555133334444");
    expect(normalizePetitionWhatsapp("+351 912 345 678")).toBe("351912345678");
    expect(normalizePetitionWhatsapp("123")).toBeNull();
    expect(normalizePetitionWhatsapp(" ")).toBeNull();
  });

  it("formats complete Brazilian WhatsApp numbers for editing", () => {
    expect(formatPetitionWhatsappInput("5551999990000")).toBe("+55 (51) 99999-0000");
    expect(formatPetitionWhatsappInput("555133334444")).toBe("+55 (51) 3333-4444");
    expect(formatPetitionWhatsappInput("+351 912 345 678")).toBe("351912345678");
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

  it("validates WhatsApp message variables and length", () => {
    expect(petitionContactConfigSchema.parse({
      contactWhatsappMessage: "Olá, sou {nome}, de {cidade}. Assinei {peticao}: {link}",
    }).contactWhatsappMessage).toBe(
      "Olá, sou {nome}, de {cidade}. Assinei {peticao}: {link}",
    );
    expect(() => petitionContactConfigSchema.parse({
      contactWhatsappMessage: "Meu e-mail é {email}",
    })).toThrow("Use somente as variáveis {nome}, {cidade}, {peticao} e {link}");
    expect(() => petitionContactConfigSchema.parse({
      contactWhatsappMessage: "a".repeat(1001),
    })).toThrow("A mensagem deve ter no máximo 1000 caracteres");
  });

  it("interpolates the approved variables without leaking missing values", () => {
    expect(interpolatePetitionWhatsappMessage(
      "Olá, sou {nome}, de {cidade}. Assinei {peticao}: {link}",
      {
        nome: "Ana Maria",
        cidade: "",
        peticao: "Mais segurança",
        link: "https://politicall.com.br/p/seguranca",
      },
    )).toBe(
      "Olá, sou Ana Maria, de . Assinei Mais segurança: https://politicall.com.br/p/seguranca",
    );
    expect(interpolatePetitionWhatsappMessage(null, {
      nome: "Ana",
      cidade: "Porto Alegre",
      peticao: "Petição",
      link: "https://politicall.com.br/p/peticao",
    })).toBeNull();
  });

  it("adds an encoded message only to the configured WhatsApp contact", () => {
    expect(buildPetitionContactLinks({
      contactWhatsapp: "(51) 99999-0000",
      contactWhatsappMessage: "Olá, sou {nome}. Assinei {peticao}: {link}",
      contactFacebookUrl: "https://facebook.com/politico",
    }, {
      nome: "Ana Maria",
      cidade: "Porto Alegre",
      peticao: "Mais segurança",
      link: "https://politicall.com.br/p/seguranca",
    })).toEqual([
      {
        network: "whatsapp",
        label: "WhatsApp",
        url: "https://wa.me/5551999990000?text=Ol%C3%A1%2C%20sou%20Ana%20Maria.%20Assinei%20Mais%20seguran%C3%A7a%3A%20https%3A%2F%2Fpoliticall.com.br%2Fp%2Fseguranca",
      },
      { network: "facebook", label: "Facebook", url: "https://facebook.com/politico" },
    ]);

    expect(buildPetitionContactLinks({
      contactWhatsapp: "(51) 99999-0000",
      contactWhatsappMessage: "   ",
    }, {
      nome: "Ana",
      cidade: "",
      peticao: "Petição",
      link: "https://politicall.com.br/p/peticao",
    })[0]?.url).toBe("https://wa.me/5551999990000");
  });
});

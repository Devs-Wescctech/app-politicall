import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petitions.tsx", import.meta.url), "utf8");

describe("petition contact fields", () => {
  it("configures all post-signature social destinations", () => {
    expect(source).toContain("Redes para contato após a assinatura");
    for (const field of [
      "contactWhatsapp",
      "contactFacebookUrl",
      "contactXUrl",
      "contactTelegramUrl",
    ]) {
      expect(source).toContain(`name="${field}"`);
    }
    expect(source).toContain('data-testid="input-petition-contact-whatsapp"');
    expect(source).toContain('data-testid="input-petition-contact-facebook"');
    expect(source).toContain('data-testid="input-petition-contact-x"');
    expect(source).toContain('data-testid="input-petition-contact-telegram"');
  });

  it("configures a variable WhatsApp message and formats the contact number", () => {
    expect(source).toContain('name="contactWhatsappMessage"');
    expect(source).toContain('data-testid="input-petition-contact-whatsapp-message"');
    expect(source).toContain("maxLength={1000}");
    expect(source).toContain("formatPetitionWhatsappInput");
    expect(source).toContain("{nome}");
    expect(source).toContain("{cidade}");
    expect(source).toContain("{peticao}");
    expect(source).toContain("{link}");
  });
});

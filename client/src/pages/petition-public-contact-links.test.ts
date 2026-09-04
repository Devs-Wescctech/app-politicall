import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petition-public.tsx", import.meta.url), "utf8");

describe("public petition contact links", () => {
  it("keeps sharing separate from post-signature contacts", () => {
    expect(source).toContain("const socialShares");
    expect(source).toContain("const contactLinks");
    expect(source).toContain("buildPetitionContactLinks");
    expect(source).toContain('data-testid="section-petition-contact-links"');
    expect(source).toContain("Fale com o político");
    expect(source).toContain("noopener,noreferrer");
    expect(source).not.toContain("button-success-share-");
  });

  it("builds WhatsApp contact links from the successful signature context", () => {
    expect(source).toContain("setSignedContactContext");
    expect(source).toContain("onSuccess: (_result, submitted)");
    expect(source).toContain("buildPetitionContactLinks(petition, {");
    expect(source).toContain('nome: signedContactContext?.name ?? ""');
    expect(source).toContain('cidade: signedContactContext?.city ?? ""');
    expect(source).toContain("peticao: petition.title");
    expect(source).toContain("link: shareUrl");
  });
});

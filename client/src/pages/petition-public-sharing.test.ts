import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petition-public.tsx", import.meta.url), "utf8");

describe("public petition sharing controls", () => {
  it("uses recognizable brand icons and colors on the initial page", () => {
    for (const icon of ["FaWhatsapp", "FaFacebookF", "FaXTwitter", "FaTelegram"]) {
      expect(source).toContain(icon);
    }
    for (const color of ["bg-[#25D366]", "bg-[#1877F2]", "bg-black", "bg-[#229ED9]"]) {
      expect(source).toContain(color);
    }
    expect(source).toContain("h-12 w-12");
    expect(source).toContain('aria-label={`Compartilhar petição no ${s.name}`}');
    expect(source).toContain('aria-label="Copiar link da petição"');
  });

  it("keeps clipboard feedback on the initial sharing section", () => {
    expect(source).toContain('data-testid="section-petition-initial-sharing"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Link copiado");
    expect(source).toContain("Não foi possível copiar o link");
  });
});

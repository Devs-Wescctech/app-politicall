import { describe, expect, it } from "vitest";
import { escapeHtml, renderPrivacyPage, renderSocialPrivacyPage, renderTermsPage } from "./legal-pages";

describe("legal pages", () => {
  const date = new Date("2026-07-22T12:00:00-03:00");

  it("escapes reflected account slugs in social privacy pages", () => {
    const html = renderSocialPrivacyPage("facebook", `"><script>alert(1)</script>`, date);

    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders generic privacy and terms pages with stable titles", () => {
    expect(renderPrivacyPage(date)).toContain("<title>Política de Privacidade - Politicall</title>");
    expect(renderTermsPage(date)).toContain("<title>Termos de Serviço - Politicall</title>");
  });

  it("escapes common HTML-sensitive characters", () => {
    expect(escapeHtml(`<tag attr="x">A & B's</tag>`)).toBe("&lt;tag attr=&quot;x&quot;&gt;A &amp; B&#39;s&lt;/tag&gt;");
  });
});

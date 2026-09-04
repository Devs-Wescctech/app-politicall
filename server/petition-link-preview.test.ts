import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGenericPetitionPreview,
  buildPetitionPreview,
  injectPetitionPreviewHtml,
  isSocialCrawler,
  resolvePetitionTemplatePath,
  resolvePublicOrigin,
} from "./petition-link-preview";

const petition = {
  id: "petition-1",
  title: "Mais segurança <agora>",
  description: "<p>Iluminação & patrulhamento para todos os bairros.</p>",
  bannerUrl: "/uploads/petitions/seguranca.jpg",
  logoUrl: "/uploads/petitions/logo.png",
  goal: 500,
  status: "publicada",
  slug: "mais-seguranca",
};

describe("petition link preview", () => {
  it.each([
    "WhatsApp/2.24",
    "facebookexternalhit/1.1",
    "Facebot",
    "Twitterbot/1.0",
    "LinkedInBot/1.0",
    "Pinterest/0.2",
    "Slackbot-LinkExpanding 1.0",
    "TelegramBot",
    "Discordbot/2.0",
    "Googlebot/2.1",
    "bingbot/2.0",
    "Applebot/0.1",
  ])("recognizes social crawler %s", (userAgent) => {
    expect(isSocialCrawler(userAgent)).toBe(true);
  });

  it("does not intercept a normal browser", () => {
    expect(isSocialCrawler("Mozilla/5.0 Chrome/140.0")).toBe(false);
  });

  it("resolves development and production templates from the runtime directory", () => {
    const runtimeDirectory = path.join("workspace", "dist");

    expect(resolvePetitionTemplatePath("production", runtimeDirectory)).toBe(
      path.join(runtimeDirectory, "public", "index.html"),
    );
    expect(resolvePetitionTemplatePath("development", path.join("workspace", "server"))).toBe(
      path.resolve("workspace", "client", "index.html"),
    );
  });

  it("normalizes the configured public origin and forwarded request headers", () => {
    expect(resolvePublicOrigin({}, "https://www.politicall.com.br/path")).toBe(
      "https://www.politicall.com.br",
    );
    expect(resolvePublicOrigin({
      "x-forwarded-host": "politicall.com.br, proxy.internal",
      "x-forwarded-proto": "https, http",
    })).toBe("https://politicall.com.br");
    expect(resolvePublicOrigin({ host: "localhost:5000" })).toBe("https://localhost:5000");
  });

  it("builds a localized preview with metrics and an absolute banner URL", () => {
    const preview = buildPetitionPreview(petition, 128, "https://politicall.com.br");

    expect(preview).toMatchObject({
      title: "Mais segurança <agora>",
      image: "https://politicall.com.br/uploads/petitions/seguranca.jpg",
      imageAlt: "Imagem da petição Mais segurança <agora>",
      url: "https://politicall.com.br/p/mais-seguranca",
    });
    expect(preview.description).toBe(
      "Iluminação & patrulhamento para todos os bairros. 128 assinaturas de uma meta de 500. Assine e compartilhe esta petição.",
    );
  });

  it("uses singular metrics and falls back from banner to logo", () => {
    const preview = buildPetitionPreview(
      { ...petition, bannerUrl: "data:image/png;base64,abc", logoUrl: "https://cdn.example/logo.jpg", goal: 1 },
      1,
      "https://politicall.com.br",
    );

    expect(preview.image).toBe("https://cdn.example/logo.jpg");
    expect(preview.description).toContain("1 assinatura de uma meta de 1.");
  });

  it("uses a generic image and safely truncates long plain-text descriptions", () => {
    const preview = buildPetitionPreview(
      { ...petition, bannerUrl: null, logoUrl: null, description: `<div>${"texto ".repeat(80)}</div>` },
      2,
      "https://politicall.com.br",
    );

    expect(preview.image).toBe("https://politicall.com.br/favicon.png");
    expect(preview.description.length).toBeLessThanOrEqual(300);
    expect(preview.description).not.toContain("<div>");
    expect(preview.description).toContain("2 assinaturas de uma meta de 500.");
  });

  it("builds generic metadata without petition details", () => {
    expect(buildGenericPetitionPreview("https://politicall.com.br", "privada")).toEqual({
      title: "Petição - Politicall",
      description: "Assine esta petição e faça parte dessa mudança!",
      image: "https://politicall.com.br/favicon.png",
      imageAlt: "Politicall",
      url: "https://politicall.com.br/p/privada",
    });
  });

  it("injects one escaped, complete metadata block", () => {
    const html = `<!doctype html><html><head><title>Base</title><meta name="description" content="Base" /></head><body></body></html>`;
    const preview = buildPetitionPreview(petition, 128, "https://politicall.com.br");
    const once = injectPetitionPreviewHtml(html, preview);
    const twice = injectPetitionPreviewHtml(once, preview);

    expect(twice.match(/PETITION_LINK_PREVIEW_START/g)).toHaveLength(1);
    expect(twice).toContain("<title>Mais segurança &lt;agora&gt;</title>");
    expect(twice).toContain('<meta property="og:type" content="website" />');
    expect(twice).toContain('<meta property="og:locale" content="pt_BR" />');
    expect(twice).toContain('<meta property="og:site_name" content="Politicall" />');
    expect(twice).toContain('<meta property="og:title" content="Mais segurança &lt;agora&gt;" />');
    expect(twice).toContain("Iluminação &amp; patrulhamento");
    expect(twice).toContain('<meta property="og:image" content="https://politicall.com.br/uploads/petitions/seguranca.jpg" />');
    expect(twice).toContain('<meta property="og:image:alt" content="Imagem da petição Mais segurança &lt;agora&gt;" />');
    expect(twice).toContain('<meta property="og:url" content="https://politicall.com.br/p/mais-seguranca" />');
    expect(twice).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(twice).toContain('<link rel="canonical" href="https://politicall.com.br/p/mais-seguranca" />');
  });
});

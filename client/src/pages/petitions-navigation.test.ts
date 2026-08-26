import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petitions.tsx", import.meta.url), "utf8");

describe("petitions navigation", () => {
  it("keeps campaign and message-template management outside Petitions", () => {
    expect(source).not.toContain('data-testid="tab-campaigns"');
    expect(source).not.toContain('data-testid="tab-templates"');
    expect(source).not.toContain("Campanhas WhatsApp");
    expect(source).not.toContain("Modelos de Mensagem");
    expect(source).not.toContain("function CampaignsTab");
    expect(source).not.toContain("function TemplatesTab");
  });

  it("keeps the petition and link management areas available", () => {
    expect(source).toContain('data-testid="tab-petitions"');
    expect(source).toContain('data-testid="tab-linkbio"');
    expect(source).toContain('data-testid="tab-linktree"');
  });
});

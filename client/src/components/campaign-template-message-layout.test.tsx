import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { extractWhatsAppTemplateVariables } from "@shared/whatsapp-template-variables";
import {
  CampaignTemplateMessageLayout,
  campaignTemplateTouchedReducer,
} from "./campaign-template-message-layout";

const template = {
  components: [{ type: "BODY", text: "Olá {{1}}, chamado {{2}}." }],
};
const variables = extractWhatsAppTemplateVariables(template);

function renderLayout(overrides: Partial<Parameters<typeof CampaignTemplateMessageLayout>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CampaignTemplateMessageLayout, {
      template,
      templateKey: "template-a",
      variables,
      values: {},
      preview: "Olá {{1}}, chamado {{2}}.",
      sampleContactName: "Maria Silva",
      onValueChange: () => undefined,
      ...overrides,
    }),
  );
}

describe("CampaignTemplateMessageLayout", () => {
  it("renders real required accessible inputs and preserves preview placeholders", () => {
    const html = renderLayout();

    expect(html).toContain("required=\"\"");
    expect(html).toContain("aria-required=\"true\"");
    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain("Olá {{1}}, chamado {{2}}.");
    expect(html).toContain("Personalize o template");
  });

  it("renders only the preview when the approved template has no variables", () => {
    const html = renderLayout({
      template: { components: [{ type: "BODY", text: "Mensagem fixa." }] },
      templateKey: "fixed-template",
      variables: [],
      preview: "Mensagem fixa.",
    });

    expect(html).toContain("Mensagem fixa.");
    expect(html).not.toContain("Personalize o template");
    expect(html).not.toContain("Completo");
    expect(html).not.toContain("lg:grid-cols");
  });

  it("shows a clear unsupported-token error in the real field markup", () => {
    const html = renderLayout({
      values: { [variables[0].key]: "{nao_suportada}" },
    });

    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("não é suportada");
  });

  it("resets touched fields when the template identity changes", () => {
    const touched = campaignTemplateTouchedReducer(
      { templateKey: "template-a", touched: { [variables[0].key]: true } },
      { type: "template-changed", templateKey: "template-b" },
    );

    expect(touched).toEqual({ templateKey: "template-b", touched: {} });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildWhatsAppTemplateComponents,
  createEmptyTemplateVariableValues,
  extractWhatsAppTemplateVariables,
  renderWhatsAppTemplatePreview,
  validateTemplateVariableValues,
} from "./whatsapp-template-variables";

const dynamicTemplate = {
  preview: "Prezado(a) {{1}},\nChamado {{2}} sobre {{3}}.",
  components: [
    { type: "HEADER", text: "Protocolo {{1}}" },
    { type: "BODY", text: "Prezado(a) {{1}},\nChamado {{2}} sobre {{3}}." },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Abrir", url: "https://example.test/{{1}}" }] },
  ],
};

describe("WhatsApp template variables", () => {
  it("extracts ordered variables from header, body and dynamic buttons", () => {
    expect(extractWhatsAppTemplateVariables(dynamicTemplate)).toEqual([
      expect.objectContaining({ key: "header:0:1", componentType: "header", position: 1, label: "Cabeçalho · variável 1" }),
      expect.objectContaining({ key: "body:1:1", componentType: "body", position: 1, label: "Corpo · variável 1" }),
      expect.objectContaining({ key: "body:1:2", componentType: "body", position: 2, label: "Corpo · variável 2" }),
      expect.objectContaining({ key: "body:1:3", componentType: "body", position: 3, label: "Corpo · variável 3" }),
      expect.objectContaining({ key: "button:2:0:1", componentType: "button", position: 1, label: "Botão 1 · variável 1" }),
    ]);
  });

  it("deduplicates repeated placeholders inside the same component", () => {
    const variables = extractWhatsAppTemplateVariables({ components: [{ type: "BODY", text: "{{2}} / {{1}} / {{2}}" }] });
    expect(variables.map(variable => variable.position)).toEqual([1, 2]);
  });

  it("creates empty mandatory values and reports whitespace as missing", () => {
    const variables = extractWhatsAppTemplateVariables({ components: [{ type: "BODY", text: "Olá {{1}} {{2}}" }] });
    const values = createEmptyTemplateVariableValues(variables);
    expect(values).toEqual({ "body:0:1": "", "body:0:2": "" });
    expect(validateTemplateVariableValues(variables, { ...values, "body:0:1": "Carlos", "body:0:2": "  " })).toEqual({
      valid: false,
      missing: ["body:0:2"],
    });
  });

  it("builds provider components preserving component and button structure", () => {
    const values = {
      "header:0:1": "ATD-123",
      "body:1:1": "Carlos",
      "body:1:2": "525547",
      "body:1:3": "Headset",
      "button:2:0:1": "chamado-525547",
    };
    expect(buildWhatsAppTemplateComponents(dynamicTemplate, values)).toEqual([
      { type: "header", parameters: [{ type: "text", text: "ATD-123" }] },
      { type: "body", parameters: [
        { type: "text", text: "Carlos" },
        { type: "text", text: "525547" },
        { type: "text", text: "Headset" },
      ] },
      { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "chamado-525547" }] },
    ]);
  });

  it("renders a final preview without positional placeholders", () => {
    const template = { preview: "Prezado(a) {{1}}, chamado {{2}} sobre {{3}}.", components: [{ type: "BODY", text: "Prezado(a) {{1}}, chamado {{2}} sobre {{3}}." }] };
    const values = { "body:0:1": "Carlos", "body:0:2": "525547", "body:0:3": "Headset" };
    expect(renderWhatsAppTemplatePreview(template, values)).toBe("Prezado(a) Carlos, chamado 525547 sobre Headset.");
  });

  it("extracts variables from WHU dynamicComponents", () => {
    const variables = extractWhatsAppTemplateVariables({ dynamicComponents: [{ type: "BODY", text: "Olá {{1}}" }] });
    expect(variables).toEqual([expect.objectContaining({ key: "body:0:1" })]);
  });

  it("prefers the WHU BODY text when preview contains only the action-card name", () => {
    const template = {
      preview: "tratamento_chamado (pt_BR)",
      dynamicComponents: [{ type: "BODY", text: "Olá {{1}}, protocolo {{2}}." }],
    };

    expect(renderWhatsAppTemplatePreview(template, {
      "body:0:1": "Carlos",
      "body:0:2": "525547",
    })).toBe("Olá Carlos, protocolo 525547.");
  });
});

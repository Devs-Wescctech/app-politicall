import { describe, expect, it } from "vitest";
import { prepareCampaignTemplateComponents, selectCampaignOfficialConnection, validateCampaignTemplateConfiguration } from "./campaign-template-variables";

const template = {
  preview: "Olá {{1}}, protocolo {{2}}.",
  components: [{ type: "BODY", text: "Olá {{1}}, protocolo {{2}}." }],
};

describe("prepareCampaignTemplateComponents", () => {
  it("builds components from fixed campaign values", () => {
    const result = prepareCampaignTemplateComponents(template, {
      "body:0:1": "Equipe",
      "body:0:2": "ABC-10",
    }, {});
    expect(result.components[0].parameters).toEqual([
      { type: "text", text: "Equipe" },
      { type: "text", text: "ABC-10" },
    ]);
  });

  it("renders Politicall tokens separately for each contact", () => {
    const result = prepareCampaignTemplateComponents(template, {
      "body:0:1": "{nome}",
      "body:0:2": "{protocolo}",
    }, { nome: "Carlos", protocolo: "ATD-123" });
    expect(result.preview).toBe("Olá Carlos, protocolo ATD-123.");
    expect(result.values).toEqual({ "body:0:1": "Carlos", "body:0:2": "ATD-123" });
  });

  it("rejects a value that becomes blank after per-contact rendering", () => {
    expect(() => prepareCampaignTemplateComponents(template, {
      "body:0:1": "{nome}",
      "body:0:2": "fixo",
    }, { nome: "" })).toThrowError(expect.objectContaining({ code: "TEMPLATE_VARIABLES_REQUIRED", missingVariables: ["body:0:1"] }));
  });

  it("rejects an unsupported Politicall token before per-contact rendering", () => {
    expect(() => prepareCampaignTemplateComponents(template, {
      "body:0:1": "{nao_suportada}",
      "body:0:2": "ABC-10",
    }, {})).toThrowError(expect.objectContaining({
      code: "TEMPLATE_VARIABLES_REQUIRED",
      missingVariables: ["body:0:1"],
      message: expect.stringContaining("{nao_suportada}"),
    }));
  });

  it("rejects unsupported Politicall tokens embedded in fixed text", () => {
    expect(() => validateCampaignTemplateConfiguration({
      waTemplateName: "tratamento_chamado",
      waTemplatePreview: template.preview,
      waTemplateComponents: template.components,
      variables: { "body:0:1": "Olá {nao_suportada}", "body:0:2": "ABC-10" },
    })).toThrowError(expect.objectContaining({
      code: "TEMPLATE_VARIABLES_REQUIRED",
      missingVariables: ["body:0:1"],
      message: expect.stringContaining("não é suportada"),
    }));
  });

  it("accepts supported Politicall tokens and ordinary fixed text", () => {
    expect(() => validateCampaignTemplateConfiguration({
      waTemplateName: "tratamento_chamado",
      waTemplatePreview: template.preview,
      waTemplateComponents: template.components,
      variables: { "body:0:1": "Olá {nome}", "body:0:2": "ABC-10" },
    })).not.toThrow();

    const result = prepareCampaignTemplateComponents(template, {
      "body:0:1": "Olá {nome}",
      "body:0:2": "ABC-10",
    }, { nome: "Carlos" });
    expect(result.values).toEqual({ "body:0:1": "Olá Carlos", "body:0:2": "ABC-10" });
  });

  it("keeps numeric parameter order regardless of object key order", () => {
    const result = prepareCampaignTemplateComponents(template, {
      "body:0:2": "segundo",
      "body:0:1": "primeiro",
    }, {});
    expect(result.components[0].parameters.map((parameter: any) => parameter.text)).toEqual(["primeiro", "segundo"]);
  });

  it("rejects saving or starting a campaign with incomplete configured values", () => {
    expect(() => validateCampaignTemplateConfiguration({
      waTemplateName: "tratamento_chamado",
      waTemplatePreview: template.preview,
      waTemplateComponents: template.components,
      variables: { "body:0:1": "Carlos", "body:0:2": "", "body:0:3": "Headset" },
    })).toThrowError(expect.objectContaining({ code: "TEMPLATE_VARIABLES_REQUIRED", missingVariables: ["body:0:2"] }));
  });

  it("ignores campaign configs that do not select an official template", () => {
    expect(() => validateCampaignTemplateConfiguration(null)).not.toThrow();
  });

  it("rejects a selected template whose provider definition was omitted", () => {
    expect(() => validateCampaignTemplateConfiguration({ waTemplateName: "tratamento_chamado", variables: {} }))
      .toThrowError(expect.objectContaining({ code: "TEMPLATE_DEFINITION_REQUIRED" }));
  });

  it("selects the requested official WACLOUD connection and ignores normal WhatsApp", () => {
    const connections = [
      { id: "normal", channel: "whatsapp", provider: "whu" },
      { id: "cloud-a", channel: "wacloud", provider: "whu" },
      { id: "cloud-b", channel: "whatsapp_oficial", provider: "whu" },
    ];
    expect(selectCampaignOfficialConnection(connections, "cloud-b")?.id).toBe("cloud-b");
    expect(selectCampaignOfficialConnection(connections, "normal")).toBeUndefined();
    expect(selectCampaignOfficialConnection(connections)).toBeUndefined();
  });
});

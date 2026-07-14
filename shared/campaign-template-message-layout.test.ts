import { describe, expect, it } from "vitest";
import {
  prepareTemplatePreviewValues,
  templateVariableValueError,
  templatePreviewValues,
  templateVariableExcerpt,
  templateVariableProgress,
} from "./campaign-template-message-layout";
import { renderTemplate } from "./templates";
import { extractWhatsAppTemplateVariables } from "./whatsapp-template-variables";

const template = {
  components: [{
    type: "BODY",
    text: "Prezado(a) {{1}}, acompanhamos o chamado {{2}} aberto para resolver {{3}}.",
  }],
};

const variables = extractWhatsAppTemplateVariables(template);

describe("campaign template message layout", () => {
  it("counts only trimmed required values as completed", () => {
    expect(templateVariableProgress(variables, {
      [variables[0].key]: "Maria",
      [variables[1].key]: "   ",
      [variables[2].key]: "Cadastro",
    })).toEqual({ total: 3, completed: 2, missing: [variables[1].key] });
  });

  it("returns a readable excerpt around the selected variable", () => {
    expect(templateVariableExcerpt(template, variables[1]))
      .toContain("chamado {{2}} aberto");
  });

  it("keeps markers for missing values in preview", () => {
    expect(templatePreviewValues(variables, { [variables[0].key]: "Maria" }))
      .toEqual({
        [variables[0].key]: "Maria",
        [variables[1].key]: "{{2}}",
        [variables[2].key]: "{{3}}",
      });
  });

  it("preserves missing markers without passing them to the configured-value renderer", () => {
    const rendered: string[] = [];
    const result = prepareTemplatePreviewValues(
      variables,
      {},
      (value: string) => {
        rendered.push(value);
        return renderTemplate(value, { nome: "Maria" });
      },
    );

    expect(result).toEqual({
      [variables[0].key]: "{{1}}",
      [variables[1].key]: "{{2}}",
      [variables[2].key]: "{{3}}",
    });
    expect(rendered).toEqual([]);

    expect(prepareTemplatePreviewValues(
      variables,
      { [variables[0].key]: "{nome}", [variables[1].key]: "Chamado 42" },
      (value: string) => {
        rendered.push(value);
        return renderTemplate(value, { nome: "Maria" });
      },
    )).toEqual({
      [variables[0].key]: "Maria",
      [variables[1].key]: "Chamado 42",
      [variables[2].key]: "{{3}}",
    });
    expect(rendered).toEqual(["{nome}", "Chamado 42"]);
  });

  it("rejects unsupported Politicall tokens as incomplete", () => {
    const values = {
      [variables[0].key]: "{nao_suportada}",
      [variables[1].key]: "Chamado 42",
      [variables[2].key]: "Cadastro",
    };

    expect(templateVariableValueError(values[variables[0].key])).toContain("não é suportada");
    expect(templateVariableProgress(variables, values)).toEqual({
      total: 3,
      completed: 2,
      missing: [variables[0].key],
    });
  });

  it("keeps unsupported tokens visible in preview rendering", () => {
    expect(prepareTemplatePreviewValues(
      variables,
      { [variables[0].key]: "Olá {nao_suportada}" },
      value => renderTemplate(value, { nome: "Maria" }, { keepMissing: true }),
    )[variables[0].key]).toBe("Olá {nao_suportada}");
  });
});

import {
  buildWhatsAppTemplateComponents,
  extractWhatsAppTemplateVariables,
  renderWhatsAppTemplatePreview,
  validateTemplateVariableValues,
  type TemplateVariableValues,
  type WhatsAppTemplateLike,
} from "../../shared/whatsapp-template-variables";

export class TemplateVariablesRequiredError extends Error {
  code = "TEMPLATE_VARIABLES_REQUIRED" as const;

  constructor(public missingVariables: string[]) {
    super("Preencha todas as variáveis obrigatórias do template");
    this.name = "TemplateVariablesRequiredError";
  }
}

function valuesFromProviderComponents(template: WhatsAppTemplateLike, suppliedComponents: any[] | undefined): TemplateVariableValues {
  const values: TemplateVariableValues = {};
  const variables = extractWhatsAppTemplateVariables(template);

  for (const variable of variables) {
    const supplied = (suppliedComponents ?? []).find(component => {
      const type = String(component?.type ?? "").toLowerCase();
      if (type !== variable.componentType) return false;
      return type !== "button" || Number(component?.index ?? 0) === Number(variable.buttonIndex ?? 0);
    });
    const parameter = Array.isArray(supplied?.parameters)
      ? supplied.parameters[variable.parameterIndex]
      : undefined;
    values[variable.key] = String(parameter?.text ?? parameter?.coupon_code ?? "");
  }

  return values;
}

export function prepareAttendanceTemplateSend(
  selected: WhatsAppTemplateLike & { name?: string },
  suppliedComponents?: any[],
  _suppliedMessage?: string,
) {
  const variables = extractWhatsAppTemplateVariables(selected);
  const values = valuesFromProviderComponents(selected, suppliedComponents);
  const validation = validateTemplateVariableValues(variables, values);
  if (!validation.valid) throw new TemplateVariablesRequiredError(validation.missing);

  return {
    components: variables.length > 0
      ? buildWhatsAppTemplateComponents(selected, values)
      : [],
    preview: renderWhatsAppTemplatePreview(selected, values) || selected.name || "Template enviado",
    values,
  };
}

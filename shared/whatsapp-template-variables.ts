export type WhatsAppTemplateComponent = {
  type?: string;
  text?: string;
  format?: string;
  buttons?: Array<{ type?: string; sub_type?: string; text?: string; url?: string; example?: unknown }>;
};

export type WhatsAppTemplateLike = {
  preview?: string;
  message?: string;
  components?: WhatsAppTemplateComponent[] | null;
  staticComponents?: WhatsAppTemplateComponent[] | null;
  dynamicComponents?: WhatsAppTemplateComponent[] | null;
};

export type TemplateVariable = {
  key: string;
  token: string;
  position: number;
  componentType: "header" | "body" | "button";
  componentIndex: number;
  parameterIndex: number;
  buttonIndex?: number;
  buttonSubType?: string;
  label: string;
  placeholder: string;
};

export type TemplateVariableValues = Record<string, string>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w.-]*|\d+)\s*\}\}/g;

function templateComponents(template: WhatsAppTemplateLike): WhatsAppTemplateComponent[] {
  if (Array.isArray(template.components) && template.components.length > 0) return template.components;
  if (Array.isArray(template.dynamicComponents) && template.dynamicComponents.length > 0) return template.dynamicComponents;
  return Array.isArray(template.staticComponents) ? template.staticComponents : [];
}

function tokensIn(text: string | null | undefined): string[] {
  const found = new Set<string>();
  const source = String(text ?? "");
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(source)) !== null) found.add(match[1]);
  return Array.from(found).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftNumeric = Number.isFinite(leftNumber);
    const rightNumeric = Number.isFinite(rightNumber);
    if (leftNumeric && rightNumeric) return leftNumber - rightNumber;
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left.localeCompare(right);
  });
}

function variablePosition(token: string, fallback: number): number {
  const numeric = Number(token);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function extractWhatsAppTemplateVariables(template: WhatsAppTemplateLike): TemplateVariable[] {
  const result: TemplateVariable[] = [];
  const components = templateComponents(template);

  components.forEach((component, componentIndex) => {
    const type = String(component.type ?? "").toLowerCase();
    if (type === "header" || type === "body") {
      tokensIn(component.text).forEach((token, parameterIndex) => {
        const position = variablePosition(token, parameterIndex + 1);
        const section = type === "header" ? "Cabeçalho" : "Corpo";
        result.push({
          key: `${type}:${componentIndex}:${token}`,
          token,
          position,
          componentType: type,
          componentIndex,
          parameterIndex,
          label: `${section} · variável ${token}`,
          placeholder: `Texto para {{${token}}}`,
        });
      });
    }

    if (type === "buttons" || type === "button") {
      (component.buttons ?? []).forEach((button, buttonIndex) => {
        const dynamicText = `${button.url ?? ""}\n${button.text ?? ""}`;
        tokensIn(dynamicText).forEach((token, parameterIndex) => {
          const position = variablePosition(token, parameterIndex + 1);
          result.push({
            key: `button:${componentIndex}:${buttonIndex}:${token}`,
            token,
            position,
            componentType: "button",
            componentIndex,
            parameterIndex,
            buttonIndex,
            buttonSubType: String(button.sub_type ?? button.type ?? "url").toLowerCase(),
            label: `Botão ${buttonIndex + 1} · variável ${token}`,
            placeholder: `Texto para {{${token}}}`,
          });
        });
      });
    }
  });

  return result;
}

export function createEmptyTemplateVariableValues(variables: TemplateVariable[]): TemplateVariableValues {
  return Object.fromEntries(variables.map(variable => [variable.key, ""]));
}

export function validateTemplateVariableValues(variables: TemplateVariable[], values: TemplateVariableValues) {
  const missing = variables
    .filter(variable => !String(values[variable.key] ?? "").trim())
    .map(variable => variable.key);
  return { valid: missing.length === 0, missing };
}

export function buildWhatsAppTemplateComponents(template: WhatsAppTemplateLike, values: TemplateVariableValues): any[] {
  const variables = extractWhatsAppTemplateVariables(template);
  const validation = validateTemplateVariableValues(variables, values);
  if (!validation.valid) {
    const error = new Error("Preencha todas as variáveis obrigatórias do template") as Error & { code?: string; missingVariables?: string[] };
    error.code = "TEMPLATE_VARIABLES_REQUIRED";
    error.missingVariables = validation.missing;
    throw error;
  }

  const grouped = new Map<string, TemplateVariable[]>();
  for (const variable of variables) {
    const groupKey = variable.componentType === "button"
      ? `button:${variable.componentIndex}:${variable.buttonIndex}`
      : `${variable.componentType}:${variable.componentIndex}`;
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), variable]);
  }

  return Array.from(grouped.values()).map(group => {
    const first = group[0];
    const parameters = [...group]
      .sort((left, right) => left.parameterIndex - right.parameterIndex)
      .map(variable => ({ type: "text", text: String(values[variable.key]).trim() }));
    if (first.componentType === "button") {
      return {
        type: "button",
        sub_type: first.buttonSubType ?? "url",
        index: first.buttonIndex ?? 0,
        parameters,
      };
    }
    return { type: first.componentType, parameters };
  });
}

function replaceComponentPlaceholders(text: string, variables: TemplateVariable[], values: TemplateVariableValues): string {
  let rendered = text;
  for (const variable of variables) {
    rendered = rendered.replace(
      new RegExp(`\\{\\{\\s*${variable.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
      String(values[variable.key] ?? ""),
    );
  }
  return rendered;
}

export function renderWhatsAppTemplatePreview(template: WhatsAppTemplateLike, values: TemplateVariableValues): string {
  const components = templateComponents(template);
  const variables = extractWhatsAppTemplateVariables(template);
  const bodyIndex = components.findIndex(component => String(component.type ?? "").toLowerCase() === "body");
  const bodyVariables = variables.filter(variable => variable.componentType === "body" && variable.componentIndex === bodyIndex);
  const suppliedPreview = template.preview ?? template.message;
  const bodyText = bodyIndex >= 0 ? String(components[bodyIndex]?.text ?? "") : "";
  const previewContainsVariables = tokensIn(suppliedPreview).length > 0;
  const bodyContainsVariables = tokensIn(bodyText).length > 0;
  if (suppliedPreview && (previewContainsVariables || !bodyContainsVariables)) {
    return replaceComponentPlaceholders(suppliedPreview, bodyVariables, values);
  }
  if (bodyText) return replaceComponentPlaceholders(bodyText, bodyVariables, values);

  return components
    .map((component, componentIndex) => {
      const type = String(component.type ?? "").toLowerCase();
      if (type !== "header" && type !== "body") return "";
      const componentVariables = variables.filter(variable => variable.componentIndex === componentIndex && variable.componentType === type);
      return replaceComponentPlaceholders(String(component.text ?? ""), componentVariables, values);
    })
    .filter(Boolean)
    .join("\n\n");
}

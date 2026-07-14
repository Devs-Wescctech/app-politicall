import type {
  TemplateVariable,
  TemplateVariableValues,
  WhatsAppTemplateLike,
} from "./whatsapp-template-variables";
import { unknownVariables } from "./templates";

export function templateVariableValueError(value: string | null | undefined): string | null {
  const configuredValue = String(value ?? "").trim();
  if (!configuredValue) return "Preencha esta variável.";
  const unsupported = unknownVariables(configuredValue);
  if (unsupported.length === 0) return null;
  const subject = unsupported.length === 1 ? "A variável" : "As variáveis";
  const agreement = unsupported.length === 1 ? "não é suportada" : "não são suportadas";
  return `${subject} ${unsupported.map(token => `{${token}}`).join(", ")} ${agreement}. Use texto fixo ou {nome}, {telefone}, {cidade}, {protocolo} ou {link}.`;
}

export function templateVariableProgress(
  variables: TemplateVariable[],
  values: TemplateVariableValues,
) {
  const missing = variables
    .filter(variable => templateVariableValueError(values[variable.key]) !== null)
    .map(variable => variable.key);
  return { total: variables.length, completed: variables.length - missing.length, missing };
}

function templateComponents(template: WhatsAppTemplateLike) {
  if (Array.isArray(template.components) && template.components.length) return template.components;
  if (Array.isArray(template.dynamicComponents) && template.dynamicComponents.length) return template.dynamicComponents;
  return Array.isArray(template.staticComponents) ? template.staticComponents : [];
}

export function templateVariableExcerpt(
  template: WhatsAppTemplateLike,
  variable: TemplateVariable,
  radius = 42,
) {
  const component = templateComponents(template)[variable.componentIndex];
  const source = variable.componentType === "button"
    ? `${component?.buttons?.[variable.buttonIndex ?? 0]?.text ?? ""} ${component?.buttons?.[variable.buttonIndex ?? 0]?.url ?? ""}`.trim()
    : String(component?.text ?? "");
  const marker = `{{${variable.token}}}`;
  const index = source.indexOf(marker);
  if (index < 0) return marker;
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + marker.length + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

export function templatePreviewValues(
  variables: TemplateVariable[],
  values: TemplateVariableValues,
): TemplateVariableValues {
  return Object.fromEntries(variables.map(variable => {
    const value = String(values[variable.key] ?? "").trim();
    return [variable.key, value || `{{${variable.token}}}`];
  }));
}

export function prepareTemplatePreviewValues(
  variables: TemplateVariable[],
  values: TemplateVariableValues,
  renderConfiguredValue: (value: string) => string,
): TemplateVariableValues {
  return Object.fromEntries(variables.map(variable => {
    const value = String(values[variable.key] ?? "").trim();
    return [
      variable.key,
      value ? renderConfiguredValue(value) : `{{${variable.token}}}`,
    ];
  }));
}

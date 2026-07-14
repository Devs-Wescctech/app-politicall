import { renderTemplate, type TemplateContext } from "../../shared/templates";
import {
  buildWhatsAppTemplateComponents,
  extractWhatsAppTemplateVariables,
  renderWhatsAppTemplatePreview,
  validateTemplateVariableValues,
  type TemplateVariable,
  type TemplateVariableValues,
  type WhatsAppTemplateLike,
} from "../../shared/whatsapp-template-variables";
import { TemplateVariablesRequiredError } from "./attendance-template-variables";
import { isOfficialAttendanceChannel } from "../../shared/attendance-meta-window";
import { templateVariableValueError } from "../../shared/campaign-template-message-layout";

type CampaignTemplateVariableConfig = {
  waTemplateName?: string;
  waTemplatePreview?: string;
  waTemplateComponents?: Array<Record<string, unknown>>;
  variables?: TemplateVariableValues;
} | null | undefined;

function assertSupportedConfiguredValues(variables: TemplateVariable[], values: TemplateVariableValues) {
  const invalid = variables.flatMap(variable => {
    const value = String(values[variable.key] ?? "");
    const message = templateVariableValueError(value);
    return value.trim() && message ? [{ key: variable.key, message }] : [];
  });
  if (invalid.length === 0) return;

  const error = new TemplateVariablesRequiredError(invalid.map(issue => issue.key));
  error.message = invalid.map(issue => issue.message).join(" ");
  throw error;
}

export function selectCampaignOfficialConnection<T extends { id?: string; provider?: unknown; channel?: unknown; metadata?: unknown }>(connections: T[], preferredId?: string): T | undefined {
  const official = connections.filter(connection => isOfficialAttendanceChannel({ connection }));
  if (!preferredId) return undefined;
  return official.find(connection => connection.id === preferredId);
}

export function validateCampaignTemplateConfiguration(config: CampaignTemplateVariableConfig) {
  if (!config?.waTemplateName) return;
  if (!Array.isArray(config.waTemplateComponents) || config.waTemplateComponents.length === 0) {
    const error = new Error("A definição completa do template WhatsApp é obrigatória") as Error & { code?: string };
    error.code = "TEMPLATE_DEFINITION_REQUIRED";
    throw error;
  }
  const template = { preview: config.waTemplatePreview, components: config.waTemplateComponents };
  const variables = extractWhatsAppTemplateVariables(template);
  assertSupportedConfiguredValues(variables, config.variables ?? {});
  const validation = validateTemplateVariableValues(variables, config.variables ?? {});
  if (!validation.valid) throw new TemplateVariablesRequiredError(validation.missing);
}

export function prepareCampaignTemplateComponents(
  template: WhatsAppTemplateLike,
  configuredValues: TemplateVariableValues,
  contactContext: TemplateContext,
) {
  const variables = extractWhatsAppTemplateVariables(template);
  assertSupportedConfiguredValues(variables, configuredValues);
  const values = Object.fromEntries(variables.map(variable => [
    variable.key,
    renderTemplate(String(configuredValues[variable.key] ?? ""), contactContext).trim(),
  ]));
  const validation = validateTemplateVariableValues(variables, values);
  if (!validation.valid) throw new TemplateVariablesRequiredError(validation.missing);

  return {
    values,
    components: buildWhatsAppTemplateComponents(template, values),
    preview: renderWhatsAppTemplatePreview(template, values),
  };
}

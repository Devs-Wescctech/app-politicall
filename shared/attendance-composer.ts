export type TemplateInput = { id: string; name?: string; title?: string; preview?: string; source?: string; language?: string; components?: any[] };
type QuickReplyInput = { id: string; title: string; message: string };

export type ComposerCommand = {
  kind: "template" | "quick_reply";
  id: string;
  title: string;
  preview: string;
  disabled: boolean;
  disabledReason?: string;
  payload: TemplateInput | QuickReplyInput;
};

export function templatesForNewConversation<T extends TemplateInput>(
  templates: T[],
  connection: { official: boolean; whu: boolean },
): T[] {
  if (connection.official && connection.whu) {
    return templates.filter(template => template.source === "official" || template.source === "whu_action_card");
  }
  if (connection.official) return templates.filter(template => template.source === "official");
  if (connection.whu) return templates.filter(template => template.source === "whu_action_card");
  return templates;
}

export function buildComposerCommands(input: {
  templates: TemplateInput[];
  quickReplies: QuickReplyInput[];
  windowExpired: boolean;
  search: string;
}): ComposerCommand[] {
  const templates: ComposerCommand[] = input.templates.map(template => ({
    kind: "template",
    id: template.id,
    title: template.title ?? template.name ?? "Template",
    preview: template.preview ?? "",
    disabled: false,
    payload: template,
  }));
  const quickReplies: ComposerCommand[] = input.quickReplies.map(reply => ({
    kind: "quick_reply",
    id: reply.id,
    title: reply.title,
    preview: reply.message,
    disabled: input.windowExpired,
    ...(input.windowExpired ? { disabledReason: "Indisponível fora da janela de 24 horas" } : {}),
    payload: reply,
  }));
  const term = input.search.trim().toLowerCase();
  return [...templates, ...quickReplies].filter(item => !term || `${item.title} ${item.preview}`.toLowerCase().includes(term));
}

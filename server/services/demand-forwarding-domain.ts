export const FORWARDING_STATUSES = ["draft", "forwarded", "waiting", "answered", "completed", "cancelled"] as const;
export const FORWARDING_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const FORWARDING_WARNING_HOURS = 4;

export type ForwardingStatus = typeof FORWARDING_STATUSES[number];
export type ForwardingPriority = typeof FORWARDING_PRIORITIES[number];
export type ForwardingDeadlineAlert = "due_soon" | "overdue";

const ACTIVE_DEADLINE_STATUSES = new Set<ForwardingStatus>(["forwarded", "waiting"]);
const ALLOWED_TRANSITIONS: Record<ForwardingStatus, ReadonlySet<ForwardingStatus>> = {
  draft: new Set(["draft", "forwarded", "cancelled"]),
  forwarded: new Set(["forwarded", "waiting", "answered", "completed", "cancelled"]),
  waiting: new Set(["waiting", "answered", "completed", "cancelled"]),
  answered: new Set(["answered", "waiting", "completed", "cancelled"]),
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled"]),
};

export function validateForwardingTransition(current: ForwardingStatus, next: ForwardingStatus): void {
  if (!ALLOWED_TRANSITIONS[current]?.has(next)) {
    throw new Error(`Transicao de encaminhamento invalida: ${current} -> ${next}`);
  }
}

export function calculateForwardingDueAt(sentAt: Date, defaultHours: number, explicitDueAt?: string | Date | null): Date {
  if (!Number.isFinite(sentAt.getTime())) throw new Error("Data de encaminhamento invalida");
  const dueAt = explicitDueAt ? new Date(explicitDueAt) : new Date(sentAt.getTime() + defaultHours * 60 * 60 * 1000);
  if (!Number.isFinite(dueAt.getTime())) throw new Error("Prazo de encaminhamento invalido");
  if (dueAt <= sentAt) throw new Error("O prazo deve ser posterior ao encaminhamento");
  if (!explicitDueAt && (!Number.isInteger(defaultHours) || defaultHours < 1)) throw new Error("Prazo padrao invalido");
  return dueAt;
}

export function classifyForwardingDeadline(
  forwarding: { status: string; dueAt?: string | Date | null },
  now = new Date(),
): ForwardingDeadlineAlert | null {
  if (!ACTIVE_DEADLINE_STATUSES.has(forwarding.status as ForwardingStatus) || !forwarding.dueAt) return null;
  const dueAt = new Date(forwarding.dueAt);
  if (!Number.isFinite(dueAt.getTime())) return null;
  const remainingMs = dueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "overdue";
  return remainingMs <= FORWARDING_WARNING_HOURS * 60 * 60 * 1000 ? "due_soon" : null;
}

const STATUS_DRAFT_TEXT: Record<ForwardingStatus, string> = {
  draft: "o encaminhamento esta em preparacao",
  forwarded: "a solicitacao foi encaminhada",
  waiting: "a solicitacao aguarda providencias",
  answered: "recebemos retorno",
  completed: "a providencia foi concluida",
  cancelled: "o encaminhamento foi cancelado",
};

export function buildCitizenUpdateDraft(input: {
  demandProtocol?: string | null;
  demandTitle: string;
  destinationName: string;
  status: ForwardingStatus;
  response?: string | null;
}): string {
  const demandReference = input.demandProtocol ? `${input.demandProtocol} - ${input.demandTitle}` : input.demandTitle;
  const response = input.response?.trim();
  return `Atualizacao da demanda ${demandReference}: ${STATUS_DRAFT_TEXT[input.status]} da ${input.destinationName}.${response ? ` ${response}` : ""}`;
}

import { getMetaWindowState } from "@shared/attendance-meta-window";

type ReplyPolicyInput = {
  connection?: Record<string, any> | null;
  conversation: Record<string, any>;
  isWhisper?: boolean;
  now?: Date;
};

export function evaluatePublicReplyPolicy(input: ReplyPolicyInput) {
  const metaWindow = getMetaWindowState({
    connection: input.connection,
    conversation: input.conversation,
  }, input.now);

  if (input.isWhisper || !metaWindow.official || !metaWindow.expired) {
    return { allowed: true as const, metaWindow };
  }

  return {
    allowed: false as const,
    code: "META_WINDOW_EXPIRED" as const,
    error: "A janela de atendimento de 24 horas da Meta foi encerrada. Envie um template aprovado para retomar a conversa.",
    metaWindow,
  };
}

export function resolveLastCustomerActivityAt(input: {
  remoteChat?: Record<string, any> | null;
  messages?: Array<{ direction?: string; createdAt?: string | Date | null }>;
  current?: string | Date | null;
}): Date | null {
  const remote = input.remoteChat ?? {};
  const nested = remote.data ?? remote.chat ?? remote.result ?? {};
  const candidates: unknown[] = [
    input.current,
    remote.lastReceivedMessageDate,
    nested.lastReceivedMessageDate,
    ...(input.messages ?? []).filter(message => message.direction === "inbound").map(message => message.createdAt),
  ];
  return candidates.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    const date = new Date(value as string | Date);
    if (Number.isNaN(date.getTime())) return latest;
    return !latest || date.getTime() > latest.getTime() ? date : latest;
  }, null);
}

type AttendanceFollowUpConversation = {
  id: string;
  contactId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  attendanceCode?: string | null;
  protocol?: string | null;
};

type AttendanceFollowUpInput = {
  startDate: string;
  endDate: string;
  title?: string;
  reminderMinutes?: number;
};

export function buildAttendanceFollowUp(conversation: AttendanceFollowUpConversation, input: AttendanceFollowUpInput) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    throw new Error("Datas do retorno inválidas");
  }
  if (endDate <= startDate) {
    throw new Error("A data final precisa ser posterior à data inicial");
  }
  const reminderMinutes = input.reminderMinutes;
  if (reminderMinutes != null && (!Number.isInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 10_080)) {
    throw new Error("Tempo de lembrete inválido");
  }

  const contactLabel = conversation.contactName?.trim() || conversation.contactPhone?.trim() || "Contato";
  const reference = conversation.attendanceCode?.trim() || conversation.protocol?.trim() || conversation.id;
  const title = input.title?.trim() || `Retorno - ${contactLabel}`;
  if (title.length < 2 || title.length > 160) throw new Error("Título do retorno inválido");

  return {
    title,
    description: `Retorno agendado a partir do atendimento ${reference}.`,
    startDate,
    endDate,
    category: "meeting",
    borderColor: "#0f766e",
    recurrence: "none",
    reminder: reminderMinutes != null,
    reminderMinutes: reminderMinutes ?? null,
    contactId: conversation.contactId ?? null,
    attendanceConversationId: conversation.id,
  };
}


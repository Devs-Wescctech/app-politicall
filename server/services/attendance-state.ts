export const FINAL_ATTENDANCE_STATUSES = new Set(["resolved", "finalized", "closed"]);

const TRANSITIONS: Record<string, Set<string>> = {
  automatic: new Set(["waiting_agent", "in_progress", "out_of_hours", "finalized"]),
  waiting: new Set(["waiting_agent", "in_progress", "finalized"]),
  new: new Set(["waiting_agent", "in_progress", "finalized"]),
  waiting_agent: new Set(["in_progress", "automatic", "transferred", "paused", "finalized"]),
  waiting_customer: new Set(["in_progress", "paused", "finalized"]),
  in_progress: new Set(["waiting_customer", "waiting_agent", "transferred", "paused", "finalized"]),
  transferred: new Set(["waiting_agent", "in_progress", "automatic", "finalized"]),
  paused: new Set(["in_progress", "waiting_agent", "finalized"]),
  out_of_hours: new Set(["automatic", "waiting_agent", "in_progress", "finalized"]),
  resolved: new Set(["reopened"]),
  finalized: new Set(["reopened"]),
  closed: new Set(["reopened"]),
  reopened: new Set(["in_progress", "waiting_agent", "transferred", "paused", "finalized"]),
};

export function canTransitionAttendance(from: string | null | undefined, to: string): boolean {
  if (!from || from === to) return true;
  return TRANSITIONS[from]?.has(to) ?? false;
}

export function assertAttendanceTransition(from: string | null | undefined, to: string): void {
  if (!canTransitionAttendance(from, to)) {
    throw new Error(`Transição de atendimento inválida: ${from ?? "desconhecido"} → ${to}`);
  }
}

export function isFinalAttendanceStatus(status: string | null | undefined): boolean {
  return Boolean(status && FINAL_ATTENDANCE_STATUSES.has(status));
}

export function statusForSyncedConversation(
  remoteStatus: string,
  assignedUserId?: string | null,
): string {
  return assignedUserId && remoteStatus === "automatic" ? "in_progress" : remoteStatus;
}

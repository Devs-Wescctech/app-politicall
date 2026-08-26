export const DEMAND_KINDS = ["external", "internal"] as const;
export const DEMAND_ORIGINS = ["manual", "attendance", "whatsapp", "phone", "email", "petition", "in_person"] as const;
export const DEMAND_STATUSES = ["open", "triage", "in_progress", "waiting_requester", "waiting_third_party", "completed", "cancelled"] as const;

export type DemandKind = typeof DEMAND_KINDS[number];
export type DemandOrigin = typeof DEMAND_ORIGINS[number];
export type DemandStatus = typeof DEMAND_STATUSES[number];

type DemandInput = {
  kind: DemandKind;
  contactId?: string | null;
  categoryId?: string | null;
  assigneeUserId?: string | null;
};

type SummaryDemand = {
  status: string;
  priority: string;
  slaDueAt?: Date | string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
};

export function buildDemandProtocol(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Ano e sequencia do protocolo sao invalidos");
  }
  return `DEM-${year}-${String(sequence).padStart(6, "0")}`;
}

export function calculateSlaDueAt(createdAt: Date, slaHours: number): Date {
  if (!Number.isFinite(slaHours) || slaHours <= 0) {
    throw new Error("SLA deve ser maior que zero");
  }
  return new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);
}

export function validateDemandInput(input: DemandInput): void {
  if (input.kind === "external" && !input.contactId) {
    throw new Error("Eleitor e obrigatorio para demanda externa");
  }
  if (input.kind === "internal" && (!input.categoryId || !input.assigneeUserId)) {
    throw new Error("Categoria e responsavel sao obrigatorios para demanda interna");
  }
}

export function isDemandActive(status: string): boolean {
  return status !== "completed" && status !== "cancelled";
}

export function buildDemandSummary(demands: SummaryDemand[], now = new Date()) {
  const completed = demands.filter((demand) => demand.status === "completed");
  const resolutionHours = completed
    .filter((demand) => demand.completedAt)
    .map((demand) => (new Date(demand.completedAt!).getTime() - new Date(demand.createdAt).getTime()) / 3_600_000);

  return {
    total: demands.length,
    active: demands.filter((demand) => isDemandActive(demand.status)).length,
    overdue: demands.filter((demand) => isDemandActive(demand.status) && demand.slaDueAt && new Date(demand.slaDueAt) < now).length,
    completed: completed.length,
    urgent: demands.filter((demand) => demand.priority === "urgent" && isDemandActive(demand.status)).length,
    averageResolutionHours: resolutionHours.length
      ? Number((resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length).toFixed(1))
      : null,
  };
}

export const ACTIVE_DEMAND_STATUSES = ["open", "triage", "in_progress", "waiting_requester", "waiting_third_party"] as const;
export const ACTIVE_FORWARDING_STATUSES = ["forwarded", "waiting"] as const;
export const DUE_SOON_HOURS = 4;
export const STALE_DAYS = 7;

export type DemandOperationReason = "forwarding_overdue" | "demand_overdue" | "due_soon" | "stale" | "active";
export type DemandDeadlineState = DemandOperationReason | "all";

export type DemandOperationForwardingSnapshot = {
  id: string;
  status: string;
  destinationId: string;
  destinationName: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  sentAt: string | null;
  dueAt: string | null;
  answeredAt: string | null;
};

export type DemandOperationSnapshot = {
  id: string;
  protocol: string | null;
  title: string;
  status: string;
  priority: string;
  categoryId: string | null;
  categoryName: string | null;
  contactName: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string | null;
  completedAt: string | null;
  firstMovementAt: string | null;
  forwardings: DemandOperationForwardingSnapshot[];
};

export type DemandOperationFilters = {
  from: string;
  to: string;
  categoryId?: string;
  destinationId?: string;
  assigneeUserId?: string;
  demandStatus?: string;
  forwardingStatus?: string;
  deadlineState?: DemandDeadlineState;
  search?: string;
  page: number;
  pageSize: number;
};

export type DemandOperationItem = {
  id: string;
  protocol: string | null;
  title: string;
  status: string;
  priority: string;
  categoryId: string | null;
  categoryName: string | null;
  contactName: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  destinationId: string | null;
  destinationName: string | null;
  reason: DemandOperationReason;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Breakdown = { id: string; label: string; total: number; overdue: number };

export type DemandOperationSummary = {
  totalCreated: number;
  active: number;
  completed: number;
  overdue: number;
  forwardingOverdue: number;
  dueSoon: number;
  stale: number;
  completionRate: number;
  overdueRate: number;
  responseRate: number;
  averageFirstMovementHours: number | null;
  averageResponseHours: number | null;
  averageResolutionHours: number | null;
};

export type DemandOperationsReport = {
  generatedAt: string;
  filters: DemandOperationFilters;
  summary: DemandOperationSummary;
  breakdowns: { categories: Breakdown[]; destinations: Breakdown[]; assignees: Breakdown[] };
  items: DemandOperationItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const ACTIVE_DEMAND_SET = new Set<string>(ACTIVE_DEMAND_STATUSES);
const ACTIVE_FORWARDING_SET = new Set<string>(ACTIVE_FORWARDING_STATUSES);
const REASON_WEIGHT: Record<DemandOperationReason, number> = {
  forwarding_overdue: 0,
  demand_overdue: 1,
  due_soon: 2,
  stale: 3,
  active: 4,
};

const timestamp = (value: string | null | undefined) => value ? new Date(value).getTime() : Number.NaN;
const isBefore = (value: string | null | undefined, limit: number) => Number.isFinite(timestamp(value)) && timestamp(value) < limit;
const hoursBetween = (start: string | null | undefined, end: string | null | undefined) => {
  const startMs = timestamp(start);
  const endMs = timestamp(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 3_600_000 : null;
};
const average = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

export function classifyDemandOperation(snapshot: DemandOperationSnapshot, now = new Date()): DemandOperationItem | null {
  if (!ACTIVE_DEMAND_SET.has(snapshot.status)) return null;
  const nowMs = now.getTime();
  const overdueForwardings = snapshot.forwardings
    .filter((item) => ACTIVE_FORWARDING_SET.has(item.status) && isBefore(item.dueAt, nowMs))
    .sort((a, b) => timestamp(a.dueAt) - timestamp(b.dueAt));
  const nextForwarding = overdueForwardings[0] ?? null;
  let reason: DemandOperationReason = "active";
  let deadlineAt = snapshot.slaDueAt;
  if (nextForwarding) {
    reason = "forwarding_overdue";
    deadlineAt = nextForwarding.dueAt;
  } else if (isBefore(snapshot.slaDueAt, nowMs)) {
    reason = "demand_overdue";
  } else if (Number.isFinite(timestamp(snapshot.slaDueAt)) && timestamp(snapshot.slaDueAt) <= nowMs + DUE_SOON_HOURS * 3_600_000) {
    reason = "due_soon";
  } else if (isBefore(snapshot.updatedAt, nowMs - STALE_DAYS * 86_400_000)) {
    reason = "stale";
  }
  return {
    id: snapshot.id,
    protocol: snapshot.protocol,
    title: snapshot.title,
    status: snapshot.status,
    priority: snapshot.priority,
    categoryId: snapshot.categoryId,
    categoryName: snapshot.categoryName,
    contactName: snapshot.contactName,
    assigneeUserId: snapshot.assigneeUserId,
    assigneeName: snapshot.assigneeName,
    destinationId: nextForwarding?.destinationId ?? null,
    destinationName: nextForwarding?.destinationName ?? null,
    reason,
    deadlineAt,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function filterSnapshots(rows: DemandOperationSnapshot[], filters: DemandOperationFilters) {
  const search = filters.search?.trim().toLocaleLowerCase("pt-BR");
  return rows.filter((row) => {
    if (filters.categoryId && row.categoryId !== filters.categoryId) return false;
    if (filters.assigneeUserId && row.assigneeUserId !== filters.assigneeUserId && !row.forwardings.some((item) => item.assigneeUserId === filters.assigneeUserId)) return false;
    if (filters.demandStatus && row.status !== filters.demandStatus) return false;
    if (filters.destinationId && !row.forwardings.some((item) => item.destinationId === filters.destinationId)) return false;
    if (filters.forwardingStatus && !row.forwardings.some((item) => item.status === filters.forwardingStatus)) return false;
    if (search && ![row.protocol, row.title, row.contactName, row.categoryName, row.assigneeName, ...row.forwardings.map((item) => item.destinationName)]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(search))) return false;
    return true;
  });
}

function buildBreakdown(rows: DemandOperationSnapshot[], select: (row: DemandOperationSnapshot) => Array<{ id: string; label: string }>, now: Date) {
  const map = new Map<string, Breakdown>();
  for (const row of rows) {
    const overdue = classifyDemandOperation(row, now)?.reason;
    for (const entry of select(row)) {
      const current = map.get(entry.id) ?? { ...entry, total: 0, overdue: 0 };
      current.total += 1;
      if (overdue === "forwarding_overdue" || overdue === "demand_overdue") current.overdue += 1;
      map.set(entry.id, current);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
}

export function buildDemandOperationsReport(
  snapshots: DemandOperationSnapshot[],
  filters: DemandOperationFilters,
  now = new Date(),
): DemandOperationsReport {
  const rows = filterSnapshots(snapshots, filters);
  const active = rows.filter((row) => ACTIVE_DEMAND_SET.has(row.status));
  const completed = rows.filter((row) => row.status === "completed");
  const queue = active.map((row) => classifyDemandOperation(row, now)).filter((item): item is DemandOperationItem => item !== null);
  const deadlineFiltered = filters.deadlineState && filters.deadlineState !== "all"
    ? queue.filter((item) => item.reason === filters.deadlineState)
    : queue;
  deadlineFiltered.sort((a, b) => REASON_WEIGHT[a.reason] - REASON_WEIGHT[b.reason]
    || (timestamp(a.deadlineAt) || Number.MAX_SAFE_INTEGER) - (timestamp(b.deadlineAt) || Number.MAX_SAFE_INTEGER)
    || (a.protocol ?? a.title).localeCompare(b.protocol ?? b.title, "pt-BR"));
  const forwardings = rows.flatMap((row) => row.forwardings);
  const sentForwardings = forwardings.filter((item) => item.sentAt);
  const nowMs = now.getTime();
  const overdue = active.filter((row) => isBefore(row.slaDueAt, nowMs)).length;
  const forwardingOverdue = active.filter((row) => row.forwardings.some((item) => ACTIVE_FORWARDING_SET.has(item.status) && isBefore(item.dueAt, nowMs))).length;
  const start = (filters.page - 1) * filters.pageSize;
  const totalPages = deadlineFiltered.length ? Math.ceil(deadlineFiltered.length / filters.pageSize) : 0;

  return {
    generatedAt: now.toISOString(),
    filters,
    summary: {
      totalCreated: rows.length,
      active: active.length,
      completed: completed.length,
      overdue,
      forwardingOverdue,
      dueSoon: active.filter((row) => Number.isFinite(timestamp(row.slaDueAt)) && timestamp(row.slaDueAt) >= nowMs && timestamp(row.slaDueAt) <= nowMs + DUE_SOON_HOURS * 3_600_000).length,
      stale: active.filter((row) => isBefore(row.updatedAt, nowMs - STALE_DAYS * 86_400_000)).length,
      completionRate: rows.length ? completed.length / rows.length : 0,
      overdueRate: active.length ? overdue / active.length : 0,
      responseRate: sentForwardings.length ? sentForwardings.filter((item) => item.answeredAt).length / sentForwardings.length : 0,
      averageFirstMovementHours: average(rows.map((row) => hoursBetween(row.createdAt, row.firstMovementAt))),
      averageResponseHours: average(sentForwardings.map((item) => hoursBetween(item.sentAt, item.answeredAt))),
      averageResolutionHours: average(completed.map((row) => hoursBetween(row.createdAt, row.completedAt))),
    },
    breakdowns: {
      categories: buildBreakdown(rows, (row) => row.categoryId ? [{ id: row.categoryId, label: row.categoryName ?? "Sem categoria" }] : [{ id: "unassigned", label: "Sem categoria" }], now),
      destinations: buildBreakdown(rows, (row) => [...new Map(row.forwardings.map((item) => [item.destinationId, { id: item.destinationId, label: item.destinationName }])).values()], now),
      assignees: buildBreakdown(rows, (row) => row.assigneeUserId ? [{ id: row.assigneeUserId, label: row.assigneeName ?? "Sem responsavel" }] : [{ id: "unassigned", label: "Sem responsavel" }], now),
    },
    items: deadlineFiltered.slice(start, start + filters.pageSize),
    pagination: { page: filters.page, pageSize: filters.pageSize, total: deadlineFiltered.length, totalPages },
  };
}

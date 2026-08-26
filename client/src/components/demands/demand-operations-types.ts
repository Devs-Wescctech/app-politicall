export type DemandOperationReason = "forwarding_overdue" | "demand_overdue" | "due_soon" | "stale" | "active";

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

export type DemandOperationsReport = {
  generatedAt: string;
  filters: Record<string, string | number | undefined>;
  summary: {
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
  breakdowns: {
    categories: Array<{ id: string; label: string; total: number; overdue: number }>;
    destinations: Array<{ id: string; label: string; total: number; overdue: number }>;
    assignees: Array<{ id: string; label: string; total: number; overdue: number }>;
  };
  items: DemandOperationItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

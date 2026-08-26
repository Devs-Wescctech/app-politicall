import { describe, expect, it } from "vitest";
import {
  buildDemandOperationsReport,
  classifyDemandOperation,
  type DemandOperationFilters,
  type DemandOperationSnapshot,
} from "./demand-operations-domain";

const now = new Date("2026-08-12T12:00:00.000Z");
const filters: DemandOperationFilters = {
  from: "2026-07-13T00:00:00.000Z",
  to: "2026-08-12T23:59:59.999Z",
  page: 1,
  pageSize: 25,
};

function demand(overrides: Partial<DemandOperationSnapshot> = {}): DemandOperationSnapshot {
  return {
    id: "demand-1",
    protocol: "DEM-2026-0001",
    title: "Solicitacao de iluminacao",
    status: "in_progress",
    priority: "high",
    categoryId: "cat-1",
    categoryName: "Iluminacao",
    contactName: "Maria",
    assigneeUserId: "user-1",
    assigneeName: "Ana",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
    slaDueAt: "2026-08-13T12:00:00.000Z",
    completedAt: null,
    firstMovementAt: "2026-08-10T11:00:00.000Z",
    forwardings: [],
    ...overrides,
  };
}

describe("demand operations domain", () => {
  it("uses one reason per demand in operational priority order", () => {
    const snapshot = demand({
      slaDueAt: "2026-08-11T12:00:00.000Z",
      updatedAt: "2026-07-20T12:00:00.000Z",
      forwardings: [{
        id: "forward-1", status: "waiting", destinationId: "dest-1", destinationName: "Secretaria",
        assigneeUserId: null, assigneeName: null, sentAt: "2026-08-08T12:00:00.000Z",
        dueAt: "2026-08-10T12:00:00.000Z", answeredAt: null,
      }],
    });

    expect(classifyDemandOperation(snapshot, now)).toMatchObject({
      reason: "forwarding_overdue",
      destinationName: "Secretaria",
    });
  });

  it.each([
    [{ slaDueAt: "2026-08-11T12:00:00.000Z" }, "demand_overdue"],
    [{ slaDueAt: "2026-08-12T15:00:00.000Z" }, "due_soon"],
    [{ slaDueAt: "2026-08-20T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }, "stale"],
    [{ slaDueAt: "2026-08-20T12:00:00.000Z" }, "active"],
  ])("classifies %s as %s", (overrides, reason) => {
    expect(classifyDemandOperation(demand(overrides), now)?.reason).toBe(reason);
  });

  it("does not place completed demands in the operational queue", () => {
    expect(classifyDemandOperation(demand({ status: "completed", completedAt: "2026-08-12T11:00:00.000Z" }), now)).toBeNull();
  });

  it("calculates rates, durations, rankings and deterministic pagination", () => {
    const report = buildDemandOperationsReport([
      demand(),
      demand({
        id: "demand-2", protocol: "DEM-2026-0002", categoryId: "cat-2", categoryName: "Saude",
        assigneeUserId: "user-2", assigneeName: "Bruno", status: "completed",
        createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-11T12:00:00.000Z",
        completedAt: "2026-08-11T12:00:00.000Z", firstMovementAt: "2026-08-10T14:00:00.000Z",
        forwardings: [{ id: "forward-2", status: "answered", destinationId: "dest-2", destinationName: "UBS",
          assigneeUserId: "user-2", assigneeName: "Bruno", sentAt: "2026-08-10T15:00:00.000Z",
          dueAt: "2026-08-11T15:00:00.000Z", answeredAt: "2026-08-10T19:00:00.000Z" }],
      }),
      demand({
        id: "demand-3", protocol: "DEM-2026-0003", slaDueAt: "2026-08-11T12:00:00.000Z",
        forwardings: [{ id: "forward-3", status: "waiting", destinationId: "dest-2", destinationName: "UBS",
          assigneeUserId: null, assigneeName: null, sentAt: "2026-08-09T12:00:00.000Z",
          dueAt: "2026-08-10T12:00:00.000Z", answeredAt: null }],
      }),
    ], { ...filters, pageSize: 1 }, now);

    expect(report.summary).toMatchObject({
      totalCreated: 3,
      active: 2,
      completed: 1,
      overdue: 1,
      forwardingOverdue: 1,
      completionRate: 1 / 3,
      overdueRate: 1 / 2,
      responseRate: 1 / 2,
      averageFirstMovementHours: 4 / 3,
      averageResponseHours: 4,
      averageResolutionHours: 24,
    });
    expect(report.breakdowns.categories[0]).toMatchObject({ id: "cat-1", label: "Iluminacao", total: 2 });
    expect(report.breakdowns.destinations[0]).toMatchObject({ id: "dest-2", label: "UBS", total: 2 });
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ id: "demand-3", reason: "forwarding_overdue" });
    expect(report.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  });

  it("returns zero rates and null averages when there is no data", () => {
    const report = buildDemandOperationsReport([], filters, now);
    expect(report.summary).toMatchObject({ completionRate: 0, overdueRate: 0, responseRate: 0 });
    expect(report.summary.averageFirstMovementHours).toBeNull();
    expect(report.summary.averageResponseHours).toBeNull();
    expect(report.summary.averageResolutionHours).toBeNull();
  });
});

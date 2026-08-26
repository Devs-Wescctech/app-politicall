import { describe, expect, it } from "vitest";
import { buildDemandOperationsExportFileName, buildDemandOperationsExportRows, DEMAND_OPERATIONS_EXPORT_LIMIT } from "./demand-operations-export";
import type { DemandOperationsReport } from "@/components/demands/demand-operations-types";

function report(itemCount = 1): DemandOperationsReport {
  return {
    generatedAt: "2026-08-12T12:00:00.000Z",
    filters: {},
    summary: { totalCreated: itemCount, active: itemCount, completed: 0, overdue: 1, forwardingOverdue: 0, dueSoon: 0, stale: 0, completionRate: 0, overdueRate: 1, responseRate: 0, averageFirstMovementHours: 2.5, averageResponseHours: null, averageResolutionHours: null },
    breakdowns: { categories: [], destinations: [], assignees: [] },
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `d-${index}`, protocol: `DEM-${index}`, title: `Demanda ${index}`, status: "in_progress", priority: "high",
      categoryId: null, categoryName: null, contactName: null, assigneeUserId: null, assigneeName: null,
      destinationId: null, destinationName: null, reason: "demand_overdue", deadlineAt: "2026-08-11T12:00:00.000Z",
      createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-11T12:00:00.000Z",
    })),
    pagination: { page: 1, pageSize: itemCount, total: itemCount, totalPages: 1 },
  };
}

describe("demand operations export", () => {
  it("creates stable summary and queue rows without undefined values", () => {
    const rows = buildDemandOperationsExportRows(report());
    expect(rows[0]).toEqual(["CENTRAL OPERACIONAL DE DEMANDAS"]);
    expect(rows).toContainEqual(["Taxa de atraso", "100.0%"]);
    expect(rows).toContainEqual(["Protocolo", "Titulo", "Motivo", "Status", "Responsavel", "Categoria", "Destino", "Prazo"]);
    expect(rows.flat()).not.toContain(undefined);
  });

  it("limits queue exports to five thousand records", () => {
    const rows = buildDemandOperationsExportRows(report(DEMAND_OPERATIONS_EXPORT_LIMIT + 10));
    expect(rows.filter((row) => String(row[0]).startsWith("DEM-")).length).toBe(DEMAND_OPERATIONS_EXPORT_LIMIT);
  });

  it("uses dated xlsx and pdf filenames", () => {
    expect(buildDemandOperationsExportFileName("xlsx", new Date("2026-08-12T12:00:00Z"))).toBe("central-demandas-2026-08-12.xlsx");
    expect(buildDemandOperationsExportFileName("pdf", new Date("2026-08-12T12:00:00Z"))).toBe("central-demandas-2026-08-12.pdf");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDemandProtocol,
  buildDemandSummary,
  calculateSlaDueAt,
  validateDemandInput,
} from "./demand-domain";

describe("demand domain", () => {
  it("builds a stable yearly protocol", () => {
    expect(buildDemandProtocol(2026, 123)).toBe("DEM-2026-000123");
  });

  it("calculates SLA from the creation instant", () => {
    const createdAt = new Date("2026-08-11T12:00:00.000Z");
    expect(calculateSlaDueAt(createdAt, 24).toISOString()).toBe("2026-08-12T12:00:00.000Z");
  });

  it("requires a contact for external demands", () => {
    expect(() => validateDemandInput({ kind: "external", contactId: null, categoryId: "cat", assigneeUserId: "user" }))
      .toThrow("Eleitor e obrigatorio para demanda externa");
  });

  it("requires category and assignee for internal demands", () => {
    expect(() => validateDemandInput({ kind: "internal", contactId: null, categoryId: null, assigneeUserId: null }))
      .toThrow("Categoria e responsavel sao obrigatorios para demanda interna");
  });

  it("summarizes active, overdue and completed demands", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    const summary = buildDemandSummary([
      { status: "open", priority: "urgent", slaDueAt: new Date("2026-08-11T11:00:00.000Z"), createdAt: new Date("2026-08-10T12:00:00.000Z"), completedAt: null },
      { status: "in_progress", priority: "medium", slaDueAt: new Date("2026-08-12T12:00:00.000Z"), createdAt: new Date("2026-08-11T10:00:00.000Z"), completedAt: null },
      { status: "completed", priority: "low", slaDueAt: new Date("2026-08-11T10:00:00.000Z"), createdAt: new Date("2026-08-10T10:00:00.000Z"), completedAt: new Date("2026-08-11T09:00:00.000Z") },
    ], now);

    expect(summary).toMatchObject({ total: 3, active: 2, overdue: 1, completed: 1, urgent: 1 });
    expect(summary.averageResolutionHours).toBe(23);
  });
});

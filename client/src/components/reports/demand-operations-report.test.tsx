import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand operations insights", () => {
  const report = readFileSync("client/src/components/reports/demand-operations-report.tsx", "utf8");
  const dashboard = readFileSync("client/src/pages/dashboard.tsx", "utf8");
  const reportsPage = readFileSync("client/src/pages/reports.tsx", "utf8");

  it("shows rates, durations and all operational rankings", () => {
    expect(report).toContain("Taxa de conclusao");
    expect(report).toContain("Taxa de atraso");
    expect(report).toContain("Taxa de resposta");
    expect(report).toContain("Tempo ate o primeiro movimento");
    expect(report).toContain("Tempo medio de resposta");
    expect(report).toContain("Tempo medio de resolucao");
    expect(report).toContain("Por categoria");
    expect(report).toContain("Por destino");
    expect(report).toContain("Por responsavel");
  });

  it("links reports and dashboard to the operations center", () => {
    expect(report).toContain('/demands?view=operations');
    expect(dashboard).toContain('/demands?view=operations');
  });

  it("adds campaign and demand report areas", () => {
    expect(reportsPage).toContain('<TabsTrigger value="campaigns"');
    expect(reportsPage).toContain('<TabsTrigger value="demands"');
    expect(reportsPage).toContain("<DemandOperationsReport");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand operations center UI", () => {
  const source = readFileSync("client/src/components/demands/demand-operations-center.tsx", "utf8");
  const page = readFileSync("client/src/pages/demands.tsx", "utf8");

  it("covers loading, error, empty and retry states", () => {
    expect(source).toContain("Carregando central operacional");
    expect(source).toContain("Nao foi possivel carregar a central");
    expect(source).toContain("Tentar novamente");
    expect(source).toContain("Nenhuma pendencia encontrada");
  });

  it("offers operational filters, rankings and pagination", () => {
    expect(source).toContain("Periodo inicial");
    expect(source).toContain("Categoria");
    expect(source).toContain("Destino");
    expect(source).toContain("Responsavel");
    expect(source).toContain("Estado do prazo");
    expect(source).toContain("Ranking por categoria");
    expect(source).toContain("Ranking por destino");
    expect(source).toContain("Ranking por responsavel");
    expect(source).toContain("pagination.page");
  });

  it("opens a demand from desktop and mobile rows", () => {
    expect(source.match(/onOpenDemand\(item\.id\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('data-testid="demand-operations-center"');
  });

  it("is integrated as a selectable demands view", () => {
    expect(page).toContain('sourceParams.get("view") === "operations"');
    expect(page).toContain('<TabsTrigger value="operations"');
    expect(page).toContain("<DemandOperationsCenter");
  });
});

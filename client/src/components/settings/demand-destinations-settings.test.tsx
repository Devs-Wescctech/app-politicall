import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("demand destinations settings", () => {
  const source = readFileSync("client/src/components/settings/demand-destinations-settings.tsx", "utf8");
  it("supports internal/external destinations, deadlines and activation", () => {
    expect(source).toContain("Orgao externo"); expect(source).toContain("Setor interno");
    expect(source).toContain("Prazo (horas)"); expect(source).toContain("Switch");
    expect(source).toContain("Responsavel de contato"); expect(source).toContain("Telefone"); expect(source).toContain("E-mail");
    expect(source).toContain("Pesquisar destinos"); expect(source).toContain("Tentar novamente");
    expect(source).toContain("Encaminhamentos existentes serao preservados");
  });
});

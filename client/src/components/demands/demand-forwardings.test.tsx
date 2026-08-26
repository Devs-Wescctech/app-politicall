import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand forwardings UI", () => {
  const source = readFileSync("client/src/components/demands/demand-forwardings.tsx", "utf8");
  it("covers summary, empty state, actions and reviewed citizen draft", () => {
    expect(source).toContain("Ativos"); expect(source).toContain("Vencidos"); expect(source).toContain("Concluidos");
    expect(source).toContain("Nenhum encaminhamento"); expect(source).toContain("Registrar resposta");
    expect(source).toContain("Preparar atualizacao"); expect(source).toContain("Revise o texto antes de enviar");
    expect(source).toContain("Agendar retorno"); expect(source).toContain("forwardingId: followUp.id");
    expect(source).toContain("Encaminhar"); expect(source).toContain("Cancelar encaminhamento");
    expect(source).toContain('const terminal = ["completed", "cancelled"].includes(item.status)');
    expect(source).toContain("Protocolo externo"); expect(source).toContain("Prazo especifico");
    expect(source).toContain("Prioridade do encaminhamento"); expect(source).toContain("item.response");
  });
});

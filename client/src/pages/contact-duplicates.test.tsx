import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { ContactDuplicatesContent, type DuplicateGroupView, type MergeEventView } from "./contact-duplicates";

const group: DuplicateGroupView = {
  id: "contact-a:contact-b",
  confidence: "high",
  evidence: [{ kind: "phone", confidence: "high", label: "Mesmo telefone" }],
  contacts: [
    { id: "contact-a", name: "Maria Silva", email: "maria@example.com", phone: "+5511999990000", city: "Sao Paulo", state: "SP" },
    { id: "contact-b", name: "Maria S.", email: null, phone: "+55 11 99999-0000", city: "Sao Paulo", state: "SP" },
  ],
};

function html(props: Parameters<typeof ContactDuplicatesContent>[0]) {
  return renderToStaticMarkup(createElement(Router, {
    ssrPath: "/contacts/duplicates",
    children: createElement(ContactDuplicatesContent, props),
  }));
}

describe("ContactDuplicatesContent", () => {
  it("renders a clear empty state", () => {
    const output = html({ state: "ready", groups: [], events: [], onReview: () => undefined, onRevert: () => undefined });
    expect(output).toContain("Nenhuma duplicidade pendente");
    expect(output).toContain("Voltar para eleitores");
  });

  it("renders evidence and every candidate without merging automatically", () => {
    const output = html({ state: "ready", groups: [group], events: [], onReview: () => undefined, onRevert: () => undefined });
    expect(output).toContain("Mesmo telefone");
    expect(output).toContain("Maria Silva");
    expect(output).toContain("Maria S.");
    expect(output).toContain("Revisar grupo");
    expect(output).toContain("Nenhum contato sera mesclado automaticamente");
  });

  it("renders merge history and the revert command only for completed entries", () => {
    const events: MergeEventView[] = [
      { id: "merge-a", sourceContactId: "contact-b", targetContactId: "contact-a", status: "completed", sourceSnapshot: { name: "Maria S." }, targetSnapshot: { name: "Maria Silva" }, createdAt: "2026-08-12T10:00:00Z" },
      { id: "merge-b", sourceContactId: "contact-c", targetContactId: "contact-a", status: "reverted", sourceSnapshot: { name: "Maria C." }, targetSnapshot: { name: "Maria Silva" }, createdAt: "2026-08-11T10:00:00Z" },
    ];
    const output = html({ state: "ready", groups: [], events, onReview: () => undefined, onRevert: () => undefined });
    expect(output).toContain("Maria S.");
    expect(output).toContain("Maria C.");
    expect(output.match(/Desfazer/g)?.length).toBe(1);
    expect(output).toContain("Revertida");
  });

  it("renders loading and recoverable error states", () => {
    expect(html({ state: "loading" })).toContain("Carregando duplicidades");
    expect(html({ state: "error", onRetry: () => undefined })).toContain("Tentar novamente");
  });
});

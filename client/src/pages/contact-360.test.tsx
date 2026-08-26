import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { Contact360Content } from "./contact-360";
import type { Contact360Response } from "@shared/contact-360";

const data: Contact360Response = {
  visibility: { demands: true, conversations: true, events: true, campaigns: true, petitions: true },
  contact: {
    id: "contact-a",
    name: "Maria Silva",
    email: "maria@example.com",
    phone: "+5511999990000",
    age: 42,
    gender: "Feminino",
    state: "SP",
    city: "Sao Paulo",
    neighborhood: "Centro",
    interests: ["Saude", "Educacao"],
    source: "Peticao",
    notes: "Lideranca comunitaria",
    createdAt: "2026-08-01T10:00:00.000Z",
  },
  summary: { demands: 1, openDemands: 1, conversations: 1, events: 0, campaigns: 0, petitions: 1 },
  timeline: [
    { id: "attendance:a2", type: "attendance", title: "Atendimento ATD-002", description: "WhatsApp recebido em Gabinete Bairro - +5511999990002", occurredAt: "2026-08-11T11:00:00.000Z", status: "open", sourceId: "a2", href: "/attendance?conversationId=a2" },
    { id: "attendance:a1", type: "attendance", title: "Atendimento ATD-001", description: "WhatsApp recebido em Gabinete Centro - +5511999990001", occurredAt: "2026-08-11T10:00:00.000Z", status: "in_progress", sourceId: "a1", href: "/attendance?conversationId=a1" },
    { id: "demand:d1", type: "demand", title: "Iluminacao publica", description: "DEM-2026-000001", occurredAt: "2026-08-11T10:00:00.000Z", status: "open", sourceId: "d1", href: "/demands?demandId=d1" },
    { id: "petition:s1", type: "petition", title: "Mais seguranca", description: "Assinatura registrada", occurredAt: "2026-08-08T10:00:00.000Z", status: "signed", sourceId: "p1", href: "/petitions?petitionId=p1" },
  ],
  demands: [{ id: "d1", title: "Iluminacao publica", protocol: "DEM-2026-000001", status: "open", priority: "high", createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-11T10:00:00.000Z" }],
  conversations: [
    { id: "a1", attendanceCode: "ATD-001", channel: "whatsapp", status: "in_progress", summary: null, inboundConnectionName: "Gabinete Centro", inboundNumber: "+5511999990001", inboundLabel: "WhatsApp recebido em Gabinete Centro - +5511999990001", createdAt: "2026-08-10T10:00:00.000Z", lastMessageAt: null },
    { id: "a2", attendanceCode: "ATD-002", channel: "whatsapp", status: "open", summary: null, inboundConnectionName: "Gabinete Bairro", inboundNumber: "+5511999990002", inboundLabel: "WhatsApp recebido em Gabinete Bairro - +5511999990002", createdAt: "2026-08-10T11:00:00.000Z", lastMessageAt: null },
  ],
  events: [],
  campaigns: [],
  petitions: [{ id: "s1", petitionId: "p1", petitionTitle: "Mais seguranca", createdAt: "2026-08-08T10:00:00.000Z" }],
};

function html(props: Parameters<typeof Contact360Content>[0]) {
  return renderToStaticMarkup(createElement(Router, {
    ssrPath: "/contacts/contact-a",
    children: createElement(Contact360Content, props),
  }));
}

describe("Contact360Content", () => {
  it("renders a stable loading state", () => {
    expect(html({ state: "loading" })).toContain("Carregando ficha do eleitor");
  });

  it("renders a recoverable error state", () => {
    const output = html({ state: "error", onRetry: () => undefined });
    expect(output).toContain("Nao foi possivel carregar a ficha");
    expect(output).toContain("Tentar novamente");
  });

  it("renders the voter identity, summary and timeline", () => {
    const output = html({ state: "success", data });
    expect(output).toContain("Maria Silva");
    expect(output).toContain("Demandas abertas");
    expect(output).toContain("Iluminacao publica");
    expect(output).toContain("Mais seguranca");
    expect(output).toContain("Nova demanda");
    expect(output).toContain("Novo atendimento");
    expect(output).toContain("Agendar retorno");
    expect(output).toContain("WhatsApp recebido em Gabinete Centro - +5511999990001");
    expect(output).toContain("WhatsApp recebido em Gabinete Bairro - +5511999990002");
  });

  it("does not render domains hidden by permissions", () => {
    const output = html({ state: "success", data: {
      ...data,
      visibility: { demands: true, conversations: false, events: false, campaigns: false, petitions: false },
      conversations: [], events: [], campaigns: [], petitions: [],
      timeline: data.timeline.filter((item) => item.type === "demand"),
    } });
    expect(output).toContain("Demandas");
    expect(output).not.toContain("Atendimentos");
    expect(output).not.toContain("Peticoes");
  });

  it("guides the user when the contact has no related activity", () => {
    const empty = { ...data, summary: { demands: 0, openDemands: 0, conversations: 0, events: 0, campaigns: 0, petitions: 0 }, timeline: [], demands: [], conversations: [], petitions: [] };
    expect(html({ state: "success", data: empty })).toContain("Nenhuma interacao registrada");
  });
});

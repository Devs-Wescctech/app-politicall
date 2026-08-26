import { describe, expect, it } from "vitest";
import { buildContact360Summary, buildContact360Timeline, resolveContact360Visibility } from "./contact-360-domain";

const input = {
  demands: [
    { id: "d1", title: "Iluminacao publica", protocol: "DEM-2026-000001", status: "open", createdAt: new Date("2026-08-10T10:00:00Z"), updatedAt: new Date("2026-08-11T10:00:00Z") },
    { id: "d2", title: "Retorno concluido", protocol: "DEM-2026-000002", status: "completed", createdAt: new Date("2026-08-09T10:00:00Z"), updatedAt: new Date("2026-08-09T12:00:00Z") },
  ],
  conversations: [
    { id: "a1", attendanceCode: "ATD-001", channel: "whatsapp", status: "in_progress", summary: "Solicitou retorno", inboundConnectionName: "Gabinete Centro", inboundNumber: "+5511999990001", inboundLabel: "WhatsApp recebido em Gabinete Centro - +5511999990001", createdAt: new Date("2026-08-11T09:00:00Z"), lastMessageAt: new Date("2026-08-11T11:00:00Z") },
  ],
  events: [
    { id: "e1", title: "Reuniao no bairro", category: "meeting", startDate: new Date("2026-08-12T14:00:00Z"), createdAt: new Date("2026-08-08T10:00:00Z") },
  ],
  campaigns: [
    { id: "r1", campaignId: "c1", campaignName: "Prestacao de contas", channel: "email", status: "delivered", createdAt: new Date("2026-08-07T10:00:00Z"), sentAt: new Date("2026-08-11T12:00:00Z") },
  ],
  petitions: [
    { id: "s1", petitionId: "p1", petitionTitle: "Mais seguranca", createdAt: new Date("2026-08-06T10:00:00Z") },
  ],
};

describe("contact 360 aggregation", () => {
  it("orders normalized activity by most recent occurrence", () => {
    const timeline = buildContact360Timeline(input);

    expect(timeline.map((item) => item.type)).toEqual(["event", "campaign", "attendance", "demand", "demand", "petition"]);
    expect(timeline.find((item) => item.type === "demand")?.href).toBe("/demands?demandId=d1");
    expect(timeline.find((item) => item.type === "attendance")?.href).toBe("/attendance?conversationId=a1");
    expect(timeline.find((item) => item.type === "attendance")?.description).toContain("WhatsApp recebido em Gabinete Centro - +5511999990001");
  });

  it("summarizes related records and active demands", () => {
    expect(buildContact360Summary(input)).toEqual({
      demands: 2,
      openDemands: 1,
      conversations: 1,
      events: 1,
      campaigns: 1,
      petitions: 1,
    });
  });

  it("counts every non-terminal demand status as open", () => {
    const demands = ["open", "triage", "in_progress", "waiting_requester", "waiting_third_party", "completed", "cancelled"]
      .map((status, index) => ({ ...input.demands[0], id: `status-${index}`, status }));

    expect(buildContact360Summary({ ...input, demands }).openDemands).toBe(5);
  });

  it("uses database totals and distinct campaigns instead of the limited page size", () => {
    expect(buildContact360Summary(input, {
      demands: 87,
      openDemands: 61,
      conversations: 75,
      events: 54,
      campaigns: 12,
      petitions: 103,
    })).toEqual({ demands: 87, openDemands: 61, conversations: 75, events: 54, campaigns: 12, petitions: 103 });

    expect(buildContact360Summary({
      ...input,
      campaigns: [input.campaigns[0], { ...input.campaigns[0], id: "r2", channel: "sms" }],
    }).campaigns).toBe(1);
  });

  it("derives domain visibility from the authenticated permissions", () => {
    expect(resolveContact360Visibility({ role: "assessor", permissions: { contacts: true, demands: true, agenda: false, petitions: false, attendanceView: true } as any })).toEqual({
      demands: true,
      conversations: true,
      events: false,
      campaigns: false,
      petitions: false,
    });
    expect(resolveContact360Visibility({ role: "admin", permissions: {} as any })).toEqual({ demands: true, conversations: true, events: true, campaigns: true, petitions: true });
  });

  it("limits the timeline to one hundred entries", () => {
    const demands = Array.from({ length: 120 }, (_, index) => ({
      id: `d${index}`,
      title: `Demanda ${index}`,
      protocol: null,
      status: "open",
      createdAt: new Date(2026, 0, 1, 0, index),
      updatedAt: new Date(2026, 0, 1, 0, index),
    }));

    expect(buildContact360Timeline({ ...input, demands }).length).toBe(100);
  });
});

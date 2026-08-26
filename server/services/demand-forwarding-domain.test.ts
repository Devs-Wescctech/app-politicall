import { describe, expect, it } from "vitest";
import {
  buildCitizenUpdateDraft,
  calculateForwardingDueAt,
  classifyForwardingDeadline,
  validateForwardingTransition,
} from "./demand-forwarding-domain";

describe("demand forwarding domain", () => {
  it("calculates the deadline from the destination default", () => {
    const sentAt = new Date("2026-08-12T12:00:00.000Z");
    expect(calculateForwardingDueAt(sentAt, 48)).toEqual(new Date("2026-08-14T12:00:00.000Z"));
  });

  it("accepts an explicit deadline only after the forwarding date", () => {
    const sentAt = new Date("2026-08-12T12:00:00.000Z");
    expect(calculateForwardingDueAt(sentAt, 24, "2026-08-13T18:00:00.000Z")).toEqual(new Date("2026-08-13T18:00:00.000Z"));
    expect(() => calculateForwardingDueAt(sentAt, 24, "2026-08-12T11:59:00.000Z")).toThrow("posterior");
  });

  it("allows the operational transition sequence and unchanged states", () => {
    expect(() => validateForwardingTransition("draft", "forwarded")).not.toThrow();
    expect(() => validateForwardingTransition("forwarded", "waiting")).not.toThrow();
    expect(() => validateForwardingTransition("waiting", "answered")).not.toThrow();
    expect(() => validateForwardingTransition("answered", "completed")).not.toThrow();
    expect(() => validateForwardingTransition("waiting", "waiting")).not.toThrow();
  });

  it("rejects reopening final states and skipping the draft send", () => {
    expect(() => validateForwardingTransition("completed", "waiting")).toThrow("Transicao");
    expect(() => validateForwardingTransition("cancelled", "draft")).toThrow("Transicao");
    expect(() => validateForwardingTransition("draft", "answered")).toThrow("Transicao");
  });

  it("classifies only active forwarded deadlines", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(classifyForwardingDeadline({ status: "forwarded", dueAt: "2026-08-12T14:00:00.000Z" }, now)).toBe("due_soon");
    expect(classifyForwardingDeadline({ status: "waiting", dueAt: "2026-08-12T11:00:00.000Z" }, now)).toBe("overdue");
    expect(classifyForwardingDeadline({ status: "draft", dueAt: "2026-08-12T11:00:00.000Z" }, now)).toBeNull();
    expect(classifyForwardingDeadline({ status: "answered", dueAt: "2026-08-12T11:00:00.000Z" }, now)).toBeNull();
  });

  it("builds a deterministic citizen update without claiming it was sent", () => {
    expect(buildCitizenUpdateDraft({
      demandProtocol: "DEM-2026-0012",
      demandTitle: "Iluminacao da Rua das Flores",
      destinationName: "Secretaria de Obras",
      status: "answered",
      response: "A equipe realizara vistoria em 15 de agosto.",
    })).toBe("Atualizacao da demanda DEM-2026-0012 - Iluminacao da Rua das Flores: recebemos retorno da Secretaria de Obras. A equipe realizara vistoria em 15 de agosto.");
  });
});

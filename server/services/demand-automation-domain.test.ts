import { describe, expect, it } from "vitest";
import { buildDemandChangeNotification, classifyDemandSlaAlert, validateDemandAttachment } from "./demand-automation-domain";

describe("demand automation domain", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("classifies active demands into due-soon and overdue alerts", () => {
    expect(classifyDemandSlaAlert({ status: "in_progress", slaDueAt: new Date("2026-08-12T15:59:59.000Z") }, now)).toBe("sla_due_soon");
    expect(classifyDemandSlaAlert({ status: "open", slaDueAt: new Date("2026-08-12T11:59:59.000Z") }, now)).toBe("sla_overdue");
  });

  it("ignores distant, completed and unscheduled demands", () => {
    expect(classifyDemandSlaAlert({ status: "open", slaDueAt: new Date("2026-08-12T16:00:01.000Z") }, now)).toBeNull();
    expect(classifyDemandSlaAlert({ status: "completed", slaDueAt: new Date("2026-08-12T11:00:00.000Z") }, now)).toBeNull();
    expect(classifyDemandSlaAlert({ status: "open", slaDueAt: null }, now)).toBeNull();
  });

  it("accepts only matching PDF and image signatures within 10 MB", () => {
    const pdf = Buffer.from("%PDF-1.7\ncontent");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    expect(validateDemandAttachment({ buffer: pdf, mimeType: "application/pdf", originalName: "protocolo.pdf", size: pdf.length }))
      .toEqual({ mimeType: "application/pdf", extension: "pdf", safeOriginalName: "protocolo.pdf" });
    expect(validateDemandAttachment({ buffer: png, mimeType: "image/png", originalName: "foto.png", size: png.length }))
      .toEqual({ mimeType: "image/png", extension: "png", safeOriginalName: "foto.png" });
  });

  it("rejects executable, forged and oversized files", () => {
    expect(() => validateDemandAttachment({ buffer: Buffer.from("MZ"), mimeType: "application/pdf", originalName: "falso.pdf", size: 2 }))
      .toThrow("conteudo nao corresponde");
    expect(() => validateDemandAttachment({ buffer: Buffer.from("MZ"), mimeType: "application/x-msdownload", originalName: "arquivo.exe", size: 2 }))
      .toThrow("Tipo de arquivo nao permitido");
    expect(() => validateDemandAttachment({ buffer: Buffer.from("%PDF-"), mimeType: "application/pdf", originalName: "grande.pdf", size: 10 * 1024 * 1024 + 1 }))
      .toThrow("10 MB");
  });

  it("notifies the current assignee about status and assignment changes made by another user", () => {
    expect(buildDemandChangeNotification({
      demandId: "demand-id", actorUserId: "manager", previousAssigneeUserId: "old", assigneeUserId: "agent",
      previousStatus: "triage", status: "in_progress", protocol: "DEM-2026-000001", title: "Iluminacao",
    })).toEqual({
      userId: "agent", title: "Demanda atualizada",
      message: "DEM-2026-000001: status alterado para Em andamento e responsabilidade atribuida a voce",
      priority: "medium", link: "/demands?demandId=demand-id",
    });
  });

  it("does not notify users about their own changes or unchanged fields", () => {
    expect(buildDemandChangeNotification({
      demandId: "demand-id", actorUserId: "agent", previousAssigneeUserId: "agent", assigneeUserId: "agent",
      previousStatus: "triage", status: "in_progress", protocol: "DEM", title: "Teste",
    })).toBeNull();
    expect(buildDemandChangeNotification({
      demandId: "demand-id", actorUserId: "manager", previousAssigneeUserId: "agent", assigneeUserId: "agent",
      previousStatus: "triage", status: "triage", protocol: "DEM", title: "Teste",
    })).toBeNull();
  });
});

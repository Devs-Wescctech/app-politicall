import { describe, expect, it } from "vitest";
import { assertAttendanceTransition, canTransitionAttendance, isFinalAttendanceStatus } from "./attendance-state";
import * as attendanceStateModule from "./attendance-state";

describe("attendance state machine", () => {
  it("allows the normal operator lifecycle", () => {
    expect(canTransitionAttendance("waiting_agent", "in_progress")).toBe(true);
    expect(canTransitionAttendance("in_progress", "transferred")).toBe(true);
    expect(canTransitionAttendance("in_progress", "finalized")).toBe(true);
    expect(canTransitionAttendance("finalized", "reopened")).toBe(true);
  });

  it("blocks reopening an active conversation and assuming a finalized one", () => {
    expect(canTransitionAttendance("in_progress", "reopened")).toBe(false);
    expect(canTransitionAttendance("finalized", "in_progress")).toBe(false);
    expect(() => assertAttendanceTransition("finalized", "in_progress")).toThrow("Transição de atendimento inválida");
  });

  it("recognizes all legacy final statuses", () => {
    expect(isFinalAttendanceStatus("resolved")).toBe(true);
    expect(isFinalAttendanceStatus("finalized")).toBe(true);
    expect(isFinalAttendanceStatus("closed")).toBe(true);
    expect(isFinalAttendanceStatus("in_progress")).toBe(false);
  });

  it("preserves in-progress ownership when remote sync reports automatic", () => {
    const statusForSyncedConversation = (attendanceStateModule as any).statusForSyncedConversation;

    expect(statusForSyncedConversation?.("automatic", "user-1")).toBe("in_progress");
    expect(statusForSyncedConversation?.("automatic", null)).toBe("automatic");
    expect(statusForSyncedConversation?.("waiting_customer", "user-1")).toBe("waiting_customer");
  });
});

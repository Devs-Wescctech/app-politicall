import { describe, expect, it } from "vitest";
import { buildAttendanceFollowUp } from "./attendance-follow-up";

const conversation = {
  id: "conversation-1",
  contactId: "contact-1",
  contactName: "Maria Silva",
  contactPhone: "5511999990000",
  attendanceCode: "ATD-2026-0001",
};

describe("buildAttendanceFollowUp", () => {
  it("creates an agenda event linked to the conversation and contact", () => {
    const event = buildAttendanceFollowUp(conversation, {
      startDate: "2026-08-12T13:00:00.000Z",
      endDate: "2026-08-12T13:30:00.000Z",
      reminderMinutes: 15,
    });

    expect(event).toMatchObject({
      title: "Retorno - Maria Silva",
      category: "meeting",
      contactId: "contact-1",
      attendanceConversationId: "conversation-1",
      reminder: true,
      reminderMinutes: 15,
    });
    expect(event.description).toContain("ATD-2026-0001");
  });

  it("rejects an end time that is not after the start time", () => {
    expect(() => buildAttendanceFollowUp(conversation, {
      startDate: "2026-08-12T13:00:00.000Z",
      endDate: "2026-08-12T12:30:00.000Z",
    })).toThrow("posterior");
  });
});

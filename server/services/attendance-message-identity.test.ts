import { describe, expect, it } from "vitest";
import { extractAttendanceExternalMessageId } from "./attendance-message-identity";

describe("extractAttendanceExternalMessageId", () => {
  it("uses the WHU messageSentId returned by send-text", () => {
    expect(extractAttendanceExternalMessageId({ messageSentId: "whu-1" })).toBe("whu-1");
  });

  it("falls back to the first messagesSentIds entry", () => {
    expect(extractAttendanceExternalMessageId({ messagesSentIds: ["whu-2"] })).toBe("whu-2");
  });

  it("supports regular id and rejects empty responses", () => {
    expect(extractAttendanceExternalMessageId({ id: "whu-3" })).toBe("whu-3");
    expect(extractAttendanceExternalMessageId({})).toBeNull();
  });
});

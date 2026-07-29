import { describe, expect, it } from "vitest";
import { buildEventDateRange, parseBrazilianDateTime } from "./event-date";

describe("event date helpers", () => {
  it("parses Brazilian date and time values", () => {
    const parsed = parseBrazilianDateTime("22/07/2026", "14:30");

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(6);
    expect(parsed?.getDate()).toBe(22);
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it("rejects impossible dates instead of rolling them forward", () => {
    expect(parseBrazilianDateTime("31/02/2026", "09:00")).toBeNull();
  });

  it("builds a valid event date range", () => {
    const range = buildEventDateRange({
      startDateStr: "22/07/2026",
      startTimeStr: "09:00",
      endDateStr: "22/07/2026",
      endTimeStr: "10:00",
    });

    expect(range?.startDate.getHours()).toBe(9);
    expect(range?.endDate.getHours()).toBe(10);
  });
});

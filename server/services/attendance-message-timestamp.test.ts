import { describe, expect, it } from "vitest";
import {
  ensureAttendanceMessageCreatedAt,
  normalizeStoredWesccMessageDate,
  parseWesccMessageDate,
} from "./attendance-message-timestamp";

describe("ensureAttendanceMessageCreatedAt", () => {
  it("injects an explicit Date when a locally-created message has no timestamp", () => {
    const now = new Date("2026-07-13T19:17:20.500Z");

    expect(ensureAttendanceMessageCreatedAt({ body: "teste" }, () => now)).toEqual({
      body: "teste",
      createdAt: now,
    });
  });

  it("preserves the timestamp supplied by a remote message", () => {
    const remoteDate = new Date("2026-07-13T19:08:54.000Z");

    expect(ensureAttendanceMessageCreatedAt({ body: "remota", createdAt: remoteDate })).toEqual({
      body: "remota",
      createdAt: remoteDate,
    });
  });
});

describe("parseWesccMessageDate", () => {
  it("interprets a naive dhMessage as Sao Paulo local time", () => {
    expect(parseWesccMessageDate({ dhMessage: "2026-08-12T10:15:30" })?.toISOString())
      .toBe("2026-08-12T13:15:30.000Z");
  });

  it("interprets a naive utcDhMessage as UTC", () => {
    expect(parseWesccMessageDate({ utcDhMessage: "2026-08-12T13:15:30" })?.toISOString())
      .toBe("2026-08-12T13:15:30.000Z");
  });

  it("prefers the provider local timestamp when both variants exist", () => {
    expect(parseWesccMessageDate({
      dhMessage: "2026-08-12T10:15:30",
      utcDhMessage: "2026-08-12T10:15:30",
    })?.toISOString()).toBe("2026-08-12T13:15:30.000Z");
  });

  it("preserves an explicit timezone offset", () => {
    expect(parseWesccMessageDate({ dhMessage: "2026-08-12T10:15:30-03:00" })?.toISOString())
      .toBe("2026-08-12T13:15:30.000Z");
  });

  it("returns null for missing or invalid timestamps", () => {
    expect(parseWesccMessageDate({})).toBeNull();
    expect(parseWesccMessageDate({ dhMessage: "invalid" })).toBeNull();
  });
});

describe("normalizeStoredWesccMessageDate", () => {
  it("repairs a previously stored timestamp from the provider metadata", () => {
    const message = {
      createdAt: new Date("2026-08-12T10:15:30.000Z"),
      metadata: { remote: { dhMessage: "2026-08-12T10:15:30" } },
    };

    expect(normalizeStoredWesccMessageDate(message).createdAt.toISOString())
      .toBe("2026-08-12T13:15:30.000Z");
  });

  it("preserves messages without provider timestamp metadata", () => {
    const message = { createdAt: new Date("2026-08-12T13:15:30.000Z"), metadata: null };
    expect(normalizeStoredWesccMessageDate(message)).toBe(message);
  });
});

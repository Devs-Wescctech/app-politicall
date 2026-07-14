import { describe, expect, it } from "vitest";
import { ensureAttendanceMessageCreatedAt } from "./attendance-message-timestamp";

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

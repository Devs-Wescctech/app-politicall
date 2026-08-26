import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { deriveForwardingDates } from "./demand-forwardings";

describe("demand forwarding writes", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("keeps draft dates empty", () => {
    expect(deriveForwardingDates({ status: "draft", defaultDeadlineHours: 48, now })).toEqual({
      sentAt: null, dueAt: null, answeredAt: null, completedAt: null,
    });
  });

  it("sets send and default due dates when forwarding", () => {
    expect(deriveForwardingDates({ status: "forwarded", defaultDeadlineHours: 48, now })).toEqual({
      sentAt: now, dueAt: new Date("2026-08-14T12:00:00.000Z"), answeredAt: null, completedAt: null,
    });
  });

  it("preserves sent date and stamps answer or completion", () => {
    const sentAt = new Date("2026-08-10T12:00:00.000Z");
    const dueAt = new Date("2026-08-14T12:00:00.000Z");
    expect(deriveForwardingDates({ status: "answered", defaultDeadlineHours: 48, now, sentAt, dueAt }).answeredAt).toEqual(now);
    expect(deriveForwardingDates({ status: "completed", defaultDeadlineHours: 48, now, sentAt, dueAt }).completedAt).toEqual(now);
  });
});

describe("demand forwarding follow-up contract", () => {
  it("scopes an optional forwarding and records it in demand history", () => {
    const source = readFileSync("server/services/demands.ts", "utf8");
    expect(source).toContain("eq(demandForwardings.demandId, demandId)");
    expect(source).toContain("eq(demandForwardings.accountId, accountId)");
    expect(source).toContain("metadata: input.forwardingId ? { forwardingId: input.forwardingId } : null");
  });
});

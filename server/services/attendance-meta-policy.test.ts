import { describe, expect, it } from "vitest";
import { evaluatePublicReplyPolicy, resolveLastCustomerActivityAt } from "./attendance-meta-policy";

const now = new Date("2026-07-13T12:00:00.000Z");

describe("evaluatePublicReplyPolicy", () => {
  it("blocks a public reply on an expired official conversation", () => {
    const result = evaluatePublicReplyPolicy({
      connection: { provider: "meta_cloud" },
      conversation: { lastCustomerActivityAt: "2026-07-12T11:59:59.000Z" },
      now,
    });
    expect(result).toMatchObject({ allowed: false, code: "META_WINDOW_EXPIRED" });
  });

  it("allows a public reply while the official window is open", () => {
    const result = evaluatePublicReplyPolicy({
      connection: { provider: "meta_cloud" },
      conversation: { lastCustomerActivityAt: "2026-07-13T11:00:00.000Z" },
      now,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows normal WHU replies regardless of customer activity time", () => {
    const result = evaluatePublicReplyPolicy({
      connection: { provider: "wescctech" },
      conversation: { lastCustomerActivityAt: "2020-01-01T00:00:00.000Z" },
      now,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows internal notes when the Meta window is expired", () => {
    const result = evaluatePublicReplyPolicy({
      connection: { provider: "meta_cloud" },
      conversation: {},
      isWhisper: true,
      now,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("resolveLastCustomerActivityAt", () => {
  it("uses the provider lastReceivedMessageDate even when the newest message is outbound", () => {
    expect(resolveLastCustomerActivityAt({
      remoteChat: { lastReceivedMessageDate: "2026-07-11T08:00:00.000Z" },
      messages: [{ direction: "outbound", createdAt: "2026-07-13T12:00:00.000Z" }],
    })?.toISOString()).toBe("2026-07-11T08:00:00.000Z");
  });
});

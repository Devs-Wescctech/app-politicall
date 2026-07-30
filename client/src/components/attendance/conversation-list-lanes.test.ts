import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextAutoExpandedLane } from "./ConversationList";

const source = readFileSync(new URL("./ConversationList.tsx", import.meta.url), "utf8");

describe("attendance conversation lanes", () => {
  it("never keeps an assigned manual conversation in the automatic lane", () => {
    const automaticLaneStart = source.indexOf('value: "automatic"');
    const waitingLaneStart = source.indexOf('value: "waiting"', automaticLaneStart);
    const automaticLane = source.slice(automaticLaneStart, waitingLaneStart);

    expect(automaticLaneStart).toBeGreaterThanOrEqual(0);
    expect(waitingLaneStart).toBeGreaterThan(automaticLaneStart);
    expect(automaticLane).toContain('(conv as any).mode !== "manual"');
    expect(automaticLane).toContain("!conv.assignedUserId");
  });

  it("auto-expands the first lane with conversations before an operator chooses a lane", () => {
    expect(nextAutoExpandedLane("waiting", {
      automatic: 1,
      waiting: 0,
      out_of_hours: 0,
      manual: 0,
      group: 0,
    }, false)).toBe("automatic");
  });

  it("preserves the operator lane choice after manual lane interaction", () => {
    expect(nextAutoExpandedLane("waiting", {
      automatic: 1,
      waiting: 0,
      out_of_hours: 0,
      manual: 0,
      group: 0,
    }, true)).toBe("waiting");
  });

  it("does not move a lane that already has conversations", () => {
    expect(nextAutoExpandedLane("waiting", {
      automatic: 1,
      waiting: 1,
      out_of_hours: 0,
      manual: 0,
      group: 0,
    }, false)).toBe("waiting");
  });
});

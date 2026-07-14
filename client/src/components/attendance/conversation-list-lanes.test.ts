import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});

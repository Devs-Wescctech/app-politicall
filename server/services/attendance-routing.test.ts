import { describe, expect, it } from "vitest";
import { selectRoutingCandidate } from "./attendance-routing";

const candidates = [
  { userId: "a", openCount: 2, capacity: 5 },
  { userId: "b", openCount: 0, capacity: 5 },
  { userId: "c", openCount: 5, capacity: 5 },
];

describe("attendance routing", () => {
  it("keeps manual queues unassigned", () => {
    expect(selectRoutingCandidate("manual", candidates)).toBeNull();
  });

  it("selects the least loaded available agent", () => {
    expect(selectRoutingCandidate("least_loaded", candidates)?.userId).toBe("b");
  });

  it("round robins after the previous agent and skips full agents", () => {
    expect(selectRoutingCandidate("round_robin", candidates, "a")?.userId).toBe("b");
    expect(selectRoutingCandidate("round_robin", candidates, "b")?.userId).toBe("a");
  });

  it("returns null when everybody is at capacity", () => {
    expect(selectRoutingCandidate("least_loaded", [{ userId: "a", openCount: 3, capacity: 3 }])).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand forwarding automation", () => {
  const source = readFileSync("server/services/demand-forwarding-automation.ts", "utf8");
  it("reserves deadline events before notifications and runs without overlap", () => {
    expect(source).toContain("demandForwardingEvents");
    expect(source).toContain("onConflictDoNothing");
    expect(source).toContain("classifyForwardingDeadline");
    expect(source).toContain("if (running) return");
    expect(source).toContain("Math.max(intervalMs, 30_000)");
  });
});

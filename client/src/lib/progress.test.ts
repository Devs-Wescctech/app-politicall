import { describe, expect, it } from "vitest";
import { calculateGoalProgress } from "./progress";

describe("calculateGoalProgress", () => {
  it("returns progress percentage capped at 100", () => {
    expect(calculateGoalProgress(25, 100)).toBe(25);
    expect(calculateGoalProgress(150, 100)).toBe(100);
  });

  it("guards invalid goals and values", () => {
    expect(calculateGoalProgress(10, 0)).toBe(0);
    expect(calculateGoalProgress(Number.NaN, 100)).toBe(0);
  });

  it("does not return negative progress", () => {
    expect(calculateGoalProgress(-10, 100)).toBe(0);
  });
});

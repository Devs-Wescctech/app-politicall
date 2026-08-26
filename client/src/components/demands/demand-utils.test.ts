import { describe, expect, it } from "vitest";
import { getDemandSlaState, matchesDemandSearch } from "./demand-utils";

describe("demand UI helpers", () => {
  it("marks only active expired demands as overdue", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    expect(getDemandSlaState({ status: "open", slaDueAt: "2026-08-11T11:00:00.000Z" }, now)).toBe("overdue");
    expect(getDemandSlaState({ status: "completed", slaDueAt: "2026-08-11T11:00:00.000Z" }, now)).toBe("completed");
  });

  it("searches protocol, title and contact without accents", () => {
    const demand = { protocol: "DEM-2026-000001", title: "Iluminacao publica", contact: { name: "Joao Ávila" } };
    expect(matchesDemandSearch(demand, "joao avila")).toBe(true);
    expect(matchesDemandSearch(demand, "000001")).toBe(true);
    expect(matchesDemandSearch(demand, "saude")).toBe(false);
  });
});

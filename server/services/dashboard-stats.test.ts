import { describe, expect, it } from "vitest";
import { buildDashboardStats } from "./dashboard-stats";

describe("buildDashboardStats", () => {
  it("builds totals, distributions and upcoming counts", () => {
    const stats = buildDashboardStats(
      [
        { name: "Ana", age: 30, gender: "Feminino" },
        { name: "Joao", age: 40, gender: "Masculino" },
        { name: "Maria", age: 50, gender: "Feminino" },
        { name: "Sem idade", age: 0 },
      ],
      [{ partyId: "p1" }, { partyId: "p1" }, { partyId: "p2" }, { partyId: "missing" }],
      [{ status: "pending" }, { status: "completed" }, { status: "pending" }],
      [{ startDate: "2026-07-23T12:00:00.000Z" }, { startDate: "2026-07-21T12:00:00.000Z" }],
      [
        { id: "p1", ideology: "Centro" },
        { id: "p2", ideology: "Direita" },
      ],
      new Date("2026-07-22T12:00:00.000Z"),
    );

    expect(stats.totalContacts).toBe(4);
    expect(stats.totalAlliances).toBe(4);
    expect(stats.pendingDemands).toBe(2);
    expect(stats.upcomingEvents).toBe(1);
    expect(stats.averageAge).toBe(40);
    expect(stats.ageSampleSize).toBe(3);
    expect(stats.ideologyDistribution).toEqual([
      { ideology: "Centro", count: 2 },
      { ideology: "Direita", count: 1 },
    ]);
    expect(stats.genderDistribution.counts.Feminino).toBe(2);
  });

  it("does not calculate average age with fewer than three valid ages", () => {
    const stats = buildDashboardStats(
      [{ name: "Ana", age: 30 }, { name: "Joao", age: 121 }, { name: "Maria", age: 40 }],
      [],
      [],
      [],
      [],
    );

    expect(stats.averageAge).toBeUndefined();
    expect(stats.ageSampleSize).toBe(2);
  });
});

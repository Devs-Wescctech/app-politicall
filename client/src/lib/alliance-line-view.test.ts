import { describe, expect, it } from "vitest";
import type { AllianceLine } from "@shared/schema";
import {
  ALLIANCE_LINE_FILTER_ALL,
  ALLIANCE_LINE_FILTER_UNASSIGNED,
  buildAllianceEmailCampaign,
  filterAlliancesByLine,
  getAllianceLineLabel,
  getPredominantAllianceLine,
} from "./alliance-line-view";

const line = (overrides: Partial<AllianceLine> & Pick<AllianceLine, "id" | "name">): AllianceLine => ({
  id: overrides.id,
  accountId: "account-1",
  createdByUserId: "user-1",
  name: overrides.name,
  description: null,
  color: "#2563EB",
  icon: "Flag",
  displayOrder: 0,
  active: true,
  createdAt: new Date("2026-08-12T00:00:00Z"),
  updatedAt: new Date("2026-08-12T00:00:00Z"),
  ...overrides,
});

const movement = line({ id: "line-movement", name: "Movimento", displayOrder: 2 });
const mandate = line({ id: "line-mandate", name: "Mandato", displayOrder: 1 });
const alliances = [
  { id: "alliance-1", lineId: movement.id, line: movement },
  { id: "alliance-2", lineId: movement.id, line: movement },
  { id: "alliance-3", lineId: mandate.id, line: mandate },
  { id: "alliance-4", lineId: null, line: null },
];

describe("alliance line view helpers", () => {
  it("filters all, unassigned, and a specific political line", () => {
    expect(filterAlliancesByLine(alliances, ALLIANCE_LINE_FILTER_ALL)).toHaveLength(4);
    expect(filterAlliancesByLine(alliances, ALLIANCE_LINE_FILTER_UNASSIGNED).map(item => item.id)).toEqual(["alliance-4"]);
    expect(filterAlliancesByLine(alliances, movement.id).map(item => item.id)).toEqual(["alliance-1", "alliance-2"]);
  });

  it("uses the political line name in exports and preserves legacy records", () => {
    expect(getAllianceLineLabel(alliances[0])).toBe("Movimento");
    expect(getAllianceLineLabel(alliances[3])).toBe("Sem linha");
  });

  it("returns the predominant line and uses display order to break ties", () => {
    expect(getPredominantAllianceLine(alliances)).toMatchObject({ name: "Movimento", count: 2, line: movement });

    const tie = [alliances[0], alliances[2]];
    expect(getPredominantAllianceLine(tie)).toMatchObject({ name: "Mandato", count: 1, line: mandate });
    expect(getPredominantAllianceLine([])).toBeNull();
  });

  it("rebuilds email blocks and the session identifier for the selected line", () => {
    const emailAlliances = [
      { ...alliances[0], state: "RS", city: "Porto Alegre", email: "movimento@teste.local" },
      { ...alliances[2], state: "RS", city: "Porto Alegre", email: "mandato@teste.local" },
      { ...alliances[3], state: "RS", city: "Canoas", email: "sem-linha@teste.local" },
    ];

    const movementCampaign = buildAllianceEmailCampaign(emailAlliances, {
      cityFilter: "",
      emailBlockSize: 30,
      lineFilter: movement.id,
      stateFilter: "RS",
    });
    const mandateCampaign = buildAllianceEmailCampaign(emailAlliances, {
      cityFilter: "",
      emailBlockSize: 30,
      lineFilter: mandate.id,
      stateFilter: "RS",
    });

    expect(movementCampaign.blocks).toEqual([{ emails: ["movimento@teste.local"], startIndex: 1, endIndex: 1 }]);
    expect(mandateCampaign.blocks).toEqual([{ emails: ["mandato@teste.local"], startIndex: 1, endIndex: 1 }]);
    expect(movementCampaign.sessionId).not.toBe(mandateCampaign.sessionId);
  });
});

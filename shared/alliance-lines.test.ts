import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLIANCE_LINE_ICONS,
  allianceLineTextColor,
  insertAllianceLineSchema,
  reorderAllianceLinesSchema,
  updateAllianceLineSchema,
} from "./alliance-lines";

const validLine = {
  name: "  Frente Popular  ",
  description: "  Aliados para pautas locais.  ",
  color: "#14B8A6",
  icon: "Handshake",
  displayOrder: 0,
  active: true,
};

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("alliance line contracts", () => {
  it("normalizes a valid line and applies defaults", () => {
    expect(insertAllianceLineSchema.parse(validLine)).toEqual({
      name: "Frente Popular",
      description: "Aliados para pautas locais.",
      color: "#14B8A6",
      icon: "Handshake",
      displayOrder: 0,
      active: true,
    });

    expect(insertAllianceLineSchema.parse({
      name: "Centro",
      color: "#14B8A6",
      icon: "Landmark",
    })).toMatchObject({ displayOrder: 0, active: true });
  });

  it("rejects malformed colors, unsafe icons, and invalid text limits", () => {
    expect(() => insertAllianceLineSchema.parse({ ...validLine, color: "#ABC" })).toThrow();
    expect(() => insertAllianceLineSchema.parse({ ...validLine, color: "rgb(20, 184, 166)" })).toThrow();
    expect(() => insertAllianceLineSchema.parse({ ...validLine, icon: "<script>" })).toThrow();
    expect(() => insertAllianceLineSchema.parse({ ...validLine, name: " A " })).toThrow();
    expect(() => insertAllianceLineSchema.parse({ ...validLine, description: "x".repeat(501) })).toThrow();
    expect(ALLIANCE_LINE_ICONS).toContain("Handshake");
  });

  it("accepts only non-negative integer display orders", () => {
    expect(() => insertAllianceLineSchema.parse({ ...validLine, displayOrder: -1 })).toThrow();
    expect(() => insertAllianceLineSchema.parse({ ...validLine, displayOrder: 1.5 })).toThrow();
    expect(insertAllianceLineSchema.parse({ ...validLine, displayOrder: 3 }).displayOrder).toBe(3);
  });

  it("requires a non-empty valid partial update", () => {
    expect(updateAllianceLineSchema.parse({ name: "  Nova Frente  " })).toEqual({ name: "Nova Frente" });
    expect(updateAllianceLineSchema.parse({ description: null })).toEqual({ description: null });
    expect(() => updateAllianceLineSchema.parse({})).toThrow();
    expect(() => updateAllianceLineSchema.parse({ icon: "NotALucideIcon" })).toThrow();
  });

  it("requires unique UUIDs when reordering lines", () => {
    const first = "7c5e8d85-e603-4fa2-85e3-970b82c62e58";
    const second = "2d97f29f-302c-42af-8ce4-6cd1f2ff0d4d";

    expect(reorderAllianceLinesSchema.parse({ ids: [first, second] })).toEqual({ ids: [first, second] });
    expect(() => reorderAllianceLinesSchema.parse({ ids: [] })).toThrow();
    expect(() => reorderAllianceLinesSchema.parse({ ids: [first, first] })).toThrow();
    expect(() => reorderAllianceLinesSchema.parse({ ids: ["not-a-uuid"] })).toThrow();
  });

  it("chooses the black or white text color with the greatest WCAG contrast", () => {
    expect(allianceLineTextColor("#FFFFFF")).toBe("#000000");
    expect(allianceLineTextColor("#000000")).toBe("#FFFFFF");
    expect(allianceLineTextColor("#14B8A6")).toBe("#000000");

    for (const color of ["#FF0000", "#00AA00"]) {
      const textColor = allianceLineTextColor(color);
      expect(textColor).toBe("#000000");
      expect(contrastRatio(color, textColor)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
describe("custom alliance lines migration", () => {
  it("creates constrained lines and preserves legacy ideology assignments idempotently", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0018_custom_alliance_lines.sql"), "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS alliance_lines");
    expect(migration).toContain("account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE");
    expect(migration).toContain("created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT");
    expect(migration).toContain("CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 60)");
    expect(migration).toContain("CHECK (color ~ '^#[0-9A-Fa-f]{6}$')");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS alliance_lines_account_name_uidx");
    expect(migration).toContain("UNIQUE (id, account_id)");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS line_id uuid");
    expect(migration).toContain("FOREIGN KEY (line_id, account_id) REFERENCES alliance_lines(id, account_id) ON DELETE RESTRICT");
    expect(migration).toContain("ON CONFLICT (account_id, lower(name)) DO NOTHING");
    expect(migration).toContain("AND pa.line_id IS NULL");
    expect(migration).toContain("#ef4444");
    expect(migration).toContain("#6366f1");
  });
});

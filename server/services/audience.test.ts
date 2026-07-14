import { describe, it, expect } from "vitest";
import {
  normalizeText,
  matchContact,
  applyAudienceFilters,
  buildAudiencePreview,
  resolveRecipients,
  hasReachablePhone,
  hasReachableEmail,
  type AudienceContact,
  type AttendanceSummary,
} from "./audience";

const contacts: AudienceContact[] = [
  { id: "1", name: "Joao", phone: "11999999991", email: "joao@x.com", age: 30, gender: "masculino", state: "SP", city: "São Paulo", neighborhood: "Centro", interests: ["apoiador", "saúde"], source: "Importação" },
  { id: "2", name: "Maria", phone: "11999999992", email: "maria@x.com", age: 45, gender: "feminino", state: "SP", city: "Campinas", neighborhood: "Centro", interests: ["educação"], source: "Manual" },
  { id: "3", name: "Ana", phone: "21999999993", email: "", age: 22, gender: "feminino", state: "RJ", city: "Rio de Janeiro", neighborhood: "Copacabana", interests: ["saude"], source: "Evento" },
  { id: "4", name: "Zé", phone: "abc", email: "invalid", age: null, gender: "", state: "", city: "", neighborhood: "", interests: [], source: "" },
];

describe("normalizeText", () => {
  it("lowercases, trims and strips accents", () => {
    expect(normalizeText(" São Paulo ")).toBe("sao paulo");
    expect(normalizeText("SAÚDE")).toBe("saude");
    expect(normalizeText(null)).toBe("");
  });
});

describe("matchContact demographic filters", () => {
  it("matches by city (accent/case-insensitive)", () => {
    expect(matchContact(contacts[0], { cities: ["sao paulo"] })).toBe(true);
    expect(matchContact(contacts[1], { cities: ["sao paulo"] })).toBe(false);
  });

  it("matches by state and gender", () => {
    expect(matchContact(contacts[2], { states: ["RJ"], genders: ["feminino"] })).toBe(true);
    expect(matchContact(contacts[0], { states: ["RJ"] })).toBe(false);
  });

  it("matches by neighborhood", () => {
    const r = applyAudienceFilters(contacts, { neighborhoods: ["centro"] });
    expect(r.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("matches interests/tags with accent tolerance (match any)", () => {
    const r = applyAudienceFilters(contacts, { tags: ["saúde"] });
    expect(r.map((c) => c.id).sort()).toEqual(["1", "3"]);
  });

  it("filters by age range", () => {
    const r = applyAudienceFilters(contacts, { ageMin: 25, ageMax: 40 });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });

  it("filters imported-only by source", () => {
    const r = applyAudienceFilters(contacts, { importedOnly: true });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });

  it("combines filters with AND", () => {
    const r = applyAudienceFilters(contacts, { states: ["SP"], genders: ["feminino"] });
    expect(r.map((c) => c.id)).toEqual(["2"]);
  });

  it("empty filters match everyone", () => {
    expect(applyAudienceFilters(contacts, {})).toHaveLength(4);
  });
});

describe("matchContact previous campaign", () => {
  it("matches contacts whose phone/email is in the previous recipient set", () => {
    const prev = new Set<string>(["11999999991"]);
    const r = applyAudienceFilters(contacts, { previousCampaignId: "camp-1" }, { previousRecipientKeys: prev });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });
});

describe("matchContact attendance filters", () => {
  const attendanceByPhone = new Map<string, AttendanceSummary>([
    ["11999999991", { channel: "whatsapp", status: "closed", lastMessageAt: "2026-06-01T10:00:00Z", responded: true }],
    ["21999999993", { channel: "instagram", status: "open", lastMessageAt: "2026-01-01T10:00:00Z", responded: false }],
  ]);

  it("filters by origin channel", () => {
    const r = applyAudienceFilters(contacts, { originChannels: ["whatsapp"] }, { attendanceByPhone });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });

  it("filters by responded flag", () => {
    const r = applyAudienceFilters(contacts, { responded: false }, { attendanceByPhone });
    expect(r.map((c) => c.id)).toEqual(["3"]);
  });

  it("filters by last attendance date range", () => {
    const r = applyAudienceFilters(contacts, { lastAttendanceAfter: "2026-05-01T00:00:00Z" }, { attendanceByPhone });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });

  it("excludes contacts without attendance when attendance filter set", () => {
    const r = applyAudienceFilters(contacts, { attendanceStatuses: ["closed"] }, { attendanceByPhone });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });
});

describe("reachability + preview", () => {
  it("detects reachable phone/email", () => {
    expect(hasReachablePhone(contacts[0])).toBe(true);
    expect(hasReachablePhone(contacts[3])).toBe(false);
    expect(hasReachableEmail(contacts[0])).toBe(true);
    expect(hasReachableEmail(contacts[2])).toBe(false);
  });

  it("builds a preview with totals and sample", () => {
    const preview = buildAudiencePreview(contacts, { states: ["SP"] });
    expect(preview.total).toBe(2);
    expect(preview.withPhone).toBe(2);
    expect(preview.withEmail).toBe(2);
    expect(preview.sample).toHaveLength(2);
    expect(preview.sample[0].name).toBe("Joao");
  });
});

describe("resolveRecipients", () => {
  it("resolves phones for whatsapp/sms and dedupes", () => {
    const dup = [...contacts, { id: "5", name: "dupe", phone: "+55 11 99999-9991" } as AudienceContact];
    const r = resolveRecipients(dup, "whatsapp");
    expect(r).toEqual(["11999999991", "11999999992", "21999999993"]);
  });

  it("resolves emails for email channel", () => {
    const r = resolveRecipients(contacts, "email");
    expect(r).toEqual(["joao@x.com", "maria@x.com"]);
  });
});

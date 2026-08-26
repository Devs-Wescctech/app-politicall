import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
import { isDemandDestinationDuplicateError, normalizeDemandDestinationInput } from "./demand-destinations";

describe("demand destinations", () => {
  it("normalizes names and optional contact fields", () => {
    expect(normalizeDemandDestinationInput({
      kind: "external",
      name: "  Secretaria de Obras  ",
      description: "  Atendimento urbano  ",
      contactName: "  Maria  ",
      phone: "   ",
      email: " OBRAS@EXAMPLE.TEST ",
      responseDeadlineHours: 48,
      active: true,
    })).toEqual({
      kind: "external",
      name: "Secretaria de Obras",
      description: "Atendimento urbano",
      contactName: "Maria",
      phone: null,
      email: "obras@example.test",
      responseDeadlineHours: 48,
      active: true,
    });
  });

  it("recognizes only the destination name unique constraint", () => {
    expect(isDemandDestinationDuplicateError({ code: "23505", constraint: "demand_destinations_name_uidx" })).toBe(true);
    expect(isDemandDestinationDuplicateError({ code: "23505", constraint: "users_email_unique" })).toBe(false);
    expect(isDemandDestinationDuplicateError(new Error("duplicate"))).toBe(false);
  });
});

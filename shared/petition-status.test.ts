import { describe, expect, it } from "vitest";
import { isPetitionPublicStatus } from "./petition-status";

describe("isPetitionPublicStatus", () => {
  it("keeps drafts private", () => {
    expect(isPetitionPublicStatus("rascunho")).toBe(false);
  });

  it.each(["publicada", "pausada", "concluida"])("exposes %s petitions", (status) => {
    expect(isPetitionPublicStatus(status)).toBe(true);
  });

  it("rejects missing and unknown statuses", () => {
    expect(isPetitionPublicStatus(null)).toBe(false);
    expect(isPetitionPublicStatus("arquivada")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { makeUniqueSlug } from "./slugs";

describe("makeUniqueSlug", () => {
  it("returns the trimmed base slug when it is available", async () => {
    await expect(makeUniqueSlug(" minha-peticao ", async () => undefined)).resolves.toBe("minha-peticao");
  });

  it("falls back to item when the base is empty", async () => {
    await expect(makeUniqueSlug(" ", async () => undefined)).resolves.toBe("item");
  });

  it("appends an incrementing suffix while the slug is already in use", async () => {
    const existing = new Map([
      ["teste", { id: "1" }],
      ["teste-2", { id: "2" }],
    ]);

    await expect(makeUniqueSlug("teste", async (slug) => existing.get(slug))).resolves.toBe("teste-3");
  });

  it("allows the current record to keep its own slug", async () => {
    await expect(makeUniqueSlug("teste", async () => ({ id: "current" }), "current")).resolves.toBe("teste");
  });
});

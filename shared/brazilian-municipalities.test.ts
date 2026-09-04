import { describe, expect, it } from "vitest";
import {
  BRAZILIAN_MUNICIPALITIES,
  findBrazilianMunicipality,
  searchBrazilianMunicipalities,
} from "./brazilian-municipalities";

describe("Brazilian municipality lookup", () => {
  it("bundles the complete municipality dataset with valid UFs", () => {
    expect(BRAZILIAN_MUNICIPALITIES.length).toBeGreaterThan(5_500);
    expect(BRAZILIAN_MUNICIPALITIES.every(({ name, uf }) => name.length > 0 && /^[A-Z]{2}$/.test(uf))).toBe(true);
  });

  it("searches without case or accent sensitivity", () => {
    expect(searchBrazilianMunicipalities("sao jose", 20)).toContainEqual({ name: "São José", uf: "SC" });
    expect(searchBrazilianMunicipalities("FLORIANOP", 8)).toContainEqual({ name: "Florianópolis", uf: "SC" });
  });

  it("prioritizes prefixes and respects the result limit", () => {
    const results = searchBrazilianMunicipalities("campo", 5);
    expect(results).toHaveLength(5);
    expect(results.every(({ name }) => name.toLocaleLowerCase("pt-BR").startsWith("campo"))).toBe(true);
  });

  it("finds an exact municipality with optional UF disambiguation", () => {
    expect(findBrazilianMunicipality("Florianopolis", "sc")).toEqual({ name: "Florianópolis", uf: "SC" });
    expect(findBrazilianMunicipality("São José", "SC")).toEqual({ name: "São José", uf: "SC" });
    expect(findBrazilianMunicipality("Cidade inexistente", "SC")).toBeNull();
  });
});

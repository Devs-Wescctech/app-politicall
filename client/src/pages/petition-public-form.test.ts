import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petition-public.tsx", import.meta.url), "utf8");

describe("public petition contact form", () => {
  it("formats and validates Brazilian phones before submission", () => {
    expect(source).toContain("formatBrazilianPhone");
    expect(source).toContain("isValidBrazilianPhone");
    expect(source).toContain("normalizeBrazilianPhone");
    expect(source).toContain('data-testid="text-phone-error"');
    expect(source).toContain('payload.phone = normalizeBrazilianPhone(form.phone)');
  });

  it("selects a canonical municipality and submits its inferred UF", () => {
    expect(source).toContain("BrazilianCityAutocomplete");
    expect(source).toContain('city: location.city, state: location.state');
    expect(source).toContain('data-testid="text-city-error"');
    expect(source).toContain("if (form.state) payload.state = form.state");
  });
});

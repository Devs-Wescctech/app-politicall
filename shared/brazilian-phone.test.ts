import { describe, expect, it } from "vitest";
import {
  formatBrazilianPhone,
  isValidBrazilianPhone,
  normalizeBrazilianPhone,
} from "./brazilian-phone";

describe("Brazilian phone utilities", () => {
  it("normalizes national and country-code numbers", () => {
    expect(normalizeBrazilianPhone("+55 (51) 99876-5432")).toBe("51998765432");
    expect(normalizeBrazilianPhone("(11) 3333-4444")).toBe("1133334444");
    expect(normalizeBrazilianPhone("551133334444")).toBe("1133334444");
  });

  it("formats useful partial input and complete fixed or mobile numbers", () => {
    expect(formatBrazilianPhone("5")).toBe("(5");
    expect(formatBrazilianPhone("51")).toBe("(51)");
    expect(formatBrazilianPhone("5199999")).toBe("(51) 99999");
    expect(formatBrazilianPhone("51999999999")).toBe("(51) 99999-9999");
    expect(formatBrazilianPhone("1133334444")).toBe("(11) 3333-4444");
  });

  it("accepts structurally valid Brazilian fixed and mobile numbers", () => {
    expect(isValidBrazilianPhone("(11) 3333-4444")).toBe(true);
    expect(isValidBrazilianPhone("+55 (51) 99876-5432")).toBe(true);
  });

  it("rejects invalid DDDs, repeated subscribers, and invalid prefixes", () => {
    expect(isValidBrazilianPhone("(00) 99999-9999")).toBe(false);
    expect(isValidBrazilianPhone("(51) 11111-1111")).toBe(false);
    expect(isValidBrazilianPhone("(51) 1333-4444")).toBe(false);
    expect(isValidBrazilianPhone("(51) 89999-9999")).toBe(false);
    expect(isValidBrazilianPhone("123")).toBe(false);
  });
});

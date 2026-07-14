import { describe, it, expect } from "vitest";
import {
  cleanPhoneInput,
  normalizeBrazilPhone,
  hasCountryCode,
  normalizePhoneList,
} from "./phone";

describe("cleanPhoneInput", () => {
  it("keeps only a leading + and digits", () => {
    expect(cleanPhoneInput("+55 (11) 98888-7777")).toBe("+5511988887777");
    expect(cleanPhoneInput("(11) 3333-4444")).toBe("1133334444");
  });
  it("drops a + that is not leading", () => {
    expect(cleanPhoneInput("11+9999")).toBe("119999");
  });
  it("handles empty/nullish", () => {
    expect(cleanPhoneInput("")).toBe("");
    expect(cleanPhoneInput(null)).toBe("");
    expect(cleanPhoneInput(undefined)).toBe("");
    expect(cleanPhoneInput("abc")).toBe("");
  });
});

describe("normalizeBrazilPhone", () => {
  it("adds +55 to local mobile (11 digits) and landline (10 digits)", () => {
    expect(normalizeBrazilPhone("11988887777")).toBe("+5511988887777");
    expect(normalizeBrazilPhone("1133334444")).toBe("+551133334444");
  });
  it("preserves an existing 55 country code", () => {
    expect(normalizeBrazilPhone("5511988887777")).toBe("+5511988887777");
    expect(normalizeBrazilPhone("+5511988887777")).toBe("+5511988887777");
  });
  it("strips separators before normalizing", () => {
    expect(normalizeBrazilPhone("(11) 98888-7777")).toBe("+5511988887777");
    expect(normalizeBrazilPhone("+55 11 98888 7777")).toBe("+5511988887777");
  });
  it("preserves other international numbers typed with +", () => {
    expect(normalizeBrazilPhone("+14155552671")).toBe("+14155552671");
    expect(normalizeBrazilPhone("+351912345678")).toBe("+351912345678");
  });
  it("returns empty when there are no digits", () => {
    expect(normalizeBrazilPhone("")).toBe("");
    expect(normalizeBrazilPhone(null)).toBe("");
    expect(normalizeBrazilPhone("abc")).toBe("");
  });
});

describe("hasCountryCode", () => {
  it("is true for + prefixed values and valid 55-prefixed lengths", () => {
    expect(hasCountryCode("+5511988887777")).toBe(true);
    expect(hasCountryCode("5511988887777")).toBe(true);
    expect(hasCountryCode("551133334444")).toBe(true);
  });
  it("is false for bare local numbers", () => {
    expect(hasCountryCode("11988887777")).toBe(false);
    expect(hasCountryCode("1133334444")).toBe(false);
  });
  it("handles empty/nullish", () => {
    expect(hasCountryCode("")).toBe(false);
    expect(hasCountryCode(null)).toBe(false);
    expect(hasCountryCode(undefined)).toBe(false);
  });
});

describe("normalizePhoneList", () => {
  it("splits on newline, comma and semicolon and normalizes each", () => {
    expect(normalizePhoneList("11988887777\n1133334444,21999998888;+14155552671")).toEqual([
      "+5511988887777",
      "+551133334444",
      "+5521999998888",
      "+14155552671",
    ]);
  });
  it("de-duplicates while preserving order", () => {
    expect(normalizePhoneList("11988887777\n5511988887777\n+5511988887777")).toEqual([
      "+5511988887777",
    ]);
  });
  it("drops blanks and unusable entries", () => {
    expect(normalizePhoneList("11988887777,,  ,abc")).toEqual(["+5511988887777"]);
  });
  it("handles empty/nullish", () => {
    expect(normalizePhoneList("")).toEqual([]);
    expect(normalizePhoneList(null)).toEqual([]);
    expect(normalizePhoneList(undefined)).toEqual([]);
  });
});

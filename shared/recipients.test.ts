import { describe, it, expect } from "vitest";
import {
  looksLikeEmail,
  looksLikePhone,
  parseRecipientLine,
  parseRecipients,
  countRecipients,
  recipientsToPayload,
  normalizeRecipientsText,
  toRecipientRecords,
  toRecipientStrings,
} from "./recipients";

describe("looksLikeEmail / looksLikePhone", () => {
  it("detects emails", () => {
    expect(looksLikeEmail("maria@exemplo.com")).toBe(true);
    expect(looksLikeEmail("maria")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
  it("detects phones and rejects names", () => {
    expect(looksLikePhone("11999998888")).toBe(true);
    expect(looksLikePhone("+55 11 99999-8888")).toBe(true);
    expect(looksLikePhone("Maria")).toBe(false);
    expect(looksLikePhone("123")).toBe(false); // too few digits
    expect(looksLikePhone("maria@exemplo.com")).toBe(false);
  });
});

describe("parseRecipientLine", () => {
  it("parses telefone;nome", () => {
    expect(parseRecipientLine("11999998888;Maria", "whatsapp")).toEqual({
      recipient: "+5511999998888",
      name: "Maria",
      raw: "11999998888;Maria",
    });
  });
  it("parses nome;telefone (any order)", () => {
    expect(parseRecipientLine("Maria;11999998888", "whatsapp")).toEqual({
      recipient: "+5511999998888",
      name: "Maria",
      raw: "Maria;11999998888",
    });
  });
  it("returns empty recipient for name-only line", () => {
    const r = parseRecipientLine("Maria", "whatsapp");
    expect(r?.recipient).toBe("");
    expect(r?.name).toBe("Maria");
  });
  it("returns null for blank line", () => {
    expect(parseRecipientLine("   ", "whatsapp")).toBeNull();
  });
});

describe("parseRecipients", () => {
  it("splits by newline and keeps names, one per line", () => {
    const text = "11999998888;Maria\nJoão;11988887777";
    const { entries, invalidLines } = parseRecipients(text, "whatsapp");
    expect(entries).toEqual([
      { recipient: "+5511999998888", name: "Maria", raw: "11999998888;Maria" },
      { recipient: "+5511988887777", name: "João", raw: "João;11988887777" },
    ]);
    expect(invalidLines).toEqual([]);
  });
  it("expands legacy multi-number lines with no name", () => {
    const { entries } = parseRecipients("11999998888,11988887777", "sms");
    expect(entries.map((e) => e.recipient)).toEqual(["+5511999998888", "+5511988887777"]);
    expect(entries.every((e) => e.name === undefined)).toBe(true);
  });
  it("dedups by resolved recipient", () => {
    const { entries } = parseRecipients("11999998888;Maria\n+5511999998888;Maria2", "whatsapp");
    expect(entries).toHaveLength(1);
  });
  it("collects invalid (name-only) lines", () => {
    const { entries, invalidLines } = parseRecipients("Maria\n11999998888;João", "whatsapp");
    expect(entries).toHaveLength(1);
    expect(invalidLines).toEqual(["Maria"]);
  });
  it("handles emails for the email channel", () => {
    const { entries } = parseRecipients("Maria;maria@exemplo.com\njoao@exemplo.com", "email");
    expect(entries[0]).toEqual({ recipient: "maria@exemplo.com", name: "Maria", raw: "Maria;maria@exemplo.com" });
    expect(entries[1].recipient).toBe("joao@exemplo.com");
  });
});

describe("countRecipients / recipientsToPayload", () => {
  it("counts usable recipients only", () => {
    expect(countRecipients("11999998888;Maria\nMaria sozinha\n", "whatsapp")).toBe(1);
  });
  it("builds payload objects with optional name", () => {
    expect(recipientsToPayload("11999998888;Maria\n11988887777", "whatsapp")).toEqual([
      { recipient: "+5511999998888", name: "Maria" },
      { recipient: "+5511988887777" },
    ]);
  });
});

describe("normalizeRecipientsText (+55)", () => {
  it("adds +55 while preserving names", () => {
    expect(normalizeRecipientsText("11999998888;Maria", "whatsapp")).toBe("+5511999998888;Maria");
  });
  it("leaves name-only lines untouched (does NOT turn names into recipients)", () => {
    const out = normalizeRecipientsText("Maria\n11999998888", "whatsapp");
    expect(out).toBe("Maria\n+5511999998888");
  });
  it("dedups", () => {
    expect(normalizeRecipientsText("11999998888\n+5511999998888", "whatsapp")).toBe("+5511999998888");
  });
});

describe("toRecipientRecords / toRecipientStrings", () => {
  it("accepts legacy bare strings", () => {
    expect(toRecipientRecords(["11999998888", "11988887777"], "whatsapp")).toEqual([
      { recipient: "+5511999998888" },
      { recipient: "+5511988887777" },
    ]);
  });
  it("accepts {recipient,name} objects and normalizes phones", () => {
    expect(toRecipientRecords([{ recipient: "11999998888", name: "Maria" }], "whatsapp")).toEqual([
      { recipient: "+5511999998888", name: "Maria" },
    ]);
  });
  it("accepts legacy phone;name encoded strings", () => {
    expect(toRecipientRecords(["11999998888;Maria"], "whatsapp")).toEqual([
      { recipient: "+5511999998888", name: "Maria" },
    ]);
  });
  it("returns [] for non-array input", () => {
    expect(toRecipientRecords(null, "whatsapp")).toEqual([]);
    expect(toRecipientRecords(undefined, "sms")).toEqual([]);
  });
  it("toRecipientStrings returns just the recipients", () => {
    expect(toRecipientStrings([{ recipient: "11999998888", name: "Maria" }, "11988887777"], "whatsapp")).toEqual([
      "+5511999998888",
      "+5511988887777",
    ]);
  });
});

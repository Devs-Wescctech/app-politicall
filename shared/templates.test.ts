import { describe, it, expect } from "vitest";
import {
  TEMPLATE_VARIABLES,
  extractVariables,
  unknownVariables,
  renderTemplate,
  isBlankMessage,
  smsSegments,
  isWaTemplateUsable,
  waTemplateBlockReason,
  waTemplateBodyVariables,
  contactTemplateContext,
} from "./templates";

describe("extractVariables", () => {
  it("returns distinct variables in order", () => {
    expect(extractVariables("Olá {nome}, protocolo {protocolo}. Bem-vindo {nome}!")).toEqual([
      "nome",
      "protocolo",
    ]);
  });
  it("is case-insensitive and trims spaces", () => {
    expect(extractVariables("{ Nome } e { CIDADE }")).toEqual(["nome", "cidade"]);
  });
  it("handles empty/nullish", () => {
    expect(extractVariables("")).toEqual([]);
    expect(extractVariables(null)).toEqual([]);
    expect(extractVariables(undefined)).toEqual([]);
  });
});

describe("unknownVariables", () => {
  it("flags variables not in supported list", () => {
    expect(unknownVariables("{nome} {foo} {bar}")).toEqual(["foo", "bar"]);
  });
  it("returns empty when all supported", () => {
    const t = TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(" ");
    expect(unknownVariables(t)).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("replaces known variables", () => {
    const out = renderTemplate("Olá {nome} de {cidade}", { nome: "Ana", cidade: "Recife" });
    expect(out).toBe("Olá Ana de Recife");
  });
  it("is case-insensitive on keys and tokens", () => {
    expect(renderTemplate("{Nome}", { nome: "Ana" })).toBe("Ana");
    expect(renderTemplate("{nome}", { NOME: "Ana" })).toBe("Ana");
  });
  it("removes missing tokens by default", () => {
    expect(renderTemplate("Oi {nome}{protocolo}", { nome: "Ana" })).toBe("Oi Ana");
  });
  it("keeps missing tokens when keepMissing=true", () => {
    expect(renderTemplate("Oi {nome} {protocolo}", { nome: "Ana" }, { keepMissing: true })).toBe(
      "Oi Ana {protocolo}",
    );
  });
  it("treats null/undefined context values as blank", () => {
    expect(renderTemplate("[{cidade}]", { cidade: null })).toBe("[]");
  });
  it("coerces numbers", () => {
    expect(renderTemplate("n={protocolo}", { protocolo: 123 })).toBe("n=123");
  });
});

describe("isBlankMessage", () => {
  it("detects blanks", () => {
    expect(isBlankMessage("")).toBe(true);
    expect(isBlankMessage("   \n ")).toBe(true);
    expect(isBlankMessage(null)).toBe(true);
    expect(isBlankMessage("oi")).toBe(false);
  });
});

describe("smsSegments", () => {
  it("empty message has zero parts", () => {
    const s = smsSegments("");
    expect(s.parts).toBe(0);
    expect(s.length).toBe(0);
  });
  it("GSM single part up to 160", () => {
    const s = smsSegments("a".repeat(160));
    expect(s.encoding).toBe("GSM");
    expect(s.units).toBe(160);
    expect(s.parts).toBe(1);
  });
  it("GSM splits into concatenated 153-unit parts", () => {
    const s = smsSegments("a".repeat(161));
    expect(s.encoding).toBe("GSM");
    expect(s.parts).toBe(2);
  });
  it("GSM extension chars cost 2 units", () => {
    const s = smsSegments("€"); // extension char
    expect(s.encoding).toBe("GSM");
    expect(s.units).toBe(2);
    expect(s.parts).toBe(1);
  });
  it("switches to UCS2 on unicode and uses 70/67", () => {
    const s = smsSegments("emoji 🚀 aqui");
    expect(s.encoding).toBe("UCS2");
    expect(s.perSingle).toBe(70);
    expect(s.perConcat).toBe(67);
  });
  it("UCS2 multipart over 70", () => {
    const s = smsSegments("😀".repeat(71));
    expect(s.encoding).toBe("UCS2");
    expect(s.parts).toBeGreaterThanOrEqual(3);
  });
});

describe("WhatsApp official template usability", () => {
  it("only APPROVED is usable", () => {
    expect(isWaTemplateUsable("APPROVED")).toBe(true);
    expect(isWaTemplateUsable("approved")).toBe(true);
    expect(isWaTemplateUsable("REJECTED")).toBe(false);
    expect(isWaTemplateUsable("PAUSED")).toBe(false);
    expect(isWaTemplateUsable("PENDING")).toBe(false);
    expect(isWaTemplateUsable(undefined)).toBe(false);
  });
  it("gives block reasons", () => {
    expect(waTemplateBlockReason("APPROVED")).toBeNull();
    expect(waTemplateBlockReason("REJECTED")).toMatch(/rejeitado/i);
    expect(waTemplateBlockReason("PAUSED")).toMatch(/pausado/i);
    expect(waTemplateBlockReason("PENDING")).toMatch(/pendente/i);
  });
});

describe("waTemplateBodyVariables", () => {
  it("extracts positional body variables", () => {
    const tpl = {
      components: [
        { type: "HEADER", text: "Oi {{1}}" },
        { type: "BODY", text: "Olá {{1}}, seu código é {{2}} e {{3}}" },
      ],
    };
    expect(waTemplateBodyVariables(tpl)).toEqual([1, 2, 3]);
  });
  it("empty when no body", () => {
    expect(waTemplateBodyVariables({ components: [] })).toEqual([]);
    expect(waTemplateBodyVariables({})).toEqual([]);
  });
});

describe("contactTemplateContext", () => {
  it("maps contact fields to variables", () => {
    const ctx = contactTemplateContext(
      { name: "Ana", phone: "+5581999", city: "Recife" },
      { protocolo: "P-1", link: "http://x" },
    );
    expect(renderTemplate("{nome} {telefone} {cidade} {protocolo} {link}", ctx)).toBe(
      "Ana +5581999 Recife P-1 http://x",
    );
  });
  it("blanks missing fields", () => {
    const ctx = contactTemplateContext(null);
    expect(renderTemplate("[{nome}][{cidade}]", ctx)).toBe("[][]");
  });
});

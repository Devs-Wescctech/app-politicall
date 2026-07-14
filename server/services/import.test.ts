import { describe, it, expect } from "vitest";
import {
  detectDelimiter,
  parseDelimited,
  suggestMapping,
  normalizePhone,
  isValidPhone,
  isValidEmail,
  applyMapping,
  dedupeAndValidate,
  processImport,
  type ImportRow,
} from "./import";

describe("detectDelimiter", () => {
  it("detects semicolon, comma, tab and pipe", () => {
    expect(detectDelimiter("nome;telefone;email")).toBe(";");
    expect(detectDelimiter("nome,telefone,email")).toBe(",");
    expect(detectDelimiter("nome\ttelefone\temail")).toBe("\t");
    expect(detectDelimiter("nome|telefone|email")).toBe("|");
  });
});

describe("parseDelimited", () => {
  it("parses CSV with header into row objects", () => {
    const rows = parseDelimited("nome,telefone\nJoao,11999999999\nMaria,11888888888");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ nome: "Joao", telefone: "11999999999" });
    expect(rows[1].nome).toBe("Maria");
  });

  it("honors quoted values containing the delimiter", () => {
    const rows = parseDelimited('nome,cidade\n"Silva, Joao",Sao Paulo');
    expect(rows[0].nome).toBe("Silva, Joao");
    expect(rows[0].cidade).toBe("Sao Paulo");
  });

  it("returns empty for blank input", () => {
    expect(parseDelimited("")).toEqual([]);
    expect(parseDelimited("   \n  ")).toEqual([]);
  });
});

describe("suggestMapping", () => {
  it("maps accented/aliased headers to canonical fields", () => {
    const mapping = suggestMapping(["Nome", "Telefone", "E-mail", "Cidade", "Bairro", "UF", "Idade", "Etiquetas"]);
    expect(mapping).toEqual({
      Nome: "name",
      Telefone: "phone",
      "E-mail": "email",
      Cidade: "city",
      Bairro: "neighborhood",
      UF: "state",
      Idade: "age",
      Etiquetas: "interests",
    });
  });

  it("ignores unknown headers", () => {
    expect(suggestMapping(["foo", "bar"])).toEqual({});
  });
});

describe("phone/email validation", () => {
  it("normalizes phones to digits only", () => {
    expect(normalizePhone("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("accepts 10-13 digit phones", () => {
    expect(isValidPhone("1199999999")).toBe(true); // 10
    expect(isValidPhone("5511999999999")).toBe(true); // 13
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("12345678901234")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("validates emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("applyMapping", () => {
  const rows: ImportRow[] = [
    { Nome: "Joao", Telefone: "11999999999", "E-mail": "joao@x.com", Idade: "35", Etiquetas: "apoiador, líder" },
  ];
  const mapping = suggestMapping(Object.keys(rows[0]));

  it("maps source headers to canonical fields", () => {
    const [c] = applyMapping(rows, mapping);
    expect(c.name).toBe("Joao");
    expect(c.phone).toBe("11999999999");
    expect(c.email).toBe("joao@x.com");
    expect(c.age).toBe(35);
    expect(c.interests).toEqual(["apoiador", "líder"]);
    expect(c.validPhone).toBe(true);
    expect(c.validEmail).toBe(true);
  });

  it("falls back to canonical field names present directly on rows", () => {
    const [c] = applyMapping([{ name: "Ana", phone: "11888888888" }], {});
    expect(c.name).toBe("Ana");
    expect(c.phone).toBe("11888888888");
  });

  it("leaves age null when missing/invalid", () => {
    const [c] = applyMapping([{ name: "Ana", phone: "11888888888" }], {});
    expect(c.age).toBeNull();
  });
});

describe("dedupeAndValidate", () => {
  const base = {
    name: "",
    email: "",
    city: "",
    neighborhood: "",
    state: "",
    gender: "",
    age: null as number | null,
    interests: [] as string[],
  };
  const make = (over: Partial<ReturnType<typeof mk>>) => mk(over);
  function mk(over: any) {
    const phone = over.phone ?? "";
    const email = over.email ?? "";
    return {
      ...base,
      ...over,
      phone,
      email,
      validPhone: isValidPhone(phone),
      validEmail: isValidEmail(email),
    };
  }

  it("separates invalids (no valid phone or email)", () => {
    const res = dedupeAndValidate([
      make({ name: "ok", phone: "11999999999" }),
      make({ name: "bad", phone: "123", email: "nope" }),
    ]);
    expect(res.stats.valid).toBe(1);
    expect(res.stats.invalid).toBe(1);
    expect(res.invalid[0].contact.name).toBe("bad");
    expect(res.invalid[0].reason).toContain("Sem telefone ou e-mail");
  });

  it("removes duplicates by normalized phone (keeps first)", () => {
    const res = dedupeAndValidate([
      make({ name: "first", phone: "11999999999" }),
      make({ name: "dup", phone: "+55 11 99999-9999" }),
    ]);
    expect(res.stats.valid).toBe(1);
    expect(res.stats.duplicates).toBe(1);
    expect(res.valid[0].name).toBe("first");
    expect(res.duplicates[0].name).toBe("dup");
  });

  it("dedupes by email when required channel is email", () => {
    const res = dedupeAndValidate(
      [
        make({ name: "a", email: "X@Mail.com", phone: "11999999999" }),
        make({ name: "b", email: "x@mail.com", phone: "11888888888" }),
      ],
      "email",
    );
    expect(res.stats.valid).toBe(1);
    expect(res.stats.duplicates).toBe(1);
  });

  it("treats phone-only contacts as invalid when email channel required", () => {
    const res = dedupeAndValidate([make({ name: "a", phone: "11999999999" })], "email");
    expect(res.stats.invalid).toBe(1);
    expect(res.invalid[0].reason).toBe("E-mail inválido");
  });
});

describe("processImport (rows + mapping end-to-end)", () => {
  it("parses, maps, validates and dedupes", () => {
    const rows = parseDelimited(
      "Nome,Telefone,Email\nJoao,11999999999,joao@x.com\nJoaoDup,11 99999-9999,\nBad,123,bad",
    );
    const mapping = suggestMapping(["Nome", "Telefone", "Email"]);
    const res = processImport(rows, mapping);
    expect(res.stats.total).toBe(3);
    expect(res.stats.valid).toBe(1);
    expect(res.stats.duplicates).toBe(1);
    expect(res.stats.invalid).toBe(1);
  });
});

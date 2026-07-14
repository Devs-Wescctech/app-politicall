import { describe, expect, it } from "vitest";
import { prepareAttendanceTemplateSend } from "./attendance-template-variables";

const selected = {
  id: "approved-template",
  name: "tratamento_chamado",
  preview: "Prezado(a) {{1}}, chamado {{2}} sobre {{3}}.",
  components: [{ type: "BODY", text: "Prezado(a) {{1}}, chamado {{2}} sobre {{3}}." }],
};

describe("prepareAttendanceTemplateSend", () => {
  it("rejects a dynamic template without supplied values", () => {
    expect(() => prepareAttendanceTemplateSend(selected, undefined, undefined)).toThrowError(expect.objectContaining({
      code: "TEMPLATE_VARIABLES_REQUIRED",
      missingVariables: ["body:0:1", "body:0:2", "body:0:3"],
    }));
  });

  it("accepts and normalizes complete Meta or WACLOUD text parameters", () => {
    expect(prepareAttendanceTemplateSend(selected, [{
      type: "body",
      parameters: [
        { type: "text", text: "Carlos" },
        { type: "text", text: "525547" },
        { type: "text", text: "Headset" },
      ],
    }], undefined)).toEqual({
      components: [{ type: "body", parameters: [
        { type: "text", text: "Carlos" },
        { type: "text", text: "525547" },
        { type: "text", text: "Headset" },
      ] }],
      preview: "Prezado(a) Carlos, chamado 525547 sobre Headset.",
      values: { "body:0:1": "Carlos", "body:0:2": "525547", "body:0:3": "Headset" },
    });
  });

  it("allows a static template without components", () => {
    expect(prepareAttendanceTemplateSend({ name: "boas_vindas", preview: "Olá!" }, undefined, undefined)).toEqual({
      components: [],
      preview: "Olá!",
      values: {},
    });
  });

  it("does not trust an unresolved supplied message as the history preview", () => {
    const prepared = prepareAttendanceTemplateSend(selected, [{
      type: "body",
      parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "10" }, { type: "text", text: "Rede" }],
    }], "Prezado(a) {{1}}");
    expect(prepared.preview).toBe("Prezado(a) Ana, chamado 10 sobre Rede.");
  });
});

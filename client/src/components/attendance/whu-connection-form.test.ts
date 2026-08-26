import { describe, expect, it } from "vitest";
import {
  buildWhuConnectionPayload,
  connectionErrorMessage,
  validateWhuConnectionForm,
} from "./whu-connection-form";

const valid = {
  name: "Gabinete",
  phoneNumber: "+55 51 99999-0000",
  token: "secret",
};

describe("WHU connection form", () => {
  it("requires name, phone and token when creating", () => {
    expect(validateWhuConnectionForm({ name: "", phoneNumber: "", token: "" }, false)).toEqual([
      "Informe o nome da conexão.",
      "Informe o número do WhatsApp.",
      "Informe o token WHU.",
    ]);
  });

  it("allows a blank token when editing an existing connection", () => {
    expect(validateWhuConnectionForm({ ...valid, token: "" }, true)).toEqual([]);
    expect(validateWhuConnectionForm({ ...valid, token: "••••••" }, true)).toEqual([]);
  });

  it("builds one independent WHU payload per number", () => {
    expect(buildWhuConnectionPayload(valid, false)).toEqual({
      name: "Gabinete",
      channel: "whatsapp",
      provider: "wescctech",
      phoneNumber: "5551999990000",
      token: "secret",
      baseUrl: "https://api.wescctech.com.br",
      metadata: {
        apiType: "whu",
        official: false,
        whatsappOfficial: false,
        phoneNumber: "5551999990000",
      },
    });
  });

  it("omits a blank token from edit payloads instead of clearing it", () => {
    expect(buildWhuConnectionPayload({ ...valid, token: "" }, true)).not.toHaveProperty("token");
    expect(buildWhuConnectionPayload({ ...valid, token: "***" }, true)).not.toHaveProperty("token");
    expect(buildWhuConnectionPayload({ ...valid, token: "••••••" }, true)).not.toHaveProperty("token");
  });

  it("rejects masked create tokens and phone values without digits", () => {
    expect(validateWhuConnectionForm({ ...valid, token: "********" }, false)).toContain("Informe o token WHU.");
    expect(validateWhuConnectionForm({ ...valid, phoneNumber: "+ ( )" }, false)).toContain("Informe o número do WhatsApp.");
  });

  it("normalizes the phone and sends only a real replacement token", () => {
    expect(buildWhuConnectionPayload(valid, false)).toMatchObject({
      phoneNumber: "5551999990000",
      token: "secret",
      metadata: { phoneNumber: "5551999990000" },
    });
    expect(buildWhuConnectionPayload({ ...valid, token: "rotated-secret" }, true)).toMatchObject({
      token: "rotated-secret",
    });
  });

  it("maps stable API errors to actionable messages", () => {
    expect(connectionErrorMessage({ code: "WHU_DUPLICATE_PHONE" })).toMatch(/número já está ativo/i);
    expect(connectionErrorMessage({ code: "WHU_DUPLICATE_TOKEN" })).toMatch(/token já está vinculado/i);
    expect(connectionErrorMessage({ code: "WHU_TOKEN_REQUIRED" })).toMatch(/informe o token/i);
    expect(connectionErrorMessage({ code: "CHANNEL_CONNECTION_IN_USE" })).toMatch(/campanhas ou atendimentos/i);
    expect(connectionErrorMessage(new Error("Provider timeout token=secret"))).toBe(
      "Não foi possível concluir a operação com esta conexão.",
    );
  });
});

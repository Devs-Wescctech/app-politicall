import { describe, expect, it } from "vitest";
import { assertOktorAccepted, OKTOR_INVALID_CREDENTIALS_MESSAGE, resolveSmsEndpoint } from "./oktor-sms";

describe("Oktor SMS via n8n", () => {
  it("maps code 900 to a friendly safe error", () => {
    expect(() => assertOktorAccepted(JSON.stringify({ codigo: "900", descricao_retorno: "USUARIO INVALIDO" }))).toThrow(OKTOR_INVALID_CREDENTIALS_MESSAGE);
  });
  it("blocks direct Oktor and accepts n8n", () => {
    expect(() => resolveSmsEndpoint({ endpoint: "http://integracao.oktor.com.br/integracao3.do", account: "a", code: "b", client: "333" })).toThrow(/direto para a Oktor/);
    expect(resolveSmsEndpoint({ endpoint: "https://n8n.wescctech.com.br/webhook/sms", account: "a", code: "b", client: "333" })).toContain("n8n.wescctech.com.br");
  });
});

import { describe, expect, it } from "vitest";
import { buildPetitionShareText, buildPetitionShareUrl } from "./petition-sharing";

describe("petition sharing", () => {
  const shareUrl = "https://politicall.com.br/p/minha-peticao?v=mabc123";

  it("versions the shared petition URL without changing its path", () => {
    expect(buildPetitionShareUrl(
      "https://politicall.com.br",
      "minha-peticao",
      "mabc123",
    )).toBe(shareUrl);
  });

  it("replaces every configured link variable", () => {
    expect(buildPetitionShareText(
      "Assine aqui: {link}\nCompartilhe: {link}",
      "Minha petição",
      shareUrl,
    )).toBe(`Assine aqui: ${shareUrl}\nCompartilhe: ${shareUrl}`);
  });

  it("appends the petition URL when configured text has no link variable", () => {
    expect(buildPetitionShareText(
      "Ajude esta causa.",
      "Minha petição",
      shareUrl,
    )).toBe(`Ajude esta causa.\n\n${shareUrl}`);
  });

  it("includes the petition URL in the default message", () => {
    expect(buildPetitionShareText(null, "Minha petição", shareUrl)).toBe(
      `Acabei de assinar "Minha petição". Junte-se a mim!\n\n${shareUrl}`,
    );
  });
});

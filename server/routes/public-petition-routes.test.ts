import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: {
    getPetitionBySlug: vi.fn(),
    getPetitionSignatureByEmail: vi.fn(),
    getPetitionSignatureByCpf: vi.fn(),
    createPetitionSignature: vi.fn(),
    getPetitionSignatureCount: vi.fn(),
    incrementPetitionViews: vi.fn(),
  },
  resolvePetitionSignatureContact: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mocks.storage }));
vi.mock("../services/petition-contact-link", () => ({
  resolvePetitionSignatureContact: mocks.resolvePetitionSignatureContact,
}));

import { registerPublicPetitionRoutes } from "./public-petition-routes";

const petition = {
  id: "petition-1",
  accountId: "account-1",
  userId: "user-1",
  status: "publicada",
  requirePhone: false,
  requireLocation: true,
  requireEmail: false,
  requireCpf: false,
  requireComment: false,
  lgpdText: null,
};

describe("public petition signature contact normalization", () => {
  let close: (() => Promise<void>) | undefined;

  beforeEach(() => {
    mocks.storage.getPetitionBySlug.mockReset().mockResolvedValue(petition);
    mocks.storage.getPetitionSignatureByEmail.mockReset().mockResolvedValue(null);
    mocks.storage.getPetitionSignatureByCpf.mockReset().mockResolvedValue(null);
    mocks.storage.createPetitionSignature.mockReset().mockImplementation(async (value) => value);
    mocks.storage.getPetitionSignatureCount.mockReset().mockResolvedValue(1);
    mocks.resolvePetitionSignatureContact.mockReset().mockResolvedValue("contact-1");
  });

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start() {
    const app = express();
    app.use(express.json());
    registerPublicPetitionRoutes(app);
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return `http://127.0.0.1:${server.address().port}`;
  }

  it("persists normalized phone and canonical city/UF", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/public/petitions/teste/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Pessoa Teste",
        phone: "+55 (51) 99876-5432",
        city: "florianopolis",
        state: "sc",
        acceptedTerms: true,
      }),
    });

    expect(response.status, await response.text()).toBe(201);
    expect(mocks.resolvePetitionSignatureContact).toHaveBeenCalledWith(expect.objectContaining({
      phone: "51998765432",
      city: "Florianópolis",
      state: "SC",
    }), expect.any(Object));
    expect(mocks.storage.createPetitionSignature).toHaveBeenCalledWith(expect.objectContaining({
      phone: "51998765432",
      city: "Florianópolis",
      state: "SC",
    }));
  });

  it("rejects invalid contact data before contact or signature persistence", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/public/petitions/teste/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Pessoa Teste",
        phone: "123",
        city: "Cidade inexistente",
        state: "SC",
        acceptedTerms: true,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      details: expect.arrayContaining([
        { field: "phone", message: "Telefone inválido." },
        { field: "location", message: "Selecione uma cidade válida." },
      ]),
    });
    expect(mocks.resolvePetitionSignatureContact).not.toHaveBeenCalled();
    expect(mocks.storage.createPetitionSignature).not.toHaveBeenCalled();
  });
});

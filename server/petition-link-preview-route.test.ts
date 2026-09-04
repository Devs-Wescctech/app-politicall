import path from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPetitionLinkPreviewHandler } from "./petition-link-preview-route";

const template = `<!doctype html><html><head><title>Plataforma de Gestão Política</title><meta name="description" content="Descrição geral" /></head><body></body></html>`;
const publishedPetition = {
  id: "petition-1",
  title: "Petição do bairro",
  description: "Mais iluminação para todas as ruas.",
  bannerUrl: "/uploads/petitions/bairro.jpg",
  logoUrl: null,
  goal: 250,
  status: "publicada",
  slug: "bairro",
};

describe("petition link preview route", () => {
  let close: (() => Promise<void>) | undefined;
  const getPetitionBySlug = vi.fn();
  const getPetitionSignatureCount = vi.fn();
  const readFile = vi.fn();
  const log = vi.fn();

  beforeEach(() => {
    getPetitionBySlug.mockReset().mockResolvedValue(publishedPetition);
    getPetitionSignatureCount.mockReset().mockResolvedValue(42);
    readFile.mockReset().mockResolvedValue(template);
    log.mockReset();
  });

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start() {
    const app = express();
    app.get("/p/:slug", createPetitionLinkPreviewHandler({
      getPetitionBySlug,
      getPetitionSignatureCount,
      readFile,
      environment: "production",
      runtimeDirectory: path.join("workspace", "dist"),
      publicAppUrl: "https://politicall.com.br",
      log,
    }));
    app.use((_req, res) => res.status(418).send("spa fallback"));
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => {
      server.close((error: Error | undefined) => error ? reject(error) : resolve());
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  it("serves petition metadata and metrics to WhatsApp from the production template", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/bairro?utm_source=whatsapp`, {
      headers: { "user-agent": "WhatsApp/2.24" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(html).toContain('<meta property="og:title" content="Petição do bairro" />');
    expect(html).toContain("42 assinaturas de uma meta de 250");
    expect(html).toContain("https://politicall.com.br/uploads/petitions/bairro.jpg");
    expect(html).toContain('<link rel="canonical" href="https://politicall.com.br/p/bairro" />');
    expect(html).not.toContain("utm_source");
    expect(getPetitionBySlug).toHaveBeenCalledWith("bairro");
    expect(getPetitionSignatureCount).toHaveBeenCalledWith("petition-1");
    expect(readFile).toHaveBeenCalledWith(
      path.join("workspace", "dist", "public", "index.html"),
      "utf-8",
    );
  });

  it("lets normal browsers continue to the SPA without querying storage", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/bairro`, {
      headers: { "user-agent": "Mozilla/5.0 Chrome/140.0" },
    });

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("spa fallback");
    expect(getPetitionBySlug).not.toHaveBeenCalled();
  });

  it("does not expose a draft petition", async () => {
    getPetitionBySlug.mockResolvedValue({
      ...publishedPetition,
      title: "Conteúdo privado",
      description: "Descrição privada",
      status: "rascunho",
    });
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/bairro`, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Petição - Politicall");
    expect(html).not.toContain("Conteúdo privado");
    expect(html).not.toContain("Descrição privada");
    expect(getPetitionSignatureCount).not.toHaveBeenCalled();
  });

  it("keeps paused petitions visible with their current metrics", async () => {
    getPetitionBySlug.mockResolvedValue({ ...publishedPetition, status: "pausada" });
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/bairro`, {
      headers: { "user-agent": "WhatsApp" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Petição do bairro");
    expect(html).toContain("42 assinaturas de uma meta de 250");
  });

  it("uses generic metadata when the petition does not exist", async () => {
    getPetitionBySlug.mockResolvedValue(undefined);
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/inexistente`, {
      headers: { "user-agent": "TelegramBot" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Petição - Politicall");
    expect(html).toContain("https://politicall.com.br/p/inexistente");
  });

  it("falls through to the SPA and logs a concise message on operational errors", async () => {
    readFile.mockRejectedValue(new Error("template missing"));
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/p/bairro`, {
      headers: { "user-agent": "WhatsApp" },
    });

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("spa fallback");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("template missing"));
  });
});

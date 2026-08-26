import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerContact360Route } from "./contact-360-route";

describe("contact 360 route", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => { await close?.(); close = undefined; });

  async function start(getContact360: ReturnType<typeof vi.fn>) {
    const app = express();
    const authenticate = (request: any, _response: any, next: any) => {
      request.accountId = "account-a";
      request.userId = "user-a";
      request.user = { role: "voluntario", permissions: { contacts: true, demands: true } };
      next();
    };
    registerContact360Route(app, { authenticate, requireContacts: (_request, _response, next) => next(), getContact360 });
    const server = await new Promise<any>((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return `http://127.0.0.1:${server.address().port}`;
  }

  it("returns the account-scoped aggregate", async () => {
    const aggregate = { contact: { id: "contact-a" }, summary: {}, timeline: [] };
    const getContact360 = vi.fn(async () => aggregate as any);
    const baseUrl = await start(getContact360);

    const response = await fetch(`${baseUrl}/api/contacts/contact-a/360`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aggregate);
    expect(getContact360).toHaveBeenCalledWith("account-a", "contact-a", {
      role: "voluntario",
      userId: "user-a",
      permissions: { contacts: true, demands: true },
    });
  });

  it("hides contacts outside the authenticated account", async () => {
    const baseUrl = await start(vi.fn(async () => null));

    const response = await fetch(`${baseUrl}/api/contacts/contact-b/360`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "CONTACT_NOT_FOUND", error: "Eleitor nao encontrado" });
  });
});

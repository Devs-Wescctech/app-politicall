import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactMergeError } from "../services/contact-merge";
import { registerContactDuplicatesRoutes } from "./contact-duplicates-route";

describe("contact duplicate routes", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start(serviceOverrides: Record<string, unknown> = {}) {
    const service = {
      duplicates: vi.fn(async () => [{ id: "group-a" }]),
      preview: vi.fn(async () => ({ token: "a".repeat(64) })),
      merge: vi.fn(async () => [{ id: "merge-a" }]),
      listMerges: vi.fn(async () => [{ id: "merge-a" }]),
      revert: vi.fn(async () => ({ id: "merge-a", status: "reverted" })),
      ...serviceOverrides,
    } as any;
    const authenticate = vi.fn((request: any, _response: any, next: any) => {
      request.accountId = "account-a";
      request.userId = "user-a";
      next();
    });
    const requireContacts = vi.fn((_request: any, _response: any, next: any) => next());
    const app = express();
    app.use(express.json());
    registerContactDuplicatesRoutes(app, { authenticate, requireContacts, service });
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return { baseUrl: `http://127.0.0.1:${server.address().port}`, service, authenticate, requireContacts };
  }

  it("lists duplicate groups inside the authenticated account", async () => {
    const context = await start();

    const response = await fetch(`${context.baseUrl}/api/contacts/duplicates`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ groups: [{ id: "group-a" }] });
    expect(context.service.duplicates).toHaveBeenCalledWith("account-a");
    expect(context.authenticate).toHaveBeenCalledOnce();
    expect(context.requireContacts).toHaveBeenCalledOnce();
  });

  it("validates and forwards preview and merge context", async () => {
    const context = await start();
    const body = { sourceContactIds: ["contact-b"], targetContactId: "contact-a" };

    const preview = await fetch(`${context.baseUrl}/api/contacts/merge-preview`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const merge = await fetch(`${context.baseUrl}/api/contacts/merge`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "route-test" },
      body: JSON.stringify({ ...body, previewToken: "a".repeat(64), resolvedContact: { name: "Maria" } }),
    });

    expect(preview.status).toBe(200);
    expect(context.service.preview).toHaveBeenCalledWith({ accountId: "account-a", ...body });
    expect(merge.status).toBe(200);
    expect(context.service.merge).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "account-a", userId: "user-a", ...body, previewToken: "a".repeat(64), resolvedContact: { name: "Maria" }, userAgent: "route-test",
    }));
  });

  it("rejects malformed merge input before calling the service", async () => {
    const context = await start();

    const response = await fetch(`${context.baseUrl}/api/contacts/merge-preview`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceContactIds: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "CONTACT_MERGE_INVALID" });
    expect(context.service.preview).not.toHaveBeenCalled();
  });

  it("maps stale previews and supports account-scoped history and revert", async () => {
    const merge = vi.fn(async () => { throw new ContactMergeError("CONTACT_MERGE_STALE", "Previa desatualizada"); });
    const context = await start({ merge });
    const body = { sourceContactIds: ["contact-b"], targetContactId: "contact-a", previewToken: "a".repeat(64), resolvedContact: {} };

    const stale = await fetch(`${context.baseUrl}/api/contacts/merge`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const history = await fetch(`${context.baseUrl}/api/contacts/merges`);
    const revert = await fetch(`${context.baseUrl}/api/contacts/merges/merge-a/revert`, { method: "POST" });

    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ code: "CONTACT_MERGE_STALE", error: "Previa desatualizada" });
    expect(history.status).toBe(200);
    expect(context.service.listMerges).toHaveBeenCalledWith("account-a");
    expect(revert.status).toBe(200);
    expect(context.service.revert).toHaveBeenCalledWith({ accountId: "account-a", userId: "user-a", mergeId: "merge-a" });
  });
});

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  authenticateToken: vi.fn(),
  requirePermission: vi.fn(() => vi.fn()),
}));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

import { AllianceLineError } from "../services/alliance-line-service";
import { registerAllianceRoutes } from "./alliance-routes";

const line = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "account-a",
  createdByUserId: "user-a",
  name: "Frente Popular",
  description: null,
  color: "#14B8A6",
  icon: "Flag",
  displayOrder: 0,
  active: true,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: "2026-08-12T12:00:00.000Z",
};

const validLine = { name: "Frente Popular", color: "#14B8A6", icon: "Flag", displayOrder: 0, active: true };

describe("alliance line routes", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start(overrides: Record<string, unknown> = {}) {
    const lineService = {
      list: vi.fn(async () => [line]),
      create: vi.fn(async ({ data }: any) => ({ ...line, ...data })),
      update: vi.fn(async ({ id, data }: any) => ({ ...line, id, ...data })),
      reorder: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      assertAssignable: vi.fn(async () => undefined),
      ...((overrides.lineService as Record<string, unknown> | undefined) ?? {}),
    };
    const storage = {
      getAllParties: vi.fn(async () => []),
      getAlliances: vi.fn(async () => [{ id: "alliance-a", partyId: "party-a", lineId: line.id, line }]),
      createAlliance: vi.fn(async (input) => input),
      updateAlliance: vi.fn(async (_id, _accountId, input) => input),
      deleteAlliance: vi.fn(async () => undefined),
      getAllianceInvites: vi.fn(async () => []),
      createAllianceInvite: vi.fn(async (input) => input),
      getAllianceInviteByToken: vi.fn(),
      getUser: vi.fn(),
      getAccountAdmin: vi.fn(),
      acceptAllianceInvite: vi.fn(),
      rejectAllianceInvite: vi.fn(),
      deleteAllianceInvite: vi.fn(),
      ...((overrides.storage as Record<string, unknown> | undefined) ?? {}),
    };
    const authenticate = vi.fn((request: any, _response: any, next: any) => {
      request.accountId = "account-a";
      request.userId = "user-a";
      next();
    });
    const requireAlliances = vi.fn((_request: any, _response: any, next: any) => next());
    const app = express();
    app.use(express.json());
    registerAllianceRoutes(app, { authenticate, requireAlliances, storage: storage as any, lineService: lineService as any });
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return { baseUrl: `http://127.0.0.1:${server.address().port}`, lineService, storage, authenticate, requireAlliances };
  }

  it("lists active lines by default, supports includeInactive, and secures both requests", async () => {
    const context = await start();
    const active = await fetch(`${context.baseUrl}/api/alliance-lines`);
    const all = await fetch(`${context.baseUrl}/api/alliance-lines?includeInactive=true`);

    expect(active.status).toBe(200);
    expect(await active.json()).toEqual([line]);
    expect(all.status).toBe(200);
    expect(context.lineService.list).toHaveBeenNthCalledWith(1, { accountId: "account-a", includeInactive: false });
    expect(context.lineService.list).toHaveBeenNthCalledWith(2, { accountId: "account-a", includeInactive: true });
    expect(context.authenticate).toHaveBeenCalledTimes(2);
    expect(context.requireAlliances).toHaveBeenCalledTimes(2);
  });

  it("creates lines with server-owned tenancy fields and rejects invalid payloads", async () => {
    const context = await start();
    const created = await fetch(`${context.baseUrl}/api/alliance-lines`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validLine, accountId: "attacker", createdByUserId: "attacker" }),
    });
    const invalid = await fetch(`${context.baseUrl}/api/alliance-lines`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }),
    });

    expect(created.status).toBe(201);
    expect(context.lineService.create).toHaveBeenCalledWith({ accountId: "account-a", userId: "user-a", data: validLine });
    expect(invalid.status).toBe(400);
    expect(context.lineService.create).toHaveBeenCalledOnce();
  });

  it("maps duplicate, missing, reorder, and in-use domain errors to stable statuses", async () => {
    const context = await start({
      lineService: {
        create: vi.fn(async () => { throw new AllianceLineError("ALLIANCE_LINE_DUPLICATE", "Duplicada"); }),
        update: vi.fn(async () => { throw new AllianceLineError("ALLIANCE_LINE_NOT_FOUND", "Ausente"); }),
        reorder: vi.fn(async () => { throw new AllianceLineError("ALLIANCE_LINE_REORDER_INVALID", "Ordem invalida"); }),
        delete: vi.fn(async () => { throw new AllianceLineError("ALLIANCE_LINE_IN_USE", "A linha politica possui aliancas vinculadas"); }),
      },
    });

    const duplicate = await fetch(`${context.baseUrl}/api/alliance-lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validLine) });
    const missing = await fetch(`${context.baseUrl}/api/alliance-lines/${line.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) });
    const reorder = await fetch(`${context.baseUrl}/api/alliance-lines/reorder`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [line.id] }) });
    const inUse = await fetch(`${context.baseUrl}/api/alliance-lines/${line.id}`, { method: "DELETE" });

    expect(duplicate.status).toBe(409);
    expect(missing.status).toBe(404);
    expect(reorder.status).toBe(400);
    expect(inUse.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: "ALLIANCE_LINE_DUPLICATE" });
    expect(await inUse.json()).toEqual({
      code: "ALLIANCE_LINE_IN_USE",
      error: "A linha politica possui aliancas vinculadas",
    });
  });

  it("rejects malformed reorder requests without calling the service", async () => {
    const context = await start();
    const response = await fetch(`${context.baseUrl}/api/alliance-lines/reorder`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [line.id, line.id] }),
    });

    expect(response.status).toBe(400);
    expect(context.lineService.reorder).not.toHaveBeenCalled();
  });

  it.each(["PATCH", "DELETE"])("rejects an invalid UUID on %s without calling the service", async (method) => {
    const context = await start();
    const response = await fetch(`${context.baseUrl}/api/alliance-lines/not-a-uuid`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PATCH" ? JSON.stringify({ active: false }) : undefined,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "ALLIANCE_LINE_INVALID",
      error: "ID da linha politica invalido",
    });
    expect(context.lineService.update).not.toHaveBeenCalled();
    expect(context.lineService.delete).not.toHaveBeenCalled();
  });

  it("validates selected alliance lines and returns loaded lines without a per-alliance lookup", async () => {
    const context = await start();
    const created = await fetch(`${context.baseUrl}/api/alliances`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ partyId: "party-a", allyName: "Ana", lineId: line.id, accountId: "attacker", userId: "attacker" }),
    });
    const listed = await fetch(`${context.baseUrl}/api/alliances`);

    expect(created.status).toBe(200);
    expect(context.lineService.assertAssignable).toHaveBeenCalledWith({ accountId: "account-a", lineId: line.id });
    expect(context.storage.createAlliance).toHaveBeenCalledWith(expect.objectContaining({ accountId: "account-a", userId: "user-a", lineId: line.id }));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([expect.objectContaining({ line })]);
    expect(context.storage.getAlliances).toHaveBeenCalledOnce();
  });
});

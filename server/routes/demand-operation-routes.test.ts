import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../auth", () => ({
  authenticateToken: vi.fn(),
  requirePermission: vi.fn(() => vi.fn()),
}));

import { registerDemandOperationRoutes } from "./demand-operation-routes";

describe("demand operation routes", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start() {
    const getOperations = vi.fn(async (_accountId: string, filters: unknown) => ({ generatedAt: "2026-08-12T12:00:00.000Z", filters }));
    const authenticate = vi.fn((request: any, _response: any, next: any) => {
      request.accountId = "account-a";
      request.userId = "user-a";
      next();
    });
    const requireDemands = vi.fn((_request: any, _response: any, next: any) => next());
    const app = express();
    registerDemandOperationRoutes(app, { authenticate, requireDemands, getOperations, now: () => new Date("2026-08-12T12:00:00.000Z") });
    const server = await new Promise<any>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    close = () => new Promise((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
    return { baseUrl: `http://127.0.0.1:${server.address().port}`, authenticate, requireDemands, getOperations };
  }

  it("returns account-scoped operations with normalized filters", async () => {
    const context = await start();
    const response = await fetch(`${context.baseUrl}/api/demand-operations?from=2026-08-01&to=2026-08-10&page=2&pageSize=10&deadlineState=stale`);

    expect(response.status).toBe(200);
    expect(context.authenticate).toHaveBeenCalledOnce();
    expect(context.requireDemands).toHaveBeenCalledOnce();
    expect(context.getOperations).toHaveBeenCalledWith("account-a", expect.objectContaining({
      from: "2026-08-01T00:00:00.000Z", to: "2026-08-10T23:59:59.999Z", page: 2, pageSize: 10, deadlineState: "stale",
    }));
  });

  it("returns a stable validation error without calling the service", async () => {
    const context = await start();
    const response = await fetch(`${context.baseUrl}/api/demand-operations?pageSize=500`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Tamanho de pagina invalido", code: "VALIDATION_ERROR" });
    expect(context.getOperations).not.toHaveBeenCalled();
  });

  it("does not leak internal errors", async () => {
    const context = await start();
    context.getOperations.mockRejectedValueOnce(new Error("database secret"));
    const response = await fetch(`${context.baseUrl}/api/demand-operations`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Nao foi possivel carregar a central de demandas", code: "DEMAND_OPERATIONS_INTERNAL_ERROR" });
  });
});

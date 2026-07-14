import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHealthRoutes } from "./health";

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

async function startApp(checkDatabase: () => Promise<void>) {
  const app = express();
  registerHealthRoutes(app, { checkDatabase });
  const server = app.listen(0);
  servers.push(server);

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

describe("health routes", () => {
  it("reports liveness without querying the database", async () => {
    const checkDatabase = vi.fn(async () => undefined);
    const baseUrl = await startApp(checkDatabase);

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("reports readiness only when the database responds", async () => {
    const baseUrl = await startApp(async () => undefined);

    const response = await fetch(`${baseUrl}/api/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("returns a generic unavailable response when the database fails", async () => {
    const baseUrl = await startApp(async () => {
      throw new Error("connection contains sensitive details");
    });

    const response = await fetch(`${baseUrl}/api/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

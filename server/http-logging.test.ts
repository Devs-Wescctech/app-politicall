import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApiRequestLogger } from "./http-logging";

describe("API request logging", () => {
  it("logs request metadata without serializing response bodies", () => {
    const log = vi.fn();
    const middleware = createApiRequestLogger(log, () => 1_050);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      json(body: unknown) {
        return body;
      },
    });

    middleware(
      { method: "POST", path: "/api/admin/login" } as never,
      response as never,
      vi.fn(),
    );
    response.json({ token: "secret-token", password: "secret-password" });
    response.emit("finish");

    expect(log).toHaveBeenCalledWith("POST /api/admin/login 200 in 0ms");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-token");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-password");
  });

  it("ignores non-API requests", () => {
    const log = vi.fn();
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });

    createApiRequestLogger(log)(
      { method: "GET", path: "/favicon.png" } as never,
      response as never,
      vi.fn(),
    );
    response.emit("finish");

    expect(log).not.toHaveBeenCalled();
  });
});

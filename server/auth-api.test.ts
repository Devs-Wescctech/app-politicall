import { describe, expect, it, vi } from "vitest";

const validateApiKey = vi.fn();
const updateApiKeyUsage = vi.fn();

vi.mock("./storage", () => ({
  storage: { validateApiKey, updateApiKeyUsage },
}));

const { authenticateApiKey } = await import("./auth-api");

function response() {
  const res: any = {
    statusCode: 200,
    status: vi.fn(function (this: any, statusCode: number) { this.statusCode = statusCode; return this; }),
    json: vi.fn(),
    on: vi.fn(),
  };
  return res;
}

describe("API-key Bearer authentication", () => {
  it("preserves Bearer pk_* API-key authentication", async () => {
    validateApiKey.mockResolvedValueOnce({ id: "key-a", accountId: "account-a" });
    const req: any = { headers: { authorization: "Bearer pk_valid" }, path: "/api/v1/contacts", method: "GET", get: vi.fn(), ip: "127.0.0.1" };
    const res = response();
    const next = vi.fn();

    await authenticateApiKey(req, res, next);

    expect(req.apiKey).toEqual({ id: "key-a", accountId: "account-a" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not treat a browser Bearer JWT as an API key", async () => {
    const req: any = { headers: { authorization: "Bearer legacy-user-jwt" } };
    const res = response();

    await authenticateApiKey(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid API key format" });
  });
});

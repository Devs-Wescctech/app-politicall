import { describe, expect, it, vi } from "vitest";
import { sendAuthSessionResponse } from "./auth-session-routes";

describe("auth session route responses", () => {
  it("serializes only public user data after setting internal cookie credentials", () => {
    const response = {
      set: vi.fn(),
      cookie: vi.fn(),
      json: vi.fn(),
    };

    sendAuthSessionResponse(response as any, {
      user: { id: "user-a", email: "user@example.test", name: "User", role: "admin", permissions: ["users"] },
      cookies: {
        kind: "user",
        principalId: "user-a",
        sessionId: "session-a",
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        csrfToken: "csrf-secret",
        refreshMaxAgeMs: 60 * 60 * 1000,
      },
    });

    expect(response.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(response.cookie).toHaveBeenCalledTimes(3);
    expect(response.json).toHaveBeenCalledWith({
      user: { id: "user-a", email: "user@example.test", name: "User", role: "admin", permissions: ["users"] },
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain("secret");
  });
});

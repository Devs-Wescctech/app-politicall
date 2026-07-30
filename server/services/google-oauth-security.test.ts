import { describe, expect, it } from "vitest";
import { redactGoogleOauthFailure, toSafeGoogleOauthResponse } from "./google-oauth-security";

describe("Google OAuth error redaction", () => {
  it("retains only bounded status and code without request configuration, headers, or secrets", () => {
    const result = redactGoogleOauthFailure({
      response: { status: 401, data: { error: "invalid_grant", client_secret: "secret" } },
      config: { headers: { authorization: "Bearer token" } },
      message: "authorization code=secret",
    });

    expect(result).toEqual({ status: 401, code: "invalid_grant", message: "Google OAuth request failed" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("creates a bounded Google Calendar response without SDK message content", () => {
    const response = toSafeGoogleOauthResponse({
      response: { status: 403, data: { error: "access_denied", access_token: "never-return" } },
      message: "client_secret=never-return",
    });

    expect(response).toEqual({
      error: "Google OAuth request failed",
      category: "google_oauth",
      status: 403,
      code: "access_denied",
    });
    expect(JSON.stringify(response)).not.toContain("never-return");
  });
});

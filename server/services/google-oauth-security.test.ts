import { describe, expect, it } from "vitest";
import { redactGoogleOauthFailure } from "./google-oauth-security";

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
});

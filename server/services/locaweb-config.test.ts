import { describe, expect, it } from "vitest";
import { locawebConfigFromIntegration } from "./locaweb-config";

describe("Locaweb integration configuration", () => {
  it("keeps the external provider default when a newly saved config omits the header", () => {
    expect(locawebConfigFromIntegration({
      locawebAccountId: "account",
      locawebApiKey: "key",
    })).toMatchObject({
      authHeader: "Authorization",
      authScheme: "Bearer",
    });
  });

  it("preserves an existing provider-specific header when present", () => {
    expect(locawebConfigFromIntegration({ locawebAuthHeader: "X-Provider-Auth" }))
      .toMatchObject({ authHeader: "X-Provider-Auth" });
  });
});

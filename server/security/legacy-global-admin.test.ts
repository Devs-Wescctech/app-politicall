import { describe, expect, it } from "vitest";
import { isPureLegacyGlobalAdminClaims } from "./legacy-global-admin";

describe("legacy global-admin claims", () => {
  it("rejects a tenant-admin Bearer from global-admin routes", () => {
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true, userId: "tenant-admin", accountId: "account-a" })).toBe(false);
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true })).toBe(true);
  });
});

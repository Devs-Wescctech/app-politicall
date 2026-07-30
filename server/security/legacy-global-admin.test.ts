import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { isPureLegacyGlobalAdminClaims, verifyPureLegacyGlobalAdminToken } from "./legacy-global-admin";

describe("legacy global-admin claims", () => {
  it("rejects a tenant-admin Bearer from global-admin routes", () => {
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true, userId: "tenant-admin", accountId: "account-a" })).toBe(false);
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true, sid: "new-session" })).toBe(false);
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true, kind: "admin" })).toBe(false);
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true, principalId: "politicall:global-admin" })).toBe(false);
    expect(isPureLegacyGlobalAdminClaims({ isAdmin: true })).toBe(true);
  });

  it("verifies only a pure HS256 legacy global-admin Bearer", () => {
    const secret = "legacy-global-admin-test-secret";
    const pure = jwt.sign({ isAdmin: true }, secret, { algorithm: "HS256" });
    const tenant = jwt.sign({ isAdmin: true, userId: "tenant-admin", accountId: "account-a" }, secret, { algorithm: "HS256" });

    expect(verifyPureLegacyGlobalAdminToken(pure, secret)).toBe(true);
    expect(verifyPureLegacyGlobalAdminToken(tenant, secret)).toBe(false);
  });
});

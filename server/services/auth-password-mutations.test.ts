import { describe, expect, it } from "vitest";
import { assertAccountScopedTarget } from "./auth-password-mutations";

describe("account-scoped password mutations", () => {
  it("rejects a target from another account before a mutation can use its authoritative scope", () => {
    expect(() => assertAccountScopedTarget("account-a", "account-b")).toThrow("account scope");
    expect(() => assertAccountScopedTarget("account-a", "account-a")).not.toThrow();
  });
});

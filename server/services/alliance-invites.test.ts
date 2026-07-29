import { describe, expect, it } from "vitest";
import { generateAllianceInviteToken } from "./alliance-invites";

describe("generateAllianceInviteToken", () => {
  it("generates a six-character uppercase hex token", () => {
    const token = generateAllianceInviteToken(() => Buffer.from([0xab, 0xcd, 0xef]));

    expect(token).toBe("ABCDEF");
  });
});

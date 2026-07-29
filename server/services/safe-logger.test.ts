import { describe, expect, it } from "vitest";
import { maskSensitiveValue, redactLogFields } from "./safe-logger";

describe("safe logger", () => {
  it("masks sensitive string values while keeping enough context", () => {
    expect(maskSensitiveValue("abcdef123456")).toBe("ab********56");
    expect(maskSensitiveValue("abcd")).toBe("****");
    expect(maskSensitiveValue("")).toBe("(empty)");
  });

  it("redacts common sensitive field names", () => {
    expect(redactLogFields({
      token: "secret-token",
      apiKey: "sk-value",
      code: "123456",
      host: "example.com",
    })).toEqual({
      token: "se********en",
      apiKey: "sk****ue",
      code: "12**56",
      host: "example.com",
    });
  });
});

import { describe, expect, it } from "vitest";
import { createListenOptions } from "./listen-options";

describe("server listen options", () => {
  it("disables reusePort on Windows", () => {
    expect(createListenOptions(5000, "win32")).toEqual({
      port: 5000,
      host: "0.0.0.0",
    });
  });

  it("enables reusePort on supported platforms", () => {
    expect(createListenOptions(5000, "linux")).toEqual({
      port: 5000,
      host: "0.0.0.0",
      reusePort: true,
    });
  });
});

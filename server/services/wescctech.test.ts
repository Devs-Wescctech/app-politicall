import { describe, expect, it } from "vitest";
import { isWesccChannelConnected } from "./wescctech";

describe("isWesccChannelConnected", () => {
  it("accepts only the CONNECTED provider state", () => {
    expect(isWesccChannelConnected({ status: "CONNECTED" })).toBe(true);
    expect(isWesccChannelConnected({ status: "OFFLINE" })).toBe(false);
    expect(isWesccChannelConnected({ status: "PAIRING" })).toBe(false);
  });

  it("normalizes provider status casing and whitespace", () => {
    expect(isWesccChannelConnected({ status: " connected " })).toBe(true);
  });
});

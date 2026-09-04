import { describe, expect, it } from "vitest";
import { isWesccChannelConnected, isWesccChannelRegistered } from "./wescctech";

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

describe("isWesccChannelRegistered", () => {
  it("accepts only the normalized REGISTERED provider state", () => {
    expect(isWesccChannelRegistered({ status: "REGISTERED" })).toBe(true);
    expect(isWesccChannelRegistered({ status: " registered " })).toBe(true);
    expect(isWesccChannelRegistered({ status: "CONNECTED" })).toBe(false);
    expect(isWesccChannelRegistered({ status: "OFFLINE" })).toBe(false);
  });
});

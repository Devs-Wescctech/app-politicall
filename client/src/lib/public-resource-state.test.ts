import { describe, expect, it } from "vitest";
import { getPublicResourceState } from "./public-resource-state";

describe("getPublicResourceState", () => {
  it("keeps loading only while the request is in flight", () => {
    expect(getPublicResourceState({ isLoading: true, isError: false, hasData: false })).toBe("loading");
  });

  it("returns an error state when the request failed or finished without data", () => {
    expect(getPublicResourceState({ isLoading: false, isError: true, hasData: false })).toBe("error");
    expect(getPublicResourceState({ isLoading: false, isError: false, hasData: false })).toBe("error");
  });

  it("returns ready when public data is available", () => {
    expect(getPublicResourceState({ isLoading: false, isError: false, hasData: true })).toBe("ready");
  });
});

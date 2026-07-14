import { describe, it, expect } from "vitest";
import {
  parsePaginationParams,
  makePaginatedResult,
  paginateInMemory,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination";

describe("parsePaginationParams", () => {
  it("returns defaults when no params are provided", () => {
    expect(parsePaginationParams({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it("parses valid page and pageSize", () => {
    expect(parsePaginationParams({ page: "3", pageSize: "25" })).toEqual({ page: 3, pageSize: 25 });
  });

  it("floors page at 1 for zero, negative, or invalid values", () => {
    expect(parsePaginationParams({ page: "0" }).page).toBe(1);
    expect(parsePaginationParams({ page: "-5" }).page).toBe(1);
    expect(parsePaginationParams({ page: "abc" }).page).toBe(1);
  });

  it("caps pageSize at MAX_PAGE_SIZE", () => {
    expect(parsePaginationParams({ pageSize: "9999" }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(parsePaginationParams({ pageSize: String(MAX_PAGE_SIZE + 1) }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("falls back to the default for zero/invalid pageSize and floors negatives at 1", () => {
    expect(parsePaginationParams({ pageSize: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePaginationParams({ pageSize: "abc" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePaginationParams({ pageSize: "-1" }).pageSize).toBe(1);
  });
});

describe("makePaginatedResult", () => {
  it("computes totalPages and navigation flags for a middle page", () => {
    const r = makePaginatedResult([1, 2], 10, 2, 2);
    expect(r.total).toBe(10);
    expect(r.totalPages).toBe(5);
    expect(r.hasNextPage).toBe(true);
    expect(r.hasPreviousPage).toBe(true);
  });

  it("keeps total independent of the current page's data length (empty page does not erase the total)", () => {
    // Page 99 out of range -> data is empty but the aggregate total must persist.
    const r = makePaginatedResult([], 42, 99, 20);
    expect(r.data).toEqual([]);
    expect(r.total).toBe(42);
    expect(r.totalPages).toBe(3);
    expect(r.hasNextPage).toBe(false);
    expect(r.hasPreviousPage).toBe(true);
  });

  it("reports at least one page even when there are no records", () => {
    const r = makePaginatedResult([], 0, 1, 20);
    expect(r.totalPages).toBe(1);
    expect(r.hasNextPage).toBe(false);
    expect(r.hasPreviousPage).toBe(false);
  });
});

describe("paginateInMemory", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it("returns the correct slice for the first page", () => {
    const r = paginateInMemory(items, 1, 20);
    expect(r.data).toHaveLength(20);
    expect(r.data[0]).toBe(1);
    expect(r.total).toBe(45);
    expect(r.totalPages).toBe(3);
    expect(r.hasPreviousPage).toBe(false);
    expect(r.hasNextPage).toBe(true);
  });

  it("returns the remainder on the last page", () => {
    const r = paginateInMemory(items, 3, 20);
    expect(r.data).toHaveLength(5);
    expect(r.data[0]).toBe(41);
    expect(r.hasNextPage).toBe(false);
    expect(r.hasPreviousPage).toBe(true);
  });

  it("preserves total on an out-of-range page", () => {
    const r = paginateInMemory(items, 10, 20);
    expect(r.data).toEqual([]);
    expect(r.total).toBe(45);
    expect(r.totalPages).toBe(3);
  });
});

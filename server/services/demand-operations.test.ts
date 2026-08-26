import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { DemandOperationsInputError, normalizeDemandOperationFilters } from "./demand-operations";

describe("demand operations service", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("uses a 30 day default period and default pagination", () => {
    expect(normalizeDemandOperationFilters({}, now)).toEqual({
      from: "2026-07-13T00:00:00.000Z",
      to: "2026-08-12T23:59:59.999Z",
      page: 1,
      pageSize: 25,
    });
  });

  it("normalizes supported filters and search", () => {
    expect(normalizeDemandOperationFilters({
      from: "2026-08-01", to: "2026-08-10", page: "2", pageSize: "100",
      categoryId: " cat-1 ", destinationId: "dest-1", assigneeUserId: "user-1",
      demandStatus: "in_progress", forwardingStatus: "waiting", deadlineState: "stale",
      search: "  iluminacao  ",
    }, now)).toMatchObject({
      from: "2026-08-01T00:00:00.000Z", to: "2026-08-10T23:59:59.999Z",
      page: 2, pageSize: 100, categoryId: "cat-1", destinationId: "dest-1",
      assigneeUserId: "user-1", demandStatus: "in_progress", forwardingStatus: "waiting",
      deadlineState: "stale", search: "iluminacao",
    });
  });

  it.each([
    [{ from: "invalid" }, "Periodo inicial invalido"],
    [{ from: "2026-08-10", to: "2026-08-01" }, "Periodo inicial deve ser anterior ao final"],
    [{ page: "0" }, "Pagina invalida"],
    [{ pageSize: "101" }, "Tamanho de pagina invalido"],
    [{ deadlineState: "unknown" }, "Estado de prazo invalido"],
  ])("rejects invalid filters %#", (query, message) => {
    expect(() => normalizeDemandOperationFilters(query, now)).toThrowError(new DemandOperationsInputError(message));
  });

  it("scopes every data source to the authenticated account", () => {
    const source = readFileSync("server/services/demand-operations.ts", "utf8");
    expect(source.match(/eq\([^\n]+\.accountId, accountId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("inArray(demandForwardings.demandId, demandIds)");
    expect(source).toContain("inArray(demandHistory.demandId, demandIds)");
  });
});

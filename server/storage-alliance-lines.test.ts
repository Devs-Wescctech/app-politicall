import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {} as any,
  transaction: vi.fn(),
  execute: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./db", () => ({ db: mocks.db }));

import { DatabaseStorage } from "./storage";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const concurrent = "33333333-3333-4333-8333-333333333333";

describe("alliance line reorder storage", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.update.mockReset();
    mocks.transaction.mockReset();
    mocks.db.transaction = mocks.transaction;
  });

  it("rejects atomically when a concurrent create changes the cabinet set after the transaction begins", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
      .mockResolvedValueOnce({ rows: [{ id: first }, { id: second }, { id: concurrent }] });
    mocks.transaction.mockImplementation(async (work: any) => work({ execute: mocks.execute, update: mocks.update }));
    const storage = new DatabaseStorage();

    await expect(storage.reorderAllianceLines("account-a", [second, first]))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_REORDER_INVALID" });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "serializable" }));
  });

  it("rejects atomically when a concurrent delete removes a requested cabinet line", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
      .mockResolvedValueOnce({ rows: [{ id: first }] });
    mocks.transaction.mockImplementation(async (work: any) => work({ execute: mocks.execute, update: mocks.update }));
    const storage = new DatabaseStorage();

    await expect(storage.reorderAllianceLines("account-a", [second, first]))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_REORDER_INVALID" });

    expect(mocks.update).not.toHaveBeenCalled();
  });
});

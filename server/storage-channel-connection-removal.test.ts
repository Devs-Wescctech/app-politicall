import { beforeEach, describe, expect, it, vi } from "vitest";

const before = { id: "connection-1", accountId: "account-1", status: "connected" };
const disabled = { ...before, status: "disabled" };

const mocks = vi.hoisted(() => {
  const transaction = {
    execute: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    transaction,
    db: { transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) },
  };
});

vi.mock("./db", () => ({ db: mocks.db }));

import { DatabaseStorage } from "./storage";

function selected(row: unknown) {
  return { from: () => ({ where: async () => [row] }) };
}

describe("atomic channel connection removal", () => {
  beforeEach(() => {
    mocks.db.transaction.mockClear();
    mocks.transaction.execute.mockReset();
    mocks.transaction.select.mockReset();
    mocks.transaction.update.mockReset();
    mocks.transaction.delete.mockReset();
  });

  it("uses array execute results to keep a history-backed locked connection and disable it", async () => {
    mocks.transaction.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "connection-1" }])
      .mockResolvedValueOnce([{ used: true }]);
    mocks.transaction.select.mockImplementation(() => selected(before));
    mocks.transaction.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [disabled] }) }) }));

    await expect(new DatabaseStorage().removeChannelConnection("account-1", "connection-1"))
      .resolves.toEqual({ before, connection: disabled, deleted: false });
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  it("uses the array row-lock result to stop when the connection no longer exists", async () => {
    mocks.transaction.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(new DatabaseStorage().removeChannelConnection("account-1", "connection-1")).resolves.toBeNull();
    expect(mocks.transaction.select).not.toHaveBeenCalled();
    expect(mocks.transaction.update).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  it("uses an existing array row-lock result to delete a connection without history", async () => {
    mocks.transaction.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "connection-1" }])
      .mockResolvedValueOnce([{ used: false }]);
    mocks.transaction.select.mockImplementation(() => selected(before));
    mocks.transaction.delete.mockImplementation(() => ({ where: async () => undefined }));

    await expect(new DatabaseStorage().removeChannelConnection("account-1", "connection-1"))
      .resolves.toEqual({ before, connection: null, deleted: true });
    expect(mocks.transaction.update).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).toHaveBeenCalledOnce();
  });
});

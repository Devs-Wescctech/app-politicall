import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    transaction,
    db: {
      transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("./db", () => ({ db: mocks.db }));

import { DatabaseStorage } from "./storage";

const createdConversation = { id: "conversation-1", accountId: "account-1", connectionId: "connection-1" };

function returning(row: unknown) {
  return { values: () => ({ returning: async () => [row] }), set: () => ({ where: () => ({ returning: async () => [row] }) }) };
}

function availableConnection(rows: unknown[]) {
  return { from: () => ({ where: async () => rows }) };
}

describe("conversation connection lifecycle locking", () => {
  beforeEach(() => {
    mocks.db.transaction.mockClear();
    mocks.transaction.execute.mockReset();
    mocks.transaction.select.mockReset();
    mocks.transaction.insert.mockReset();
    mocks.transaction.update.mockReset();
    mocks.db.insert.mockReset();
    mocks.db.update.mockReset();
    mocks.transaction.execute.mockResolvedValue([]);
    mocks.transaction.select.mockImplementation(() => availableConnection([{ id: "connection-1", status: "connected" }]));
    mocks.transaction.insert.mockImplementation(() => returning(createdConversation));
    mocks.transaction.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [createdConversation] }) }) }));
    mocks.db.insert.mockImplementation(() => returning(createdConversation));
    mocks.db.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [createdConversation] }) }) }));
  });

  it("locks and validates a supplied connection before creating or changing a conversation", async () => {
    const storage = new DatabaseStorage();

    await storage.createConversation({ accountId: "account-1", channel: "whatsapp", connectionId: "connection-1" });
    await storage.updateConversation("conversation-1", "account-1", { connectionId: "connection-1" } as any);

    expect(mocks.db.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.execute).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.insert).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a supplied connection that is no longer available before writing the conversation", async () => {
    mocks.transaction.select.mockImplementation(() => availableConnection([]));
    const storage = new DatabaseStorage();

    await expect(storage.createConversation({ accountId: "account-1", channel: "whatsapp", connectionId: "missing-connection" }))
      .rejects.toThrow("Conexão WhatsApp não está disponível para conversas");
    await expect(storage.updateConversation("conversation-1", "account-1", { connectionId: "missing-connection" } as any))
      .rejects.toThrow("Conexão WhatsApp não está disponível para conversas");

    expect(mocks.transaction.insert).not.toHaveBeenCalled();
    expect(mocks.transaction.update).not.toHaveBeenCalled();
  });
});

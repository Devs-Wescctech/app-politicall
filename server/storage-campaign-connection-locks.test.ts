import { beforeEach, describe, expect, it, vi } from "vitest";

const campaign = {
  id: "campaign-1",
  accountId: "account-1",
  userId: "user-1",
  name: "Campaign",
  type: "whatsapp",
  message: "Hello",
  recipients: [],
  status: "rascunho",
  sendConfig: { waConnectionId: "connection-1" },
};

const mocks = vi.hoisted(() => {
  const transaction = { execute: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn() };
  return {
    transaction,
    db: { transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) },
  };
});

vi.mock("./db", () => ({ db: mocks.db }));

import { DatabaseStorage } from "./storage";

function connection(rows: unknown[]) {
  return { from: () => ({ where: async () => rows }) };
}

describe("campaign connection lifecycle locking", () => {
  beforeEach(() => {
    mocks.db.transaction.mockClear();
    mocks.transaction.execute.mockReset();
    mocks.transaction.select.mockReset();
    mocks.transaction.insert.mockReset();
    mocks.transaction.update.mockReset();
    mocks.transaction.execute.mockResolvedValue([]);
    mocks.transaction.select.mockImplementation(() => connection([{ id: "connection-1", status: "connected" }]));
    mocks.transaction.insert.mockImplementation(() => ({ values: () => ({ returning: async () => [campaign] }) }));
    mocks.transaction.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [campaign] }) }) }));
  });

  it("locks and validates the selected connection before creating and updating campaigns", async () => {
    const storage = new DatabaseStorage();

    await storage.createCampaign(campaign as any);
    await storage.updateCampaign("campaign-1", "account-1", { sendConfig: { waConnectionId: "connection-1" } } as any);

    expect(mocks.db.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.execute).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.insert).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[]],
    [[{ id: "connection-1", status: "disabled" }]],
  ])("rejects missing or disabled campaign connections", async (rows) => {
    mocks.transaction.select.mockImplementation(() => connection(rows));
    const storage = new DatabaseStorage();

    await expect(storage.createCampaign(campaign as any)).rejects.toThrow("Conexão WhatsApp não está disponível para campanhas");
    await expect(storage.updateCampaign("campaign-1", "account-1", { sendConfig: { waConnectionId: "connection-1" } } as any))
      .rejects.toThrow("Conexão WhatsApp não está disponível para campanhas");

    expect(mocks.transaction.insert).not.toHaveBeenCalled();
    expect(mocks.transaction.update).not.toHaveBeenCalled();
  });
});

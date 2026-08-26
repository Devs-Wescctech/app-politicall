import { describe, expect, it, vi } from "vitest";
import { AllianceLineError, createAllianceLineService } from "./alliance-line-service";

const line = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "account-a",
  createdByUserId: "user-a",
  name: "Frente Popular",
  description: null,
  color: "#14B8A6",
  icon: "Flag",
  displayOrder: 0,
  active: true,
  createdAt: new Date("2026-08-12T12:00:00.000Z"),
  updatedAt: new Date("2026-08-12T12:00:00.000Z"),
  ...overrides,
});

function store(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(async () => [line()]),
    findById: vi.fn(async (accountId: string, id: string) => id === line().id && accountId === "account-a" ? line() : undefined),
    findByName: vi.fn(async () => undefined),
    create: vi.fn(async (input) => line(input)),
    update: vi.fn(async (_accountId: string, id: string, input) => line({ id, ...input })),
    reorder: vi.fn(async () => undefined),
    countAlliances: vi.fn(async () => 0),
    delete: vi.fn(async () => true),
    ...overrides,
  };
}

describe("alliance line service", () => {
  it("lists only active lines by default and can include inactive lines", async () => {
    const database = store();
    const service = createAllianceLineService(database);

    await service.list({ accountId: "account-a" });
    await service.list({ accountId: "account-a", includeInactive: true });

    expect(database.list).toHaveBeenNthCalledWith(1, "account-a", false);
    expect(database.list).toHaveBeenNthCalledWith(2, "account-a", true);
  });

  it("rejects duplicate names without relying on their letter case", async () => {
    const database = store({ findByName: vi.fn(async () => line({ name: "FRENTE POPULAR" })) });
    const service = createAllianceLineService(database);

    await expect(service.create({
      accountId: "account-a", userId: "user-a", data: { name: "Frente Popular", color: "#14B8A6", icon: "Flag", displayOrder: 0, active: true },
    })).rejects.toMatchObject({ code: "ALLIANCE_LINE_DUPLICATE" });
    expect(database.create).not.toHaveBeenCalled();
  });

  it("does not update a line outside the authenticated cabinet", async () => {
    const database = store({ findById: vi.fn(async () => undefined) });
    const service = createAllianceLineService(database);

    await expect(service.update({ accountId: "account-a", id: "22222222-2222-4222-8222-222222222222", data: { active: false } }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_NOT_FOUND" });
    expect(database.update).not.toHaveBeenCalled();
  });

  it("persists null when clearing an existing description", async () => {
    const database = store();
    const service = createAllianceLineService(database);

    await service.update({ accountId: "account-a", id: line().id, data: { description: null } });

    expect(database.update).toHaveBeenCalledWith("account-a", line().id, { description: null });
  });

  it("rejects duplicate IDs before delegating complete-set validation to the transaction", async () => {
    const first = line();
    const second = line({ id: "22222222-2222-4222-8222-222222222222", displayOrder: 1 });
    const database = store({
      reorder: vi.fn(async (_accountId: string, ids: string[]) => {
        if (ids.length !== 2) throw new AllianceLineError("ALLIANCE_LINE_REORDER_INVALID", "Conjunto incompleto");
      }),
    });
    const service = createAllianceLineService(database);

    await expect(service.reorder({ accountId: "account-a", ids: [first.id, first.id] }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_REORDER_INVALID" });
    await expect(service.reorder({ accountId: "account-a", ids: [first.id] }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_REORDER_INVALID" });
    await service.reorder({ accountId: "account-a", ids: [second.id, first.id] });

    expect(database.reorder).toHaveBeenNthCalledWith(1, "account-a", [first.id]);
    expect(database.reorder).toHaveBeenNthCalledWith(2, "account-a", [second.id, first.id]);
  });

  it("prevents deleting a line that is still used by an alliance", async () => {
    const database = store({ countAlliances: vi.fn(async () => 1) });
    const service = createAllianceLineService(database);

    await expect(service.delete({ accountId: "account-a", id: line().id }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_IN_USE" });
    expect(database.delete).not.toHaveBeenCalled();
  });

  it.each(["23503", "23001"])("maps PostgreSQL %s delete races to an in-use line", async (code) => {
    const database = store({
      countAlliances: vi.fn(async () => 0),
      delete: vi.fn(async () => { throw { code }; }),
    });
    const service = createAllianceLineService(database);

    await expect(service.delete({ accountId: "account-a", id: line().id }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_IN_USE" });
  });

  it("accepts a null legacy line but rejects inactive or external selected lines", async () => {
    const database = store();
    const service = createAllianceLineService(database);

    await expect(service.assertAssignable({ accountId: "account-a", lineId: null })).resolves.toBeUndefined();
    await expect(service.assertAssignable({ accountId: "account-a", lineId: "outside" }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_INVALID" });

    database.findById.mockResolvedValueOnce(line({ active: false }));
    await expect(service.assertAssignable({ accountId: "account-a", lineId: line().id }))
      .rejects.toMatchObject({ code: "ALLIANCE_LINE_INVALID" });
  });

  it("exposes stable typed errors", () => {
    expect(new AllianceLineError("ALLIANCE_LINE_NOT_FOUND", "Linha nao encontrada")).toBeInstanceOf(Error);
  });
});


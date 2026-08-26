import type { AllianceLine, InsertAllianceLine, UpdateAllianceLine } from "@shared/schema";

export type AllianceLineErrorCode =
  | "ALLIANCE_LINE_DUPLICATE"
  | "ALLIANCE_LINE_NOT_FOUND"
  | "ALLIANCE_LINE_REORDER_INVALID"
  | "ALLIANCE_LINE_IN_USE"
  | "ALLIANCE_LINE_INVALID";

export class AllianceLineError extends Error {
  constructor(readonly code: AllianceLineErrorCode, message: string) {
    super(message);
    this.name = "AllianceLineError";
  }
}

export interface AllianceLineStore {
  list(accountId: string, includeInactive: boolean): Promise<AllianceLine[]>;
  findById(accountId: string, id: string): Promise<AllianceLine | undefined>;
  findByName(accountId: string, name: string): Promise<AllianceLine | undefined>;
  create(input: { accountId: string; userId: string; data: InsertAllianceLine }): Promise<AllianceLine>;
  update(accountId: string, id: string, data: UpdateAllianceLine): Promise<AllianceLine | undefined>;
  reorder(accountId: string, ids: string[]): Promise<void>;
  countAlliances(accountId: string, lineId: string): Promise<number>;
  delete(accountId: string, id: string): Promise<boolean>;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

export function createAllianceLineService(store: AllianceLineStore) {
  async function requireLine(accountId: string, id: string): Promise<AllianceLine> {
    const found = await store.findById(accountId, id);
    if (!found) throw new AllianceLineError("ALLIANCE_LINE_NOT_FOUND", "Linha politica nao encontrada");
    return found;
  }

  return {
    list: ({ accountId, includeInactive = false }: { accountId: string; includeInactive?: boolean }) => store.list(accountId, includeInactive),

    async create(input: { accountId: string; userId: string; data: InsertAllianceLine }): Promise<AllianceLine> {
      const existing = await store.findByName(input.accountId, input.data.name);
      if (existing) throw new AllianceLineError("ALLIANCE_LINE_DUPLICATE", "Ja existe uma linha politica com este nome");
      try {
        return await store.create(input);
      } catch (error) {
        if (isDatabaseError(error, "23505")) {
          throw new AllianceLineError("ALLIANCE_LINE_DUPLICATE", "Ja existe uma linha politica com este nome");
        }
        throw error;
      }
    },

    async update(input: { accountId: string; id: string; data: UpdateAllianceLine }): Promise<AllianceLine> {
      await requireLine(input.accountId, input.id);
      if (input.data.name) {
        const existing = await store.findByName(input.accountId, input.data.name);
        if (existing && existing.id !== input.id) {
          throw new AllianceLineError("ALLIANCE_LINE_DUPLICATE", "Ja existe uma linha politica com este nome");
        }
      }
      try {
        const updated = await store.update(input.accountId, input.id, input.data);
        if (!updated) throw new AllianceLineError("ALLIANCE_LINE_NOT_FOUND", "Linha politica nao encontrada");
        return updated;
      } catch (error) {
        if (isDatabaseError(error, "23505")) {
          throw new AllianceLineError("ALLIANCE_LINE_DUPLICATE", "Ja existe uma linha politica com este nome");
        }
        throw error;
      }
    },

    async reorder(input: { accountId: string; ids: string[] }): Promise<void> {
      if (input.ids.length === 0 || new Set(input.ids).size !== input.ids.length) {
        throw new AllianceLineError("ALLIANCE_LINE_REORDER_INVALID", "A ordem das linhas politicas e invalida");
      }
      await store.reorder(input.accountId, input.ids);
    },

    async delete(input: { accountId: string; id: string }): Promise<void> {
      await requireLine(input.accountId, input.id);
      if (await store.countAlliances(input.accountId, input.id)) {
        throw new AllianceLineError("ALLIANCE_LINE_IN_USE", "A linha politica possui aliancas vinculadas");
      }
      try {
        if (!await store.delete(input.accountId, input.id)) {
          throw new AllianceLineError("ALLIANCE_LINE_NOT_FOUND", "Linha politica nao encontrada");
        }
      } catch (error) {
        if (isDatabaseError(error, "23503") || isDatabaseError(error, "23001")) {
          throw new AllianceLineError("ALLIANCE_LINE_IN_USE", "A linha politica possui aliancas vinculadas");
        }
        throw error;
      }
    },

    async assertAssignable(input: { accountId: string; lineId: string | null | undefined }): Promise<void> {
      if (input.lineId == null) return;
      const found = await store.findById(input.accountId, input.lineId);
      if (!found || !found.active) {
        throw new AllianceLineError("ALLIANCE_LINE_INVALID", "A linha politica selecionada nao esta disponivel neste gabinete");
      }
    },
  };
}

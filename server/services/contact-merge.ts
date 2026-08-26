import { createHash } from "node:crypto";
import { groupDuplicateContacts, type DuplicateGroup } from "./contact-deduplication-domain";

export type ContactRelationName = "demands" | "events" | "conversations" | "messages" | "campaignRecipients" | "petitionSignatures" | "contactListMembers" | "contactLabels";
export type ContactRelationIds = Record<ContactRelationName, string[]>;

export interface MergeContactRecord {
  id: string;
  accountId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  interests?: string[] | null;
  mergedIntoContactId?: string | null;
  updatedAt: Date | string;
  [key: string]: unknown;
}

export interface ContactMergeEventRecord {
  id: string;
  accountId?: string;
  sourceContactId: string;
  targetContactId: string;
  status: string;
  movedRelations?: Partial<ContactRelationIds>;
}

export interface ContactMergeStore {
  getContacts(accountId: string, ids?: string[]): Promise<MergeContactRecord[]>;
  getRelationIds(accountId: string, contactId: string): Promise<ContactRelationIds>;
  commitMerge(input: {
    accountId: string;
    userId: string;
    sourceContactIds: string[];
    targetContactId: string;
    resolvedContact: Record<string, unknown>;
    previewToken: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<ContactMergeEventRecord[]>;
  getMergeEvent(accountId: string, mergeId: string): Promise<ContactMergeEventRecord | undefined>;
  commitRevert(input: { accountId: string; userId: string; mergeId: string }): Promise<ContactMergeEventRecord>;
  listMergeEvents(accountId: string): Promise<ContactMergeEventRecord[]>;
}

export class ContactMergeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ContactMergeError";
  }
}

const conflictFields = ["name", "email", "phone", "city", "state", "interests"] as const;

function comparable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  return String(value ?? "").trim().toLowerCase();
}

export function buildContactMergePreviewToken(contacts: MergeContactRecord[]): string {
  const state = contacts.map((contact) => ({
    id: contact.id,
    updatedAt: new Date(contact.updatedAt).toISOString(),
    mergedIntoContactId: contact.mergedIntoContactId ?? null,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function emptyCounts(): Record<ContactRelationName, number> {
  return { demands: 0, events: 0, conversations: 0, messages: 0, campaignRecipients: 0, petitionSignatures: 0, contactListMembers: 0, contactLabels: 0 };
}

function validateContacts(accountId: string, sourceContactIds: string[], targetContactId: string, contacts: MergeContactRecord[]): void {
  if (sourceContactIds.length === 0 || sourceContactIds.length > 10 || new Set(sourceContactIds).size !== sourceContactIds.length || sourceContactIds.includes(targetContactId)) {
    throw new ContactMergeError("CONTACT_MERGE_INVALID", "Selecao de contatos invalida");
  }
  const requested = new Set([...sourceContactIds, targetContactId]);
  if (contacts.length !== requested.size || contacts.some((contact) => contact.accountId !== accountId || !requested.has(contact.id))) {
    throw new ContactMergeError("CONTACT_MERGE_INVALID", "Contato ausente ou fora da conta");
  }
  if (contacts.some((contact) => contact.mergedIntoContactId)) {
    throw new ContactMergeError("CONTACT_MERGE_CONFLICT", "Um dos contatos ja foi mesclado");
  }
}

export function createContactMergeService(store: ContactMergeStore) {
  async function preview(input: { accountId: string; sourceContactIds: string[]; targetContactId: string }) {
    const ids = [...input.sourceContactIds, input.targetContactId];
    const contacts = await store.getContacts(input.accountId, ids);
    validateContacts(input.accountId, input.sourceContactIds, input.targetContactId, contacts);
    const target = contacts.find((contact) => contact.id === input.targetContactId)!;
    const sources = input.sourceContactIds.map((id) => contacts.find((contact) => contact.id === id)!);
    const conflicts = conflictFields.flatMap((field) => {
      const values = [target, ...sources].map((contact) => contact[field]);
      const distinct = new Set(values.map(comparable));
      return distinct.size > 1 ? [{ field, values: Object.fromEntries([target, ...sources].map((contact) => [contact.id, contact[field] ?? null])) }] : [];
    });
    const relationCounts = emptyCounts();
    for (const source of sources) {
      const relations = await store.getRelationIds(input.accountId, source.id);
      for (const name of Object.keys(relationCounts) as ContactRelationName[]) relationCounts[name] += relations[name].length;
    }
    return { token: buildContactMergePreviewToken(contacts), target, sources, conflicts, relationCounts };
  }

  return {
    preview,
    async duplicates(accountId: string): Promise<DuplicateGroup[]> {
      return groupDuplicateContacts(await store.getContacts(accountId));
    },
    async merge(input: { accountId: string; userId: string; sourceContactIds: string[]; targetContactId: string; previewToken: string; resolvedContact: Record<string, unknown>; ipAddress?: string | null; userAgent?: string | null }) {
      const current = await preview(input);
      if (current.token !== input.previewToken) throw new ContactMergeError("CONTACT_MERGE_STALE", "A previsualizacao esta desatualizada");
      return store.commitMerge(input);
    },
    async revert(input: { accountId: string; userId: string; mergeId: string }) {
      const event = await store.getMergeEvent(input.accountId, input.mergeId);
      if (!event || event.accountId !== input.accountId) throw new ContactMergeError("CONTACT_MERGE_NOT_FOUND", "Mesclagem nao encontrada");
      if (event.status !== "completed") throw new ContactMergeError("CONTACT_MERGE_REVERT_FORBIDDEN", "Mesclagem nao pode ser desfeita");
      return store.commitRevert(input);
    },
    listMerges: (accountId: string) => store.listMergeEvents(accountId),
  };
}

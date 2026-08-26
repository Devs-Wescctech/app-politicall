import { describe, expect, it, vi } from "vitest";
import { ContactMergeError, createContactMergeService, type ContactMergeStore } from "./contact-merge";

const contacts = [
  { id: "source", accountId: "account", name: "Maria", email: "old@example.com", phone: "51999990000", city: null, state: "RS", interests: ["Saude"], mergedIntoContactId: null, updatedAt: new Date("2026-01-01") },
  { id: "target", accountId: "account", name: "Maria Silva", email: "new@example.com", phone: "51999990000", city: "Porto Alegre", state: "RS", interests: ["Educacao"], mergedIntoContactId: null, updatedAt: new Date("2026-01-02") },
];

function store(overrides: Partial<ContactMergeStore> = {}): ContactMergeStore {
  return {
    getContacts: vi.fn(async () => contacts),
    getRelationIds: vi.fn(async () => ({ demands: ["d1"], events: [], conversations: ["c1", "c2"], messages: [], campaignRecipients: [], petitionSignatures: [], contactListMembers: [], contactLabels: [] })),
    commitMerge: vi.fn(async () => [{ id: "merge-1", sourceContactId: "source", targetContactId: "target", status: "completed" }]),
    getMergeEvent: vi.fn(async () => ({ id: "merge-1", accountId: "account", sourceContactId: "source", targetContactId: "target", status: "completed", movedRelations: { demands: ["d1"] } })),
    commitRevert: vi.fn(async () => ({ id: "merge-1", status: "reverted" })),
    listMergeEvents: vi.fn(async () => []),
    ...overrides,
  };
}

describe("contact merge service", () => {
  it("builds a preview with conflicts, counts and a stable token", async () => {
    const service = createContactMergeService(store());
    const first = await service.preview({ accountId: "account", sourceContactIds: ["source"], targetContactId: "target" });
    const second = await service.preview({ accountId: "account", sourceContactIds: ["source"], targetContactId: "target" });

    expect(first.token).toBe(second.token);
    expect(first.conflicts.map((conflict) => conflict.field)).toEqual(["name", "email", "city", "interests"]);
    expect(first.relationCounts).toMatchObject({ demands: 1, conversations: 2 });
  });

  it("rejects contacts from another account", async () => {
    const service = createContactMergeService(store({ getContacts: vi.fn(async () => [contacts[0]]) }));
    await expect(service.preview({ accountId: "account", sourceContactIds: ["source"], targetContactId: "target" }))
      .rejects.toMatchObject({ code: "CONTACT_MERGE_INVALID" });
  });

  it("rejects a stale preview token before committing", async () => {
    const mergeStore = store();
    const service = createContactMergeService(mergeStore);
    await expect(service.merge({ accountId: "account", userId: "user", sourceContactIds: ["source"], targetContactId: "target", previewToken: "stale", resolvedContact: { name: "Maria Silva" } }))
      .rejects.toMatchObject({ code: "CONTACT_MERGE_STALE" });
    expect(mergeStore.commitMerge).not.toHaveBeenCalled();
  });

  it("commits the exact preview plan after confirmation", async () => {
    const mergeStore = store();
    const service = createContactMergeService(mergeStore);
    const preview = await service.preview({ accountId: "account", sourceContactIds: ["source"], targetContactId: "target" });
    const result = await service.merge({ accountId: "account", userId: "user", sourceContactIds: ["source"], targetContactId: "target", previewToken: preview.token, resolvedContact: { name: "Maria Silva", interests: ["Saude", "Educacao"] } });

    expect(result[0].id).toBe("merge-1");
    expect(mergeStore.commitMerge).toHaveBeenCalledTimes(1);
  });

  it("reverts only a completed merge from the same account", async () => {
    const mergeStore = store();
    const service = createContactMergeService(mergeStore);
    await expect(service.revert({ accountId: "other", userId: "user", mergeId: "merge-1" }))
      .rejects.toBeInstanceOf(ContactMergeError);
    await expect(service.revert({ accountId: "account", userId: "user", mergeId: "merge-1" }))
      .resolves.toMatchObject({ status: "reverted" });
  });
});

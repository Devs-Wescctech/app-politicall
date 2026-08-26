import { describe, expect, it, vi } from "vitest";
import { buildContactMergePreviewToken } from "./contact-merge";
import { CONTACT_MERGE_RELATIONS, createPostgresContactMergeStore, sanitizeResolvedContact } from "./contact-merge-store";

describe("contact merge store contract", () => {
  it("covers every contact relationship preserved by a merge", () => {
    expect(CONTACT_MERGE_RELATIONS.map((relation) => relation.name)).toEqual([
      "demands", "events", "conversations", "messages", "campaignRecipients",
      "petitionSignatures", "contactListMembers", "contactLabels",
    ]);
    expect(CONTACT_MERGE_RELATIONS.every((relation) => relation.contactColumn === "contact_id")).toBe(true);
  });

  it("allows only editable contact fields in conflict resolution", () => {
    expect(sanitizeResolvedContact({
      name: "Maria Silva",
      email: "maria@example.com",
      interests: ["Saude"],
      accountId: "other",
      mergedIntoContactId: "attacker",
    })).toEqual({ name: "Maria Silva", email: "maria@example.com", interests: ["Saude"] });
  });

  it("blocks moving a principal with an active previous merge", async () => {
    const rows = [
      { id: "source", account_id: "account", name: "Maria", merged_into_contact_id: null, updated_at: new Date("2026-01-01") },
      { id: "target", account_id: "account", name: "Maria Silva", merged_into_contact_id: null, updated_at: new Date("2026-01-02") },
    ];
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM contacts")) return { rows };
      if (sql.startsWith("SELECT id FROM contact_merge_events")) return { rows: [{ id: "older-merge" }] };
      return { rows: [] };
    });
    const store = createPostgresContactMergeStore({ connect: async () => ({ query, release: vi.fn() }) });

    await expect(store.commitMerge({
      accountId: "account",
      userId: "user",
      sourceContactIds: ["source"],
      targetContactId: "target",
      resolvedContact: {},
      previewToken: buildContactMergePreviewToken(rows.map((row) => ({ id: row.id, accountId: row.account_id, name: row.name, mergedIntoContactId: null, updatedAt: row.updated_at }))),
    })).rejects.toMatchObject({ code: "CONTACT_MERGE_CONFLICT" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("blocks reverting after the target was merged again", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM contact_merge_events")) return { rows: [{ id: "merge", account_id: "account", source_contact_id: "source", target_contact_id: "target", status: "completed" }] };
      if (sql.startsWith("SELECT * FROM contacts")) return { rows: [
        { id: "source", merged_into_contact_id: "target" },
        { id: "target", merged_into_contact_id: "new-target" },
      ] };
      return { rows: [] };
    });
    const store = createPostgresContactMergeStore({ connect: async () => ({ query, release: vi.fn() }) });

    await expect(store.commitRevert({ accountId: "account", userId: "user", mergeId: "merge" }))
      .rejects.toMatchObject({ code: "CONTACT_MERGE_REVERT_FORBIDDEN" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});

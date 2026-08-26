import {
  buildContactMergePreviewToken,
  ContactMergeError,
  type ContactMergeEventRecord,
  type ContactMergeStore,
  type ContactRelationIds,
  type ContactRelationName,
  type MergeContactRecord,
} from "./contact-merge";

type QueryResult = { rows: any[] };
type QueryClient = { query(sql: string, parameters?: unknown[]): Promise<QueryResult>; release?: () => void };
type QueryPool = { connect(): Promise<QueryClient> };

export const CONTACT_MERGE_RELATIONS: Array<{
  name: ContactRelationName;
  table: string;
  contactColumn: "contact_id";
  accountScoped: boolean;
}> = [
  { name: "demands", table: "demands", contactColumn: "contact_id", accountScoped: true },
  { name: "events", table: "events", contactColumn: "contact_id", accountScoped: true },
  { name: "conversations", table: "att_conversations", contactColumn: "contact_id", accountScoped: true },
  { name: "messages", table: "att_messages", contactColumn: "contact_id", accountScoped: true },
  { name: "campaignRecipients", table: "campaign_recipients", contactColumn: "contact_id", accountScoped: true },
  { name: "petitionSignatures", table: "petition_signatures", contactColumn: "contact_id", accountScoped: false },
  { name: "contactListMembers", table: "contact_list_members", contactColumn: "contact_id", accountScoped: true },
  { name: "contactLabels", table: "att_contact_labels", contactColumn: "contact_id", accountScoped: true },
];

const editableFields = ["name", "email", "phone", "age", "gender", "state", "city", "neighborhood", "interests", "source", "notes"] as const;
const databaseFields: Record<(typeof editableFields)[number], string> = {
  name: "name", email: "email", phone: "phone", age: "age", gender: "gender",
  state: "state", city: "city", neighborhood: "neighborhood", interests: "interests",
  source: "source", notes: "notes",
};

export function sanitizeResolvedContact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(editableFields.filter((field) => Object.prototype.hasOwnProperty.call(input, field)).map((field) => [field, input[field]]));
}

function mapContact(row: any): MergeContactRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    age: row.age,
    gender: row.gender,
    state: row.state,
    city: row.city,
    neighborhood: row.neighborhood,
    interests: row.interests,
    source: row.source,
    notes: row.notes,
    mergedIntoContactId: row.merged_into_contact_id,
    mergedAt: row.merged_at,
    mergedByUserId: row.merged_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: any): ContactMergeEventRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    sourceContactId: row.source_contact_id,
    targetContactId: row.target_contact_id,
    status: row.status,
    movedRelations: row.moved_relations,
    sourceSnapshot: row.source_snapshot,
    targetSnapshot: row.target_snapshot,
    conflictResolution: row.conflict_resolution,
    createdAt: row.created_at,
    revertedAt: row.reverted_at,
  } as ContactMergeEventRecord;
}

async function getRelationIds(client: QueryClient, accountId: string, contactId: string): Promise<ContactRelationIds> {
  const output = {} as ContactRelationIds;
  for (const relation of CONTACT_MERGE_RELATIONS) {
    const result = relation.name === "petitionSignatures"
      ? await client.query(`SELECT signature.id FROM petition_signatures signature INNER JOIN petitions petition ON petition.id = signature.petition_id WHERE petition.account_id = $1 AND signature.contact_id = $2`, [accountId, contactId])
      : await client.query(`SELECT id FROM ${relation.table} WHERE account_id = $1 AND contact_id = $2`, [accountId, contactId]);
    output[relation.name] = result.rows.map((row) => row.id);
  }
  return output;
}

async function moveRelationIds(client: QueryClient, accountId: string, sourceId: string, targetId: string, relations: ContactRelationIds): Promise<void> {
  for (const relation of CONTACT_MERGE_RELATIONS) {
    const ids = relations[relation.name];
    if (ids.length === 0) continue;
    const accountClause = relation.accountScoped ? " AND account_id = $4" : "";
    const parameters = relation.accountScoped ? [targetId, ids, sourceId, accountId] : [targetId, ids, sourceId];
    await client.query(`UPDATE ${relation.table} SET contact_id = $1 WHERE id = ANY($2::varchar[]) AND contact_id = $3${accountClause}`, parameters);
  }
}

async function restoreRelationIds(client: QueryClient, accountId: string, sourceId: string, targetId: string, relations: Partial<ContactRelationIds>): Promise<void> {
  for (const relation of CONTACT_MERGE_RELATIONS) {
    const ids = relations[relation.name] ?? [];
    if (ids.length === 0) continue;
    const accountClause = relation.accountScoped ? " AND account_id = $4" : "";
    const parameters = relation.accountScoped ? [sourceId, ids, targetId, accountId] : [sourceId, ids, targetId];
    await client.query(`UPDATE ${relation.table} SET contact_id = $1 WHERE id = ANY($2::varchar[]) AND contact_id = $3${accountClause}`, parameters);
  }
}

async function updateResolvedContact(client: QueryClient, accountId: string, contactId: string, resolved: Record<string, unknown>): Promise<void> {
  const safe = sanitizeResolvedContact(resolved);
  const entries = Object.entries(safe);
  if (entries.length === 0) return;
  const assignments = entries.map(([field], index) => `${databaseFields[field as keyof typeof databaseFields]} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(accountId, contactId);
  await client.query(`UPDATE contacts SET ${assignments.join(", ")}, normalized_name = lower(trim(name)), updated_at = now() WHERE account_id = $${entries.length + 1} AND id = $${entries.length + 2}`, values);
}

export function createPostgresContactMergeStore(pool: QueryPool): ContactMergeStore {
  return {
    async getContacts(accountId, ids) {
      const client = await pool.connect();
      try {
        const result = ids
          ? await client.query("SELECT * FROM contacts WHERE account_id = $1 AND id = ANY($2::varchar[]) ORDER BY id", [accountId, ids])
          : await client.query("SELECT * FROM contacts WHERE account_id = $1 AND merged_into_contact_id IS NULL ORDER BY created_at DESC", [accountId]);
        return result.rows.map(mapContact);
      } finally { client.release?.(); }
    },
    async getRelationIds(accountId, contactId) {
      const client = await pool.connect();
      try { return await getRelationIds(client, accountId, contactId); }
      finally { client.release?.(); }
    },
    async commitMerge(input) {
      const client = await pool.connect();
      await client.query("BEGIN");
      try {
        const ids = [...input.sourceContactIds, input.targetContactId];
        const locked = await client.query("SELECT * FROM contacts WHERE account_id = $1 AND id = ANY($2::varchar[]) ORDER BY id FOR UPDATE", [input.accountId, ids]);
        const contacts = locked.rows.map(mapContact);
        if (contacts.length !== ids.length || contacts.some((contact) => contact.mergedIntoContactId)) throw new ContactMergeError("CONTACT_MERGE_CONFLICT", "Contatos alterados durante a mesclagem");
        const chained = await client.query("SELECT id FROM contact_merge_events WHERE account_id = $1 AND target_contact_id = ANY($2::varchar[]) AND status = 'completed' LIMIT 1", [input.accountId, input.sourceContactIds]);
        if (chained.rows.length > 0) throw new ContactMergeError("CONTACT_MERGE_CONFLICT", "Desfaca a mesclagem anterior antes de mover este cadastro principal");
        if (buildContactMergePreviewToken(contacts) !== input.previewToken) throw new ContactMergeError("CONTACT_MERGE_STALE", "A previsualizacao esta desatualizada");
        const target = contacts.find((contact) => contact.id === input.targetContactId)!;
        await updateResolvedContact(client, input.accountId, target.id, input.resolvedContact);
        const events: ContactMergeEventRecord[] = [];
        for (const sourceId of input.sourceContactIds) {
          const source = contacts.find((contact) => contact.id === sourceId)!;
          const relations = await getRelationIds(client, input.accountId, sourceId);
          await moveRelationIds(client, input.accountId, sourceId, target.id, relations);
          await client.query("UPDATE contacts SET merged_into_contact_id = $1, merged_at = now(), merged_by_user_id = $2, updated_at = now() WHERE account_id = $3 AND id = $4", [target.id, input.userId, input.accountId, sourceId]);
          const inserted = await client.query(`INSERT INTO contact_merge_events (account_id, source_contact_id, target_contact_id, user_id, source_snapshot, target_snapshot, moved_relations, conflict_resolution, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`, [input.accountId, sourceId, target.id, input.userId, JSON.stringify(source), JSON.stringify(target), JSON.stringify(relations), JSON.stringify(sanitizeResolvedContact(input.resolvedContact)), input.ipAddress ?? null, input.userAgent ?? null]);
          events.push(mapEvent(inserted.rows[0]));
        }
        await client.query("COMMIT");
        return events;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release?.(); }
    },
    async getMergeEvent(accountId, mergeId) {
      const client = await pool.connect();
      try {
        const result = await client.query("SELECT * FROM contact_merge_events WHERE account_id = $1 AND id = $2", [accountId, mergeId]);
        return result.rows[0] ? mapEvent(result.rows[0]) : undefined;
      } finally { client.release?.(); }
    },
    async commitRevert(input) {
      const client = await pool.connect();
      await client.query("BEGIN");
      try {
        const result = await client.query("SELECT * FROM contact_merge_events WHERE account_id = $1 AND id = $2 FOR UPDATE", [input.accountId, input.mergeId]);
        const row = result.rows[0];
        if (!row) throw new ContactMergeError("CONTACT_MERGE_NOT_FOUND", "Mesclagem nao encontrada");
        if (row.status !== "completed") throw new ContactMergeError("CONTACT_MERGE_REVERT_FORBIDDEN", "Mesclagem ja desfeita");
        const contactsResult = await client.query("SELECT * FROM contacts WHERE account_id = $1 AND id = ANY($2::varchar[]) FOR UPDATE", [input.accountId, [row.source_contact_id, row.target_contact_id]]);
        const source = contactsResult.rows.find((contact) => contact.id === row.source_contact_id);
        const target = contactsResult.rows.find((contact) => contact.id === row.target_contact_id);
        if (!source || source.merged_into_contact_id !== row.target_contact_id || !target || target.merged_into_contact_id) throw new ContactMergeError("CONTACT_MERGE_REVERT_FORBIDDEN", "Contato possui uma mesclagem posterior incompativel");
        await restoreRelationIds(client, input.accountId, row.source_contact_id, row.target_contact_id, row.moved_relations ?? {});
        await updateResolvedContact(client, input.accountId, row.source_contact_id, row.source_snapshot ?? {});
        await client.query("UPDATE contacts SET merged_into_contact_id = NULL, merged_at = NULL, merged_by_user_id = NULL, updated_at = now() WHERE account_id = $1 AND id = $2", [input.accountId, row.source_contact_id]);
        const updated = await client.query("UPDATE contact_merge_events SET status = 'reverted', reverted_at = now(), reverted_by_user_id = $1 WHERE account_id = $2 AND id = $3 RETURNING *", [input.userId, input.accountId, input.mergeId]);
        await client.query("COMMIT");
        return mapEvent(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release?.(); }
    },
    async listMergeEvents(accountId) {
      const client = await pool.connect();
      try {
        const result = await client.query("SELECT * FROM contact_merge_events WHERE account_id = $1 ORDER BY created_at DESC LIMIT 100", [accountId]);
        return result.rows.map(mapEvent);
      } finally { client.release?.(); }
    },
  };
}

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_into_contact_id varchar;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_at timestamp;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_by_user_id varchar;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

ALTER TABLE contacts
  ADD CONSTRAINT contacts_merged_into_contact_id_fkey
  FOREIGN KEY (merged_into_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_merged_by_user_id_fkey
  FOREIGN KEY (merged_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_account_active_idx
  ON contacts(account_id, merged_into_contact_id);

ALTER TABLE att_conversations ADD COLUMN IF NOT EXISTS inbound_connection_name text;
ALTER TABLE att_conversations ADD COLUMN IF NOT EXISTS inbound_number text;

UPDATE att_conversations conversation
SET
  inbound_connection_name = coalesce(conversation.inbound_connection_name, connection.name),
  inbound_number = coalesce(
    conversation.inbound_number,
    nullif(connection.metadata ->> 'phoneNumber', ''),
    nullif(connection.metadata ->> 'whatsappPhoneNumber', ''),
    nullif(connection.metadata ->> 'number', ''),
    nullif(connection.metadata ->> 'identifier', '')
  )
FROM channel_connections connection
WHERE conversation.connection_id = connection.id
  AND conversation.account_id = connection.account_id
  AND (conversation.inbound_connection_name IS NULL OR conversation.inbound_number IS NULL);

CREATE TABLE IF NOT EXISTS contact_merge_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  target_contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'completed',
  source_snapshot jsonb NOT NULL,
  target_snapshot jsonb NOT NULL,
  moved_relations jsonb NOT NULL,
  conflict_resolution jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),
  reverted_at timestamp,
  reverted_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT contact_merge_events_status_check CHECK (status IN ('completed', 'reverted')),
  CONSTRAINT contact_merge_events_distinct_contacts_check CHECK (source_contact_id <> target_contact_id)
);

CREATE INDEX IF NOT EXISTS contact_merge_events_account_created_idx
  ON contact_merge_events(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_merge_events_source_idx
  ON contact_merge_events(account_id, source_contact_id);

CREATE INDEX IF NOT EXISTS contact_merge_events_target_idx
  ON contact_merge_events(account_id, target_contact_id);

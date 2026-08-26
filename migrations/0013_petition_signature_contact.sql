ALTER TABLE petition_signatures
  ADD COLUMN IF NOT EXISTS contact_id varchar
  REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS petition_signatures_contact_idx
  ON petition_signatures(contact_id, created_at);

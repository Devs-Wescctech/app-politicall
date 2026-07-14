-- Add the neighborhood field used by CRM segmentation and dashboard queries.
-- Additive/idempotent; rollback: DROP INDEX contacts_account_neighborhood_idx;
-- then ALTER TABLE contacts DROP COLUMN neighborhood after checking dependencies.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS neighborhood text;
CREATE INDEX IF NOT EXISTS contacts_account_neighborhood_idx ON contacts(account_id, neighborhood);

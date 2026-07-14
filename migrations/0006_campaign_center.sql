-- Campaign Center schema additions.
-- Additive/idempotent migration: existing campaign and contact data is preserved.
-- Rollback (only after confirming no dependent data): drop the six new tables,
-- then drop the added marketing_campaigns columns listed below.

CREATE TABLE IF NOT EXISTS message_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  from_name text,
  from_email text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS channels text[];
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS template_id varchar REFERENCES message_templates(id) ON DELETE SET NULL;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS template_config jsonb;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS send_config jsonb;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE marketing_campaigns ALTER COLUMN status SET DEFAULT 'rascunho';

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id varchar NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  name text,
  status text DEFAULT 'pending' NOT NULL,
  error_reason text,
  provider_message_id text,
  provider_response text,
  sent_at timestamp,
  delivered_at timestamp,
  attempts integer DEFAULT 0 NOT NULL,
  last_attempt_at timestamp,
  next_retry_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id varchar NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  detail jsonb,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_exports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  campaign_id varchar REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  scope text NOT NULL,
  format text NOT NULL,
  filters jsonb,
  row_count integer,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_lists (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind text DEFAULT 'fixed' NOT NULL,
  filters jsonb,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_list_members (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  list_id varchar NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL,
  name text,
  phone text,
  email text,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS message_templates_account_idx ON message_templates(account_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_idx ON campaign_recipients(account_id, campaign_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx ON campaign_recipients(account_id, status);
CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx ON campaign_events(account_id, campaign_id, created_at);
CREATE INDEX IF NOT EXISTS campaign_exports_account_idx ON campaign_exports(account_id, created_at);
CREATE INDEX IF NOT EXISTS contact_lists_account_idx ON contact_lists(account_id);
CREATE INDEX IF NOT EXISTS contact_list_members_list_idx ON contact_list_members(account_id, list_id);

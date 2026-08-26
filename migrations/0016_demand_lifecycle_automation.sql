CREATE TABLE IF NOT EXISTS demand_attachments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  demand_id varchar NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name text NOT NULL,
  stored_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demand_attachments_account_demand_idx
  ON demand_attachments (account_id, demand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS demand_automation_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  demand_id varchar NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS demand_automation_events_once_uidx
  ON demand_automation_events (account_id, demand_id, event_type);

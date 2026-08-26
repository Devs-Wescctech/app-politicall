CREATE TABLE IF NOT EXISTS demand_destinations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('internal', 'external')),
  name text NOT NULL,
  description text,
  contact_name text,
  phone text,
  email text,
  response_deadline_hours integer NOT NULL DEFAULT 72 CHECK (response_deadline_hours BETWEEN 1 AND 8760),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS demand_destinations_name_uidx
  ON demand_destinations (account_id, kind, lower(name));
CREATE INDEX IF NOT EXISTS demand_destinations_account_active_idx
  ON demand_destinations (account_id, active, kind, name);

CREATE TABLE IF NOT EXISTS demand_forwardings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  demand_id varchar NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  destination_id varchar NOT NULL REFERENCES demand_destinations(id) ON DELETE RESTRICT,
  created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  external_protocol text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'forwarded', 'waiting', 'answered', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  sent_at timestamptz,
  due_at timestamptz,
  answered_at timestamptz,
  completed_at timestamptz,
  notes text,
  response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demand_forwardings_account_demand_idx
  ON demand_forwardings (account_id, demand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS demand_forwardings_account_destination_idx
  ON demand_forwardings (account_id, destination_id, status);
CREATE INDEX IF NOT EXISTS demand_forwardings_account_assignee_idx
  ON demand_forwardings (account_id, assignee_user_id, status);
CREATE INDEX IF NOT EXISTS demand_forwardings_account_due_idx
  ON demand_forwardings (account_id, status, due_at);

CREATE TABLE IF NOT EXISTS demand_forwarding_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  forwarding_id varchar NOT NULL REFERENCES demand_forwardings(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS demand_forwarding_events_once_uidx
  ON demand_forwarding_events (account_id, forwarding_id, event_type);

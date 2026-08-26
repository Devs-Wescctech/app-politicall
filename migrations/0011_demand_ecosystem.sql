CREATE TABLE IF NOT EXISTS demand_categories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  sla_hours integer NOT NULL DEFAULT 72 CHECK (sla_hours > 0),
  color text NOT NULL DEFAULT '#64748b',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS demand_categories_account_name_uidx ON demand_categories(account_id, name);
CREATE INDEX IF NOT EXISTS demand_categories_account_active_idx ON demand_categories(account_id, active);

CREATE TABLE IF NOT EXISTS demand_protocol_counters (
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  CONSTRAINT demand_protocol_counters_account_year_unique UNIQUE(account_id, year)
);

ALTER TABLE demands ADD COLUMN IF NOT EXISTS protocol text;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'internal';
ALTER TABLE demands ADD COLUMN IF NOT EXISTS contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';
ALTER TABLE demands ADD COLUMN IF NOT EXISTS category_id varchar REFERENCES demand_categories(id) ON DELETE SET NULL;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS assignee_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS source_id varchar;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS completed_at timestamptz;

INSERT INTO demand_categories (account_id, name, sla_hours, color)
SELECT a.id, defaults.name, defaults.sla_hours, defaults.color
FROM accounts a
CROSS JOIN (VALUES
  ('Atendimento', 24, '#0f766e'),
  ('Infraestrutura', 72, '#2563eb'),
  ('Saude', 48, '#dc2626'),
  ('Educacao', 48, '#7c3aed'),
  ('Interna', 72, '#64748b')
) AS defaults(name, sla_hours, color)
ON CONFLICT (account_id, name) DO NOTHING;

UPDATE demands d
SET category_id = c.id
FROM demand_categories c
WHERE d.category_id IS NULL AND c.account_id = d.account_id AND c.name = 'Interna';

UPDATE demands SET assignee_user_id = user_id WHERE assignee_user_id IS NULL;
UPDATE demands SET kind = 'internal' WHERE kind IS NULL;
UPDATE demands SET origin = 'manual' WHERE origin IS NULL;
UPDATE demands SET status = CASE status
  WHEN 'pending' THEN 'open'
  WHEN 'aberta' THEN 'open'
  WHEN 'em_andamento' THEN 'in_progress'
  WHEN 'concluida' THEN 'completed'
  WHEN 'in_progress' THEN 'in_progress'
  WHEN 'completed' THEN 'completed'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE status
END;
UPDATE demands SET priority = CASE priority
  WHEN 'baixa' THEN 'low'
  WHEN 'media' THEN 'medium'
  WHEN 'alta' THEN 'high'
  WHEN 'urgente' THEN 'urgent'
  ELSE priority
END;
UPDATE demands SET completed_at = COALESCE(completed_at, updated_at) WHERE status = 'completed';
UPDATE demands d SET sla_due_at = COALESCE(d.sla_due_at, d.created_at + make_interval(hours => c.sla_hours))
FROM demand_categories c WHERE d.category_id = c.id;

WITH numbered AS (
  SELECT id, account_id, EXTRACT(YEAR FROM created_at)::integer AS protocol_year,
         ROW_NUMBER() OVER (PARTITION BY account_id, EXTRACT(YEAR FROM created_at) ORDER BY created_at, id)::integer AS sequence
  FROM demands WHERE protocol IS NULL
)
UPDATE demands d SET protocol = 'DEM-' || numbered.protocol_year || '-' || LPAD(numbered.sequence::text, 6, '0')
FROM numbered WHERE d.id = numbered.id;

INSERT INTO demand_protocol_counters (account_id, year, last_value)
SELECT account_id, EXTRACT(YEAR FROM created_at)::integer, COUNT(*)::integer
FROM demands GROUP BY account_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (account_id, year) DO UPDATE SET last_value = GREATEST(demand_protocol_counters.last_value, EXCLUDED.last_value);

CREATE UNIQUE INDEX IF NOT EXISTS demands_account_protocol_uidx ON demands(account_id, protocol);
CREATE INDEX IF NOT EXISTS demands_account_status_idx ON demands(account_id, status);
CREATE INDEX IF NOT EXISTS demands_account_contact_idx ON demands(account_id, contact_id);
CREATE INDEX IF NOT EXISTS demands_account_assignee_idx ON demands(account_id, assignee_user_id);
CREATE INDEX IF NOT EXISTS demands_account_category_idx ON demands(account_id, category_id);
CREATE INDEX IF NOT EXISTS demands_account_sla_idx ON demands(account_id, sla_due_at);

CREATE TABLE IF NOT EXISTS demand_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  demand_id varchar NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demand_history_account_demand_idx ON demand_history(account_id, demand_id, created_at);

ALTER TABLE events ADD COLUMN IF NOT EXISTS demand_id varchar REFERENCES demands(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_account_demand_idx ON events(account_id, demand_id);
CREATE INDEX IF NOT EXISTS events_account_contact_idx ON events(account_id, contact_id);

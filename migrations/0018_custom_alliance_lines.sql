CREATE TABLE IF NOT EXISTS alliance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 60),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text NOT NULL CHECK (icon IN ('Flag', 'Landmark', 'Handshake', 'Users', 'Megaphone', 'Scale')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT alliance_lines_id_account_id_key UNIQUE (id, account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alliance_lines_account_name_uidx
  ON alliance_lines (account_id, lower(name));
CREATE INDEX IF NOT EXISTS alliance_lines_account_active_order_idx
  ON alliance_lines (account_id, active, display_order, name);

ALTER TABLE political_alliances ADD COLUMN IF NOT EXISTS line_id uuid;
ALTER TABLE political_alliances DROP CONSTRAINT IF EXISTS political_alliances_line_id_fkey;
ALTER TABLE political_alliances DROP CONSTRAINT IF EXISTS political_alliances_line_id_account_id_fkey;
ALTER TABLE alliance_lines DROP CONSTRAINT IF EXISTS alliance_lines_id_account_id_key;
ALTER TABLE alliance_lines
  ADD CONSTRAINT alliance_lines_id_account_id_key UNIQUE (id, account_id);
UPDATE political_alliances pa
SET line_id = NULL
WHERE pa.line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM alliance_lines line
    WHERE line.id = pa.line_id
      AND line.account_id = pa.account_id
  );
ALTER TABLE political_alliances
  ADD CONSTRAINT political_alliances_line_id_account_id_fkey FOREIGN KEY (line_id, account_id) REFERENCES alliance_lines(id, account_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS political_alliances_account_line_idx
  ON political_alliances (account_id, line_id);

WITH ideology_lines AS (
  SELECT
    alliance.account_id,
    party.ideology AS name,
    min(alliance.user_id) AS created_by_user_id,
    CASE party.ideology
      WHEN 'Esquerda' THEN '#ef4444'
      WHEN 'Centro-Esquerda' THEN '#f97316'
      WHEN 'Centro' THEN '#eab308'
      WHEN 'Centro-Direita' THEN '#3b82f6'
      WHEN 'Direita' THEN '#6366f1'
    END AS color,
    CASE party.ideology
      WHEN 'Esquerda' THEN 0
      WHEN 'Centro-Esquerda' THEN 1
      WHEN 'Centro' THEN 2
      WHEN 'Centro-Direita' THEN 3
      WHEN 'Direita' THEN 4
    END AS display_order
  FROM political_alliances alliance
  JOIN political_parties party ON party.id = alliance.party_id
  WHERE party.ideology IN ('Esquerda', 'Centro-Esquerda', 'Centro', 'Centro-Direita', 'Direita')
  GROUP BY alliance.account_id, party.ideology
)
INSERT INTO alliance_lines (
  account_id,
  created_by_user_id,
  name,
  color,
  icon,
  display_order
)
SELECT
  account_id,
  created_by_user_id,
  name,
  color,
  'Landmark',
  display_order
FROM ideology_lines
ON CONFLICT (account_id, lower(name)) DO NOTHING;

UPDATE political_alliances pa
SET line_id = line.id
FROM political_parties party, alliance_lines line
WHERE pa.party_id = party.id
  AND line.account_id = pa.account_id
  AND lower(line.name) = lower(party.ideology)
  AND pa.line_id IS NULL
  AND party.ideology IN ('Esquerda', 'Centro-Esquerda', 'Centro', 'Centro-Direita', 'Direita');

ALTER TABLE channel_connections ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE channel_connections ADD COLUMN IF NOT EXISTS token_fingerprint text;

UPDATE channel_connections
SET phone_number = regexp_replace(COALESCE(metadata->>'phoneNumber', ''), '[^0-9]', '', 'g')
WHERE phone_number IS NULL AND COALESCE(metadata->>'phoneNumber', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_account_phone_active_uidx
ON channel_connections (account_id, phone_number)
WHERE phone_number IS NOT NULL AND status <> 'disabled' AND channel = 'whatsapp' AND provider = 'wescctech';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM channel_connections
    WHERE token_fingerprint IS NOT NULL
      AND status <> 'disabled'
      AND channel = 'whatsapp'
      AND provider = 'wescctech'
    GROUP BY token_fingerprint
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create global active WHU token uniqueness index: duplicate token fingerprints exist. Disable or rotate duplicate connections before retrying.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_token_active_uidx
ON channel_connections (token_fingerprint)
WHERE token_fingerprint IS NOT NULL AND status <> 'disabled' AND channel = 'whatsapp' AND provider = 'wescctech';

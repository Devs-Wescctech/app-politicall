DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        account_id,
        regexp_replace(COALESCE(NULLIF(phone_number, ''), metadata->>'phoneNumber', ''), '[^0-9]', '', 'g') AS normalized_phone
      FROM channel_connections
      WHERE lower(status) <> 'disabled'
        AND lower(channel) = 'whatsapp'
        AND lower(provider) = 'wescctech'
    ) AS normalized
    WHERE normalized_phone <> ''
    GROUP BY account_id, normalized_phone
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot replace active WHU phone uniqueness index: duplicate normalized phone numbers exist in one account. Disable or correct duplicate connections before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM channel_connections
    WHERE token_fingerprint IS NOT NULL
      AND lower(status) <> 'disabled'
      AND lower(channel) = 'whatsapp'
      AND lower(provider) = 'wescctech'
    GROUP BY token_fingerprint
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot replace global active WHU token uniqueness index: duplicate token fingerprints exist. Disable or rotate duplicate connections before retrying.';
  END IF;
END $$;

WITH normalized_whu_connections AS (
  SELECT
    id,
    regexp_replace(COALESCE(NULLIF(phone_number, ''), metadata->>'phoneNumber', ''), '[^0-9]', '', 'g') AS normalized_phone
  FROM channel_connections
  WHERE lower(channel) = 'whatsapp'
    AND lower(provider) = 'wescctech'
)
UPDATE channel_connections AS connection
SET
  phone_number = normalized.normalized_phone,
  metadata = jsonb_set(COALESCE(connection.metadata, '{}'::jsonb), '{phoneNumber}', to_jsonb(normalized.normalized_phone), true)
FROM normalized_whu_connections AS normalized
WHERE connection.id = normalized.id
  AND normalized.normalized_phone <> '';

DROP INDEX IF EXISTS channel_connections_account_phone_active_uidx;
DROP INDEX IF EXISTS channel_connections_token_active_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_account_phone_active_uidx
ON channel_connections (account_id, phone_number)
WHERE phone_number IS NOT NULL
  AND lower(status) <> 'disabled'
  AND lower(channel) = 'whatsapp'
  AND lower(provider) = 'wescctech';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_token_active_uidx
ON channel_connections (token_fingerprint)
WHERE token_fingerprint IS NOT NULL
  AND lower(status) <> 'disabled'
  AND lower(channel) = 'whatsapp'
  AND lower(provider) = 'wescctech';

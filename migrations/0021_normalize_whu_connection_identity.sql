DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        account_id,
        NULLIF(
          regexp_replace(
            COALESCE(NULLIF(btrim(phone_number), ''), NULLIF(btrim(metadata->>'phoneNumber'), '')),
            '[^0-9]',
            '',
            'g'
          ),
          ''
        ) AS normalized_phone
      FROM channel_connections
      WHERE lower(btrim(status)) <> 'disabled'
        AND lower(btrim(channel)) = 'whatsapp'
        AND lower(btrim(provider)) = 'wescctech'
    ) AS normalized
    WHERE normalized_phone IS NOT NULL
    GROUP BY account_id, normalized_phone
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize active WHU phone uniqueness index: duplicate normalized phone numbers exist in one account. Disable or correct duplicate connections before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM channel_connections
    WHERE token_fingerprint IS NOT NULL
      AND lower(btrim(status)) <> 'disabled'
      AND lower(btrim(channel)) = 'whatsapp'
      AND lower(btrim(provider)) = 'wescctech'
    GROUP BY token_fingerprint
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize global active WHU token uniqueness index: duplicate token fingerprints exist. Disable or rotate duplicate connections before retrying.';
  END IF;
END $$;

DROP INDEX IF EXISTS channel_connections_account_phone_active_uidx;
DROP INDEX IF EXISTS channel_connections_token_active_uidx;

UPDATE channel_connections
SET
  channel = lower(btrim(channel)),
  provider = lower(btrim(provider)),
  status = lower(btrim(status))
WHERE lower(btrim(channel)) = 'whatsapp'
  AND lower(btrim(provider)) = 'wescctech';

WITH normalized_whu_connections AS (
  SELECT
    id,
    NULLIF(
      regexp_replace(
        COALESCE(NULLIF(btrim(phone_number), ''), NULLIF(btrim(metadata->>'phoneNumber'), '')),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    ) AS normalized_phone
  FROM channel_connections
  WHERE lower(btrim(channel)) = 'whatsapp'
    AND lower(btrim(provider)) = 'wescctech'
)
UPDATE channel_connections AS connection
SET
  phone_number = normalized.normalized_phone,
  metadata = jsonb_set(COALESCE(connection.metadata, '{}'::jsonb), '{phoneNumber}', to_jsonb(normalized.normalized_phone), true)
FROM normalized_whu_connections AS normalized
WHERE connection.id = normalized.id;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_account_phone_active_uidx
ON channel_connections (account_id, phone_number)
WHERE NULLIF(btrim(phone_number), '') IS NOT NULL
  AND lower(btrim(status)) <> 'disabled'
  AND lower(btrim(channel)) = 'whatsapp'
  AND lower(btrim(provider)) = 'wescctech';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_token_active_uidx
ON channel_connections (token_fingerprint)
WHERE token_fingerprint IS NOT NULL
  AND lower(btrim(status)) <> 'disabled'
  AND lower(btrim(channel)) = 'whatsapp'
  AND lower(btrim(provider)) = 'wescctech';

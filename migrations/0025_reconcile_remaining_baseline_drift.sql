-- Reconcile the remaining differences between long-lived production databases
-- and fresh databases created from scripts/full_schema.sql.
--
-- This migration is forward-only. It fails closed before dropping a stale
-- column whenever doing so could discard information or overwrite a canonical
-- value. The production migrator wraps the complete artifact in a transaction.

DO $$
DECLARE
  conflicting_rows bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'api_key_usage'
      AND column_name = 'message'
  ) THEN
    SELECT count(*) INTO conflicting_rows
    FROM api_key_usage
    WHERE message IS NOT NULL;

    IF conflicting_rows > 0 THEN
      RAISE EXCEPTION 'Cannot remove api_key_usage.message because it is populated in % row(s)', conflicting_rows;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'scopes'
  ) THEN
    SELECT count(*) INTO conflicting_rows
    FROM google_calendar_integrations
    WHERE scopes IS NOT NULL;

    IF conflicting_rows > 0 THEN
      RAISE EXCEPTION 'Cannot remove google_calendar_integrations.scopes because it is populated in % row(s)', conflicting_rows;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'is_active'
  ) THEN
    SELECT count(*) INTO conflicting_rows
    FROM google_calendar_integrations
    WHERE is_active IS DISTINCT FROM sync_enabled;

    IF conflicting_rows > 0 THEN
      RAISE EXCEPTION 'Cannot remove google_calendar_integrations.is_active because it conflicts with sync_enabled in % row(s)', conflicting_rows;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'token_expiry'
  ) THEN
    SELECT count(*) INTO conflicting_rows
    FROM google_calendar_integrations
    WHERE token_expiry IS NOT NULL
      AND token_expiry_date IS NOT NULL
      AND token_expiry_date IS DISTINCT FROM token_expiry AT TIME ZONE 'UTC';

    IF conflicting_rows > 0 THEN
      RAISE EXCEPTION 'Cannot reconcile google_calendar_integrations.token_expiry because it conflicts with token_expiry_date in % row(s)', conflicting_rows;
    END IF;

    UPDATE google_calendar_integrations
    SET token_expiry_date = token_expiry AT TIME ZONE 'UTC'
    WHERE token_expiry IS NOT NULL
      AND token_expiry_date IS NULL;
  END IF;
END $$;

ALTER TABLE api_key_usage
  DROP COLUMN IF EXISTS message,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE api_keys
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE google_calendar_integrations
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS scopes,
  DROP COLUMN IF EXISTS token_expiry;

DROP INDEX IF EXISTS contacts_account_normalized_name_idx;
CREATE INDEX contacts_account_normalized_name_idx
  ON contacts(account_id, normalized_name);

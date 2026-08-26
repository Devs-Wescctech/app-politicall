-- Reconcile schema differences observed between long-lived production databases
-- and fresh databases created from scripts/full_schema.sql.
--
-- This migration is intentionally forward-only and non-destructive. Legacy
-- tables that are not part of shared/schema.ts are left untouched until their
-- ownership and retention requirements are reviewed separately.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- The current Drizzle contract uses text, timestamp without time zone, and
-- explicit non-null defaults for Google Calendar synchronization preferences.
UPDATE google_calendar_integrations
SET
  sync_enabled = COALESCE(sync_enabled, true),
  sync_direction = COALESCE(sync_direction, 'both'),
  auto_create_meet = COALESCE(auto_create_meet, false),
  sync_reminders = COALESCE(sync_reminders, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE google_calendar_integrations
  ALTER COLUMN email TYPE text USING email::text,
  ALTER COLUMN calendar_id TYPE text USING calendar_id::text,
  ALTER COLUMN sync_direction TYPE text USING sync_direction::text,
  ALTER COLUMN sync_enabled SET DEFAULT true,
  ALTER COLUMN sync_enabled SET NOT NULL,
  ALTER COLUMN sync_direction SET DEFAULT 'both',
  ALTER COLUMN sync_direction SET NOT NULL,
  ALTER COLUMN auto_create_meet SET DEFAULT false,
  ALTER COLUMN auto_create_meet SET NOT NULL,
  ALTER COLUMN sync_reminders SET DEFAULT true,
  ALTER COLUMN sync_reminders SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE google_calendar_integrations
      ALTER COLUMN created_at TYPE timestamp without time zone
      USING created_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE google_calendar_integrations
      ALTER COLUMN updated_at TYPE timestamp without time zone
      USING updated_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'last_sync_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE google_calendar_integrations
      ALTER COLUMN last_sync_at TYPE timestamp without time zone
      USING last_sync_at AT TIME ZONE 'UTC';
  END IF;
END $$;

-- These defaults existed only in the stale fresh-database baseline. The
-- application contract requires callers to provide the demographic answers.
ALTER TABLE survey_campaigns
  ALTER COLUMN demographic_fields DROP DEFAULT;

ALTER TABLE survey_responses
  ALTER COLUMN gender DROP DEFAULT,
  ALTER COLUMN age_range DROP DEFAULT,
  ALTER COLUMN employment_type DROP DEFAULT,
  ALTER COLUMN housing_type DROP DEFAULT,
  ALTER COLUMN has_children DROP DEFAULT,
  ALTER COLUMN political_ideology DROP DEFAULT;

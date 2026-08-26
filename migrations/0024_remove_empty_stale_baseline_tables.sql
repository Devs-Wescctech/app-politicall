-- Remove objects that were accidentally retained in the development baseline
-- but never existed in production and have no application references.
--
-- This migration is irreversible. It fails closed before changing anything if
-- any legacy table contains rows or if contacts.field_operative_id is in use.

DO $$
DECLARE
  stale_table text;
  stale_rows bigint;
BEGIN
  FOREACH stale_table IN ARRAY ARRAY[
    'contact_activities',
    'field_operatives',
    'google_ads_campaign_assets',
    'google_ads_campaigns'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = stale_table
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', stale_table) INTO stale_rows;
      IF stale_rows > 0 THEN
        RAISE EXCEPTION 'Cannot remove stale baseline table % because it contains % row(s)', stale_table, stale_rows;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'field_operative_id'
  ) THEN
    SELECT count(*) INTO stale_rows
    FROM contacts
    WHERE field_operative_id IS NOT NULL;

    IF stale_rows > 0 THEN
      RAISE EXCEPTION 'Cannot remove contacts.field_operative_id because it is populated in % row(s)', stale_rows;
    END IF;
  END IF;
END $$;

ALTER TABLE contacts DROP COLUMN IF EXISTS field_operative_id;
DROP TABLE IF EXISTS contact_activities;
DROP TABLE IF EXISTS field_operatives;
DROP TABLE IF EXISTS google_ads_campaign_assets;
DROP TABLE IF EXISTS google_ads_campaigns;

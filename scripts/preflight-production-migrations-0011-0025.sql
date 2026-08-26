\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT 'server_version' AS check_name, 'INFO' AS gate, current_setting('server_version') AS result;

SELECT
  'migration_history' AS check_name,
  CASE WHEN count(*) = 9 AND max(name) = '0010_auth_sessions.sql' THEN 'PASS' ELSE 'BLOCK' END AS gate,
  json_build_object('rows', count(*), 'latest', max(name))::text AS result
FROM politicall_schema_migrations;

SELECT
  'duplicate_normalized_active_whu_phone_groups' AS check_name,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'BLOCK' END AS gate,
  count(*)::text AS result
FROM (
  SELECT
    account_id,
    NULLIF(regexp_replace(NULLIF(btrim(metadata->>'phoneNumber'), ''), '[^0-9]', '', 'g'), '') AS normalized_phone
  FROM channel_connections
  WHERE lower(btrim(status)) <> 'disabled'
    AND lower(btrim(channel)) = 'whatsapp'
    AND lower(btrim(provider)) = 'wescctech'
  GROUP BY
    account_id,
    NULLIF(regexp_replace(NULLIF(btrim(metadata->>'phoneNumber'), ''), '[^0-9]', '', 'g'), '')
  HAVING count(*) > 1
) duplicates
WHERE normalized_phone IS NOT NULL;

SELECT
  'duplicate_attendance_thread_groups' AS check_name,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'BLOCK' END AS gate,
  count(*)::text AS result
FROM (
  SELECT account_id, connection_id, external_thread_id
  FROM att_conversations
  WHERE connection_id IS NOT NULL
    AND external_thread_id IS NOT NULL
  GROUP BY account_id, connection_id, external_thread_id
  HAVING count(*) > 1
) duplicates;

SELECT
  'unexpected_stale_baseline_relations' AS check_name,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'BLOCK' END AS gate,
  COALESCE(json_agg(object_name ORDER BY object_name)::text, '[]') AS result
FROM (
  SELECT object_name
  FROM unnest(ARRAY[
    'contact_activities',
    'field_operatives',
    'google_ads_campaign_assets',
    'google_ads_campaigns'
  ]) AS object_name
  WHERE to_regclass(format('public.%I', object_name)) IS NOT NULL
) stale;

SELECT
  'unexpected_stale_baseline_columns' AS check_name,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'BLOCK' END AS gate,
  COALESCE(json_agg(table_name || '.' || column_name ORDER BY table_name, column_name)::text, '[]') AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('contacts', 'field_operative_id'),
    ('api_key_usage', 'message'),
    ('google_calendar_integrations', 'is_active'),
    ('google_calendar_integrations', 'scopes'),
    ('google_calendar_integrations', 'token_expiry')
  );

SELECT
  'active_whu_connections_scanned_during_fingerprint_backfill' AS check_name,
  'INFO' AS gate,
  count(*)::text AS result
FROM channel_connections
WHERE lower(btrim(status)) <> 'disabled'
  AND lower(btrim(channel)) = 'whatsapp'
  AND lower(btrim(provider)) = 'wescctech'
  AND token IS NOT NULL
  AND token <> '';

SELECT
  'rows_normalized_by_demand_migrations' AS check_name,
  'INFO' AS gate,
  json_build_object(
    'status', count(*) FILTER (WHERE status IN ('pending', 'aberta', 'em_andamento', 'concluida')),
    'priority', count(*) FILTER (WHERE priority IN ('baixa', 'media', 'alta', 'urgente'))
  )::text AS result
FROM demands;

SELECT
  'affected_table_sizes' AS check_name,
  'INFO' AS gate,
  json_agg(json_build_object('table', relation, 'bytes', bytes) ORDER BY bytes DESC)::text AS result
FROM (
  SELECT relation, pg_total_relation_size(format('public.%I', relation)::regclass) AS bytes
  FROM unnest(ARRAY[
    'demands',
    'contacts',
    'events',
    'att_conversations',
    'channel_connections',
    'political_alliances',
    'petition_signatures',
    'google_calendar_integrations',
    'survey_campaigns',
    'survey_responses'
  ]) AS relation
) sizes;

-- Deliberately fail psql when any blocking condition is present. Closing the
-- connection after ON_ERROR_STOP still rolls the read-only transaction back.
WITH blockers AS (
  SELECT count(*) AS blocker_count
  FROM (
    SELECT 1
    FROM politicall_schema_migrations
    HAVING count(*) <> 9 OR max(name) <> '0010_auth_sessions.sql'

    UNION ALL

    SELECT 1
    FROM (
      SELECT
        account_id,
        NULLIF(regexp_replace(NULLIF(btrim(metadata->>'phoneNumber'), ''), '[^0-9]', '', 'g'), '') AS normalized_phone
      FROM channel_connections
      WHERE lower(btrim(status)) <> 'disabled'
        AND lower(btrim(channel)) = 'whatsapp'
        AND lower(btrim(provider)) = 'wescctech'
      GROUP BY
        account_id,
        NULLIF(regexp_replace(NULLIF(btrim(metadata->>'phoneNumber'), ''), '[^0-9]', '', 'g'), '')
      HAVING count(*) > 1
    ) duplicate_phones
    WHERE normalized_phone IS NOT NULL

    UNION ALL

    SELECT 1
    FROM att_conversations
    WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL
    GROUP BY account_id, connection_id, external_thread_id
    HAVING count(*) > 1

    UNION ALL

    SELECT 1
    FROM unnest(ARRAY[
      'contact_activities',
      'field_operatives',
      'google_ads_campaign_assets',
      'google_ads_campaigns'
    ]) AS object_name
    WHERE to_regclass(format('public.%I', object_name)) IS NOT NULL

    UNION ALL

    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('contacts', 'field_operative_id'),
        ('api_key_usage', 'message'),
        ('google_calendar_integrations', 'is_active'),
        ('google_calendar_integrations', 'scopes'),
        ('google_calendar_integrations', 'token_expiry')
      )
  ) detected
)
SELECT 1 / CASE WHEN blocker_count = 0 THEN 1 ELSE 0 END AS preflight_passed
FROM blockers;

ROLLBACK;

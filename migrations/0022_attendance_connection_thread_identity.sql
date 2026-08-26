DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM att_conversations
    WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL
    GROUP BY account_id, connection_id, external_thread_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate attendance threads exist for account/connection/external_thread_id; resolve them before applying 0022';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS att_conversations_account_connection_thread_uidx
ON att_conversations (account_id, connection_id, external_thread_id)
WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS att_messages_account_external_message_uidx
  ON att_messages (account_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

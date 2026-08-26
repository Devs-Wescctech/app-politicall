ALTER TABLE events
  ADD COLUMN IF NOT EXISTS attendance_conversation_id varchar
  REFERENCES att_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_account_attendance_conversation_idx
  ON events(account_id, attendance_conversation_id);

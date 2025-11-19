-- Add googleEventId field to events table for Google Calendar sync
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Add an index for faster queries by Google Event ID
CREATE INDEX IF NOT EXISTS idx_events_google_event_id ON events(google_event_id);
-- Add permissions column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"dashboard":true,"contacts":true,"alliances":true,"demands":true,"agenda":true,"ai":true,"marketing":true,"petitions":true,"users":false,"settings":false}'::jsonb;

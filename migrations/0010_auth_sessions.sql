-- Revocable refresh-token sessions and one-time legacy bearer exchanges.
-- Impact: additive tables and indexes only; no existing rows are modified.
-- Rollback: DROP TABLE IF EXISTS legacy_auth_exchanges; DROP TABLE IF EXISTS auth_sessions;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id varchar NOT NULL,
  account_id varchar REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE CASCADE,
  global_admin_principal_id varchar,
  principal_type text NOT NULL,
  refresh_token_hash text NOT NULL,
  device_hash text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  rotated_from_session_id varchar REFERENCES auth_sessions(id) ON DELETE SET NULL,
  replaced_by_session_id varchar REFERENCES auth_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_principal_scope_chk CHECK (
    (principal_type = 'user' AND account_id IS NOT NULL AND user_id IS NOT NULL AND global_admin_principal_id IS NULL)
    OR (principal_type = 'global_admin' AND account_id IS NULL AND user_id IS NULL AND global_admin_principal_id IS NOT NULL)
  ),
  CONSTRAINT auth_sessions_refresh_hash_chk CHECK (char_length(refresh_token_hash) = 64),
  CONSTRAINT auth_sessions_device_hash_chk CHECK (device_hash IS NULL OR char_length(device_hash) = 64),
  CONSTRAINT auth_sessions_ip_hash_chk CHECK (ip_hash IS NULL OR char_length(ip_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_token_hash_uidx ON auth_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(account_id, user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON auth_sessions(account_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(family_id);

CREATE TABLE IF NOT EXISTS legacy_auth_exchanges (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  exchanged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_auth_exchanges_token_hash_chk CHECK (char_length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS legacy_auth_exchanges_expiry_idx ON legacy_auth_exchanges(expires_at);

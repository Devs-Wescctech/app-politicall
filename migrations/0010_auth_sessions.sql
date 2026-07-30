-- Final revocable refresh-token session schema for this release.
-- Impact: additive tables and indexes only; no existing rows are modified.
-- Rollback: DROP TABLE IF EXISTS legacy_auth_exchanges; DROP TABLE IF EXISTS auth_sessions;

CREATE UNIQUE INDEX IF NOT EXISTS users_account_id_id_uidx ON users(account_id, id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id varchar NOT NULL,
  account_id varchar REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE CASCADE,
  global_admin_principal_id varchar,
  principal_id varchar NOT NULL,
  principal_type text NOT NULL,
  refresh_token_hash text NOT NULL,
  device_hash text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  last_used_at timestamptz,
  rotated_from_session_id varchar REFERENCES auth_sessions(id) ON DELETE SET NULL,
  replaced_by_session_id varchar REFERENCES auth_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_principal_scope_chk CHECK (
    (principal_type = 'user' AND account_id IS NOT NULL AND user_id IS NOT NULL AND global_admin_principal_id IS NULL AND principal_id = user_id)
    OR (principal_type = 'global_admin' AND account_id IS NULL AND user_id IS NULL AND global_admin_principal_id IS NOT NULL AND principal_id = global_admin_principal_id)
  ),
  CONSTRAINT auth_sessions_refresh_hash_chk CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_device_hash_chk CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_ip_hash_chk CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_rotation_identity_key UNIQUE (id, family_id, principal_type, principal_id),
  CONSTRAINT auth_sessions_account_user_fk FOREIGN KEY (account_id, user_id)
    REFERENCES users(account_id, id) ON DELETE CASCADE,
  CONSTRAINT auth_sessions_rotated_from_scope_fk
    FOREIGN KEY (rotated_from_session_id, family_id, principal_type, principal_id)
    REFERENCES auth_sessions(id, family_id, principal_type, principal_id) ON DELETE NO ACTION,
  CONSTRAINT auth_sessions_replaced_by_scope_fk
    FOREIGN KEY (replaced_by_session_id, family_id, principal_type, principal_id)
    REFERENCES auth_sessions(id, family_id, principal_type, principal_id) ON DELETE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_token_hash_uidx ON auth_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(account_id, user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON auth_sessions(account_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(family_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_rotated_from_uidx
  ON auth_sessions(rotated_from_session_id) WHERE rotated_from_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_replaced_by_uidx
  ON auth_sessions(replaced_by_session_id) WHERE replaced_by_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS legacy_auth_exchanges (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  exchanged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_auth_exchanges_token_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS legacy_auth_exchanges_expiry_idx ON legacy_auth_exchanges(expires_at);

-- Strengthen auth-session tenant, linkage, and hash integrity without changing existing rows' meaning.
-- Impact: additive key/foreign-key/index constraints; invalid legacy raw values are converted to SHA-256 hex.
-- Rollback: drop the constraints/indexes below, then drop principal_id only after no code depends on it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS principal_id varchar;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
UPDATE auth_sessions
SET principal_id = CASE
  WHEN principal_type = 'user' THEN user_id
  WHEN principal_type = 'global_admin' THEN global_admin_principal_id
END
WHERE principal_id IS NULL;
ALTER TABLE auth_sessions ALTER COLUMN principal_id SET NOT NULL;

UPDATE auth_sessions
SET refresh_token_hash = encode(digest(refresh_token_hash, 'sha256'), 'hex')
WHERE refresh_token_hash !~ '^[0-9a-f]{64}$';
UPDATE auth_sessions
SET device_hash = encode(digest(device_hash, 'sha256'), 'hex')
WHERE device_hash IS NOT NULL AND device_hash !~ '^[0-9a-f]{64}$';
UPDATE auth_sessions
SET ip_hash = encode(digest(ip_hash, 'sha256'), 'hex')
WHERE ip_hash IS NOT NULL AND ip_hash !~ '^[0-9a-f]{64}$';
UPDATE legacy_auth_exchanges
SET token_hash = encode(digest(token_hash, 'sha256'), 'hex')
WHERE token_hash !~ '^[0-9a-f]{64}$';

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_principal_scope_chk;
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_refresh_hash_chk;
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_device_hash_chk;
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_ip_hash_chk;
ALTER TABLE legacy_auth_exchanges DROP CONSTRAINT IF EXISTS legacy_auth_exchanges_token_hash_chk;

ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_principal_scope_chk CHECK (
  (principal_type = 'user' AND account_id IS NOT NULL AND user_id IS NOT NULL AND global_admin_principal_id IS NULL AND principal_id = user_id)
  OR (principal_type = 'global_admin' AND account_id IS NULL AND user_id IS NULL AND global_admin_principal_id IS NOT NULL AND principal_id = global_admin_principal_id)
);
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_refresh_hash_chk CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_device_hash_chk CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_ip_hash_chk CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE legacy_auth_exchanges ADD CONSTRAINT legacy_auth_exchanges_token_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_id_id_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_account_id_id_key UNIQUE (account_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_rotation_identity_key') THEN
    ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_rotation_identity_key UNIQUE (id, family_id, principal_type, principal_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_account_user_fk') THEN
    ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_account_user_fk
      FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_rotated_from_scope_fk') THEN
    ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_rotated_from_scope_fk
      FOREIGN KEY (rotated_from_session_id, family_id, principal_type, principal_id)
      REFERENCES auth_sessions(id, family_id, principal_type, principal_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_replaced_by_scope_fk') THEN
    ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_replaced_by_scope_fk
      FOREIGN KEY (replaced_by_session_id, family_id, principal_type, principal_id)
      REFERENCES auth_sessions(id, family_id, principal_type, principal_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_rotated_from_uidx
  ON auth_sessions(rotated_from_session_id) WHERE rotated_from_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_replaced_by_uidx
  ON auth_sessions(replaced_by_session_id) WHERE replaced_by_session_id IS NOT NULL;

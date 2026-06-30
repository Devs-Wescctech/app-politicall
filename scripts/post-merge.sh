#!/bin/bash
set -e

npm install

# db:push targets the user's EXTERNAL PostgreSQL. Reachability depends on the
# workspace egress IP being whitelisted in the DB's pg_hba.conf, and that egress
# IP is NOT static on Replit. A connectivity failure here must not block the
# merge: schema changes are rare and must be applied deliberately once the DB is
# reachable. So run db:push but never let it fail the whole post-merge.
if npm run db:push; then
  echo "[post-merge] db:push succeeded (schema in sync)."
else
  echo "[post-merge] WARNING: db:push failed. Most likely the DB is unreachable because the workspace egress IP is not whitelisted in the external Postgres pg_hba.conf. Schema was NOT synced. Whitelist the current egress IP and apply the schema manually (npm run db:push) once the DB is reachable." >&2
fi

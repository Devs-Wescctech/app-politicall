---
name: drizzle-kit + PostgreSQL 18 push churn
description: Why db:push failed against the external Postgres and how it was resolved
---

# drizzle-kit push fails on PostgreSQL 17/18

`drizzle-kit push` against a PostgreSQL 17/18 server can fail with
`42P16: column "id" is in a primary key` (routine `dropconstraint_internal`).

**Cause:** Older drizzle-kit (seen on 0.31.4) introspects PG17/18 named NOT NULL
constraints incorrectly and generates spurious
`ALTER TABLE x DROP CONSTRAINT "x_<col>_not_null"` statements for every NOT NULL
column. Postgres rejects this on primary-key columns, aborting the whole push in a
transaction (so it rolls back — including any new FOREIGN KEY adds queued after the
drops).

**Fix:** Upgrade drizzle-kit (0.31.10 runs clean: "No changes detected"). The push
runs in a transaction, so a mid-push failure leaves NOT NULL intact but can drop
newly-queued FKs — verify/re-add FKs after any aborted push.

**Why:** This bit the Petições module merge — the 7 new tables got created but their
14 FKs were rolled back by the aborted push; had to re-add them by hand.

**How to apply:** If post-merge `npm run db:push` fails with 42P16 on this project,
the schema is almost certainly fine — it's the tooling. Bump drizzle-kit, don't
force-push or alter the schema.

## This project's DB environment quirks
- Dev uses the user's OWN external Postgres (host `204.157.108.76:5432`), NOT a
  Replit-managed DB. `DATABASE_URL` secret holds the correct host.
- **Recurring blocker:** that host's `pg_hba.conf` whitelists specific IPs, but the
  Replit workspace egress IP is NOT static — it rotates between sessions/restarts
  (seen: 34.75.47.23, 34.23.210.12, 35.227.111.237, all GCP). Each rotation makes
  the WHOLE APP fail every DB query with `28000 no pg_hba.conf entry for host ...`
  (admin login still works — it reads a local file, not the DB). Only the USER can
  fix it by whitelisting the new egress IP (or a broader range) in their server.
  This cannot be solved from inside the workspace. Going back to a managed DB
  (e.g. Neon) would remove the IP-whitelist fragility entirely.
- `executeSql` tool uses a different source IP and is also rejected — use the `pg`
  npm Client in a bash command instead.
- Post-merge `db:push` pulls the remote schema (~30s); timeout raised to 180000ms.
  `scripts/post-merge.sh` now treats a db:push failure as a NON-fatal warning so a
  DB-connectivity rotation does not block merges (schema must then be applied
  manually once the DB is reachable).

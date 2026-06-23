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
- That host's `pg_hba.conf` only whitelists the Replit workspace egress IP, so the
  `executeSql` tool (different source IP) may be rejected — use the `pg` npm Client
  in a bash command instead. Production deploy will use a different egress IP that
  also needs whitelisting.
- Post-merge `db:push` pulls the remote schema (~30s with network latency); the
  post-merge timeout was raised to 180000ms so it doesn't time out.

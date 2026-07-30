# Production Backup And Restore

The PostgreSQL database and host uploads directory form one application state. Back them up and restore them as a pair while the application is quiesced. This procedure does not add PostgreSQL to the Politicall Compose stack.

## Database Authentication

Create a libpq service entry and expose only its name through `PGSERVICE`. Point `PGPASSFILE` to a dedicated password file readable only by the backup operator. On Unix, require mode `0600`; on Windows, apply an equivalent restrictive ACL. Never put a password or credential-bearing database URL in a command argument, shell history, source file, or change record.

The examples below use `--dbname "service=<service-name>"`. Replace placeholders only in the secured operator environment:

```text
pg_dump --format=custom --file <database-dump-file> --dbname "service=<service-name>"
pg_restore --list <database-dump-file>
psql --dbname "service=<service-name>" --no-align --tuples-only --command "SELECT to_regclass('public.politicall_schema_migrations')" > <migration-table-check-file>
```

Run the `to_regclass` check before querying the migration history:

- If the result is non-null, export the history in a deterministic order:

  ```text
  psql --dbname "service=<service-name>" --no-align --tuples-only --command "SELECT name, hash, applied_at FROM politicall_schema_migrations ORDER BY name" > <migration-inventory-file>
  ```

- If the result is null, write the marker locally without issuing another database command:

  ```text
  printf '%s\n' 'politicall_schema_migrations=absent-before-production-runner' > <migration-inventory-file>
  ```

Compute and record the SHA-256 of `<migration-inventory-file>` in either branch. Do not edit or normalize the file after hashing it. This preflight is read-only: do not execute DDL or any mutating statement. The production migration runner creates `politicall_schema_migrations` on its first start. The canonical marker represents the backup's pre-runner state, before that first start; it does not change the database.

## Consistent Backup

1. Block inbound traffic and new writes at the proxy or maintenance control.
2. Stop the application gracefully and wait for its shutdown grace period to complete.
3. Confirm that no application writers remain by checking application processes, active sessions, and the expected database activity.
4. Open one timestamped change record and capture IMAGE_REFERENCE and resolved digest for the stopped application.
5. Produce the migration inventory with the read-only existence branch above: export the complete ordered `politicall_schema_migrations` contents when the table exists, or create the canonical local marker file when it is absent.
6. Run `pg_dump` to a database dump path outside the repository while the application remains stopped.
7. Archive the uploads directory to an uploads archive path outside the repository, preserving ownership, permissions, and timestamps.
8. Compute SHA-256 hashes for all three artifacts: the database dump, uploads archive, and migration inventory. In the same record, store the pair identifier, database dump path and SHA-256 hash, uploads archive path and SHA-256 hash, migration inventory path and SHA-256 hash, IMAGE_REFERENCE, and resolved digest.
9. Validate the database dump with `pg_restore --list` and retain the validated inventory.
10. Validate the uploads archive by listing it and checking representative files without extracting over production data.
11. Validate the migration inventory hash. Confirm either the expected ordered rows from `politicall_schema_migrations` or exactly `politicall_schema_migrations=absent-before-production-runner`, matching the branch used to create the hashed file.
12. Only after all three artifacts are validated may the operator continue to the deployment. If the deployment is aborted, restart the captured image, complete readiness and smoke checks, and reopen traffic only after all three validations remain successful.

## Isolated Restore Validation (ambiente isolado)

1. Create an isolated, non-production PostgreSQL target and isolated uploads directory with no route from production clients.
2. Verify all three SHA-256 hashes against the same pair record: database dump, uploads archive, and migration inventory. If the inventory contains exactly `politicall_schema_migrations=absent-before-production-runner`, accept the marker only when its SHA-256 hash matches the recorded inventory hash; it represents the captured pre-runner state. Review the captured migration contents and compatible IMAGE_REFERENCE only after the hashes match.
3. Restore the database with `pg_restore --clean --if-exists --no-owner --dbname "service=<isolated-service-name>" <database-dump-file>`.
4. Extract the paired uploads archive into the isolated uploads directory.
5. Start the captured compatible image against only the isolated database and uploads path. When the marker was captured, the production migration runner creates the history table during this first start.
6. Wait for migrations and `/api/ready`, then verify `/api/health`, login, a static asset, an upload, and `/api/attendance/realtime`.
7. Destroy the isolated environment after validation and retain only approved backup artifacts under the retention policy.

## Production Restore

1. Keep inbound traffic and writes blocked for the entire restore window.
2. Keep the application stopped and allow graceful shutdown to finish before changing either state store.
3. Confirm that no application writers remain.
4. Verify all three SHA-256 hashes against the same pair record before changing database or uploads state: database dump, uploads archive, and migration inventory. If the inventory contains exactly `politicall_schema_migrations=absent-before-production-runner`, accept the marker only when its SHA-256 hash matches the recorded inventory hash; it represents the captured pre-runner state.
5. Restore the captured database dump using the secured libpq service configuration.
6. Restore the paired uploads archive to the captured persistent host path, preserving ownership and permissions.
7. Select the compatible captured `IMAGE_REFERENCE` and verify its registry digest matches the pair record.
8. Start the application with the restored database and uploads path. When the marker was captured, the production migration runner creates the history table during this first start.
9. Wait for migrations to complete successfully.
10. Require `/api/ready` and `/api/health` to succeed.
11. Complete smoke checks for login, dashboard, static assets, representative uploads, and `/api/attendance/realtime`.
12. Reopen traffic only after the paired restore, readiness checks, and smoke checks all pass.

An image-only rollback is allowed only when every intervening migration is proven backward-compatible with the older application. If compatibility is not proven, restore the paired database and uploads artifacts and use the compatible IMAGE_REFERENCE captured with that pair.

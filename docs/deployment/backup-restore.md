# Production Backup And Restore

The PostgreSQL database and host uploads directory form one application state. Back them up and restore them as a pair while the application is quiesced. This procedure does not add PostgreSQL to the Politicall Compose stack.

## Database Authentication

Create a libpq service entry and expose only its name through `PGSERVICE`. Point `PGPASSFILE` to a dedicated password file readable only by the backup operator. On Unix, require mode `0600`; on Windows, apply an equivalent restrictive ACL. Never put a password or credential-bearing database URL in a command argument, shell history, source file, or change record.

The examples below use `--dbname "service=<service-name>"`. Replace placeholders only in the secured operator environment:

```text
pg_dump --format=custom --file <database-dump-file> --dbname "service=<service-name>"
pg_restore --list <database-dump-file>
psql --dbname "service=<service-name>" --no-align --tuples-only --command "SELECT name, hash, applied_at FROM politicall_schema_migrations ORDER BY name" > <migration-inventory-file>
```

## Consistent Backup

1. Block inbound traffic and new writes at the proxy or maintenance control.
2. Stop the application gracefully and wait for its shutdown grace period to complete.
3. Confirm that no application writers remain by checking application processes, active sessions, and the expected database activity.
4. Open one timestamped change record and capture IMAGE_REFERENCE and resolved digest for the stopped application.
5. Export the complete `politicall_schema_migrations` contents to the migration inventory file in that same record.
6. Run `pg_dump` to a database dump path outside the repository while the application remains stopped.
7. Archive the uploads directory to an uploads archive path outside the repository, preserving ownership, permissions, and timestamps.
8. Compute SHA-256 hashes for both artifacts. In the same record, store the pair identifier, database dump path, uploads archive path, both SHA-256 hashes, migration inventory path, IMAGE_REFERENCE, and resolved digest.
9. Validate the database dump with `pg_restore --list` and retain the validated inventory.
10. Validate the uploads archive by listing it and checking representative files without extracting over production data.
11. Only after both artifacts are validated may the operator continue to the deployment. If the deployment is aborted, restart the captured image, complete readiness and smoke checks, and reopen traffic only after both backup validations remain successful.

## Isolated Restore Validation (ambiente isolado)

1. Create an isolated, non-production PostgreSQL target and isolated uploads directory with no route from production clients.
2. Verify both artifact hashes against the same pair record and review its captured migration inventory and compatible IMAGE_REFERENCE.
3. Restore the database with `pg_restore --clean --if-exists --no-owner --dbname "service=<isolated-service-name>" <database-dump-file>`.
4. Extract the paired uploads archive into the isolated uploads directory.
5. Start the captured compatible image against only the isolated database and uploads path.
6. Wait for migrations and `/api/ready`, then verify `/api/health`, login, a static asset, an upload, and `/api/attendance/realtime`.
7. Destroy the isolated environment after validation and retain only approved backup artifacts under the retention policy.

## Production Restore

1. Keep inbound traffic and writes blocked for the entire restore window.
2. Keep the application stopped and allow graceful shutdown to finish before changing either state store.
3. Confirm that no application writers remain and verify both artifact SHA-256 hashes against one pair record.
4. Restore the captured database dump using the secured libpq service configuration.
5. Restore the paired uploads archive to the captured persistent host path, preserving ownership and permissions.
6. Select the compatible captured `IMAGE_REFERENCE` and verify its registry digest matches the pair record.
7. Start the application with the restored database and uploads path.
8. Wait for migrations to complete successfully.
9. Require `/api/ready` and `/api/health` to succeed.
10. Complete smoke checks for login, dashboard, static assets, representative uploads, and `/api/attendance/realtime`.
11. Reopen traffic only after the paired restore, readiness checks, and smoke checks all pass.

An image-only rollback is allowed only when every intervening migration is proven backward-compatible with the older application. If compatibility is not proven, restore the paired database and uploads artifacts and use the compatible IMAGE_REFERENCE captured with that pair.

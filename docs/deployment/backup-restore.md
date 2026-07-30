# Production Backup And Restore

This procedure is for the externally managed PostgreSQL database and the host uploads directory. It does not add a database service to the Politicall stack and must be performed before a deployment that can run migrations.

## Backup

1. Choose a timestamped backup directory outside the repository and record its artifact identifier.
2. Run `pg_dump` against the production database using a privileged operational channel. Do not put credentials in shell history, source files, or this document. A representative command is `pg_dump --format=custom --file <backup-file> <database-connection-from-secure-environment>`.
3. Validate the dump with `pg_restore --list <backup-file>` and retain the output with the change record.
4. Archive the uploads host directory while preserving ownership and timestamps, for example `tar --create --gzip --file <uploads-backup-file> --directory <uploads-parent-directory> <uploads-directory-name>`.
5. Validate the uploads archive with `tar --list --file <uploads-backup-file>` and store the database and uploads artifacts in access-controlled storage.

## Isolated Restore Validation (ambiente isolado)

1. Create an isolated, non-production PostgreSQL target with no route to production clients.
2. Restore the candidate database dump with `pg_restore --clean --if-exists --no-owner --dbname <isolated-database-connection> <backup-file>`.
3. Extract the uploads archive into an isolated directory and point an isolated application deployment at the restored database and uploads path.
4. Verify `/api/health`, `/api/ready`, login, a static asset, an upload, and `/api/attendance/realtime`.
5. Destroy the isolated restore environment after validation and retain only the approved backup artifacts according to the retention policy.

## Production Restore

Restore production only under an approved incident or rollback decision. First redeploy the previously captured application digest or tag. If the data state must also be reverted, stop application writes through the operational change process, restore the database from the validated backup, restore uploads to the same persistent host path, and run the smoke checks before reopening traffic. Never test a restore directly against the active production database.

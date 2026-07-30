# Portainer Production Deployment

This runbook defines the deployment contract only. Do not stop, recreate, or modify the current production container until the preflight, consistent backup, and rollback record are ready.

## Preflight

1. Confirm the candidate image passed every release gate.
2. Validate `IMAGE_REFERENCE` outside Compose. Accepted immutable forms are `ghcr.io/<org>/<app>:sha-<commit>` and `ghcr.io/<org>/<app>@sha256:<64-hex-digest>`. Reject any other tag policy unless the release process explicitly proves immutability. Compose only checks that `IMAGE_REFERENCE` is non-empty; it does not validate this format.
3. Resolve a SHA tag to its registry digest and capture IMAGE_REFERENCE and resolved digest in the same change record. Digest references are preferred for production deploys and rollbacks because they identify one manifest without relying on tag policy.
4. Complete and validate the paired database/uploads procedure in [backup-restore.md](backup-restore.md). Keep its image reference, migration inventory, artifact paths, and hashes in the same change record.
5. Confirm the Docker host has the persistent uploads directory and that container UID 1001 can write to it.
6. Confirm the external PostgreSQL instance is reachable by one of the connection options below.
7. Confirm APP_PORT and the Nginx `proxy_pass` port must match. The supplied Nginx file targets the default `APP_PORT=5000`; if the Portainer value changes, update and validate Nginx in the same change.
8. From the Docker host, verify `http://127.0.0.1:<APP_PORT>/api/health` reaches the intended local listener before routing external traffic to it.

## GHCR Registry

In Portainer, create a registry entry for `ghcr.io` using a GitHub account or machine account with read-only access to the private package. Use a token with the minimum package-read scope required by the registry. Store it in Portainer only; never put it in this repository, the stack file, an environment export, or a change record.

Before deployment, verify Portainer can pull the exact digest selected by the release. When a SHA tag is used, compare its resolved digest with the digest recorded during preflight before recreating the application.

## Stack Configuration

Create or update one Portainer stack from `docker-compose.yml`. The stack has only the `app` service and does not create, remove, or manage PostgreSQL.

Set these environment variables in Portainer, not in a committed `.env` file:

| Variable | Requirement |
| --- | --- |
| `IMAGE_REFERENCE` | Complete immutable GHCR SHA-tag or digest reference validated during preflight. |
| `APP_PORT` | Local host port used by Nginx; default is `5000`. |
| `UPLOADS_HOST_PATH` | Absolute, persistent directory on the Docker host. |
| `PROD_DATABASE_URL` | Required PostgreSQL connection string. |
| `SESSION_SECRET` | Required random session secret. |
| `DATA_ENCRYPTION_KEY` | Required 32-byte encryption key in the application-supported encoding. |
| `ADMIN_MASTER_PASSWORD_HASH` | Required bcrypt password hash. |
| `TRUST_PROXY` | Number of trusted proxy hops for the deployed Nginx topology. |
| `OKTOR_SMS_*` | Optional integration values; leave unset when SMS is not enabled. |

The uploads mount is persistent: `${UPLOADS_HOST_PATH}` is mounted at `/app/uploads`. Do not replace it with an anonymous volume or a repository-relative directory.

## External PostgreSQL

Preferred option: attach the application and database containers to an explicitly created shared Docker network, then use the database service DNS name in `PROD_DATABASE_URL`. Restrict the database port to that network and do not publish it publicly. Confirm DNS resolution and TLS settings before the first migration.

Legacy option: when a shared Docker network cannot yet be used, connect through a host-published database port using the Docker host gateway or a host address permitted by the platform. Restrict the host firewall so the database port is not publicly reachable. Treat this as a transition path and move to shared-network DNS when operationally possible.

## Deploy And Smoke Test

1. Keep traffic blocked after the consistent backup and set Portainer `IMAGE_REFERENCE` to the validated digest reference or SHA tag.
2. Run `docker-compose config --quiet` through an approved operator path when available, then pull and redeploy only the application stack.
3. Wait for the migration runner and the readiness start period. Verify `/api/health` and `/api/ready` both succeed.
4. Verify login, a dashboard request, a static asset, and an existing upload through Nginx.
5. Open an authenticated connection to `/api/attendance/realtime` and confirm the WebSocket remains connected.
6. Review logs for migration or readiness failures without copying secret values into the change record.
7. Reopen traffic only after the full smoke test passes.

## Rollback

Use the exact captured digest reference for rollback. An image-only rollback is permitted only when all migrations applied since that image are proven backward-compatible with the older application. Otherwise follow the production restore procedure in [backup-restore.md](backup-restore.md) and restore the paired database/uploads state with its compatible captured image before reopening traffic.

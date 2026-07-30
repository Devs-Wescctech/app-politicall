# Portainer Production Deployment

This runbook defines the deployment contract only. Do not stop, recreate, or modify the current production container until the preflight, backup, and rollback record are complete.

## Preflight

1. Confirm the candidate image passed CI and record the current production image tag and digest in the change record.
2. Create and validate database and uploads backups using [backup-restore.md](backup-restore.md).
3. Confirm the Docker host has the persistent uploads directory and that the container user can write to it.
4. Confirm the external PostgreSQL instance is reachable by one of the connection options below.
5. Keep the existing Nginx listener on the application port and install the reviewed WebSocket location from [nginx-websocket.conf](nginx-websocket.conf).

## GHCR Registry

In Portainer, create a registry entry for `ghcr.io` using a GitHub account or machine account with read-only access to the private package. Use a GitHub token with the minimum package-read scope required by the registry. Store it in Portainer only; never put it in this repository, the stack file, or a Portainer environment export.

Before the deploy, verify that Portainer can pull the exact image digest selected by the release. A release tag must be immutable and traceable to CI. Prefer an image digest when the Portainer UI supports it; otherwise use the captured SHA tag and record its digest alongside the deployment.

## Stack Configuration

Create or update one Portainer stack from the repository `docker-compose.yml`. The stack has only the `app` service and does not create, remove, or manage PostgreSQL.

Set these environment variables in Portainer, not in a committed `.env` file:

| Variable | Requirement |
| --- | --- |
| `IMAGE_REPOSITORY` | GHCR repository selected for the approved image. |
| `IMAGE_TAG` | Immutable CI SHA or release tag, never a mutable tag. |
| `APP_PORT` | Local host port used by Nginx; default is `5000`. |
| `UPLOADS_HOST_PATH` | Absolute, persistent directory on the Docker host. |
| `PROD_DATABASE_URL` | Required PostgreSQL connection string. |
| `SESSION_SECRET` | Required random session secret. |
| `DATA_ENCRYPTION_KEY` | Required 32-byte encryption key in the application-supported encoding. |
| `ADMIN_MASTER_PASSWORD_HASH` | Required bcrypt password hash. |
| `TRUST_PROXY` | Number of trusted proxy hops; use the deployed Nginx topology. |
| `OKTOR_SMS_*` | Optional integration values; leave unset when SMS is not enabled. |

The uploads mount is persistent: `${UPLOADS_HOST_PATH}` is mounted at `/app/uploads`. Do not replace it with an anonymous volume or a repository-relative directory.

## External PostgreSQL

Preferred option: attach the application and database containers to an explicitly created shared Docker network, then use the database service DNS name in `PROD_DATABASE_URL`. Restrict the database port to that network and do not publish it publicly. Confirm DNS resolution and TLS settings before the first migration.

Legacy option: when a shared Docker network cannot yet be used, keep PostgreSQL on a host-published port and connect through the Docker host gateway or host address permitted by the platform. Restrict the host firewall so the database port is not publicly reachable. Treat this as a transition path and move to shared-network DNS when operationally possible.

## Deploy And Smoke Test

1. Capture the image tag and digest selected for this deploy.
2. Update only `IMAGE_TAG` or the digest reference in Portainer, then pull and redeploy the stack.
3. Wait through the migration-compatible readiness start period, then verify `/api/health` returns success and `/api/ready` returns success.
4. Verify login, a dashboard request, a static asset, and an existing upload through Nginx.
5. Open an authenticated connection to `/api/attendance/realtime` and confirm the WebSocket remains connected.
6. Review container logs for migration or readiness failures without copying secret values into the change record.

## Rollback

On a failed smoke test, redeploy the exact tag or digest captured before the change. Keep the same uploads host path. Restore the database only when the migration or data state requires it, following the isolated restore validation in [backup-restore.md](backup-restore.md). Record the restored image digest and the backup artifact identifier.

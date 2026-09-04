# Portainer Production Deployment

This runbook defines the deployment contract only. Do not stop, recreate, or modify the current production container until the preflight, consistent backup, and rollback record are ready.

## Preflight

1. Confirm the candidate image passed every release gate.
2. Validate `IMAGE_REFERENCE` outside Compose. Accepted immutable forms are `ghcr.io/<org>/<app>:sha-<commit>` and `ghcr.io/<org>/<app>@sha256:<64-hex-digest>`. Reject any other tag policy unless the release process explicitly proves immutability. Compose only checks that `IMAGE_REFERENCE` is non-empty; it does not validate this format.
3. Resolve a SHA tag to its registry digest and capture IMAGE_REFERENCE and resolved digest in the same change record. Digest references are preferred for production deploys and rollbacks because they identify one manifest without relying on tag policy.
4. Complete and validate the paired database/uploads procedure in [backup-restore.md](backup-restore.md). Keep its image reference, migration inventory, artifact paths, and hashes in the same change record.
5. Confirm the Docker host has the persistent uploads directory and that container UID 1001 can write to it.
6. Precreate or reuse one stable user-defined Docker network. Set its exact name as `APP_NETWORK_NAME`; when creation is required, an approved operator can run `docker network create <app-network-name>` before deploying the stack.
7. Confirm the existing PostgreSQL container is attached to that network. When attachment is required, an approved operator can run `docker network connect <app-network-name> <postgres-container-name>` before the application deploy. This runbook does not execute either command or alter the current container.
8. Confirm the external PostgreSQL instance is reachable by its container DNS name on the shared network.
9. Confirm APP_PORT and the Nginx `proxy_pass` port must match. The supplied Nginx file targets the default `APP_PORT=5000`; if the Portainer value changes, update and validate Nginx in the same change.
10. From the Docker host, verify `http://127.0.0.1:<APP_PORT>/api/health` reaches the intended local listener before routing external traffic to it.
11. Confirm the external proxy preserves WebSocket upgrade headers for `/api/attendance/realtime`; the operator UI may fall back to HTTP polling, but production release sign-off requires the badge to reach `Conectado`.

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
| `APP_NETWORK_NAME` | Name of the pre-existing external Docker network shared with PostgreSQL. |
| `UPLOADS_HOST_PATH` | Absolute, persistent directory on the Docker host. |
| `PROD_DATABASE_URL` | Required PostgreSQL connection string. |
| `SESSION_SECRET` | Required random session secret. |
| `DATA_ENCRYPTION_KEY` | Required canonical base64 encoding of exactly 32 random bytes. The app fails before serving when it is missing or invalid. |
| `TOKEN_FINGERPRINT_KEY` | Required canonical base64 encoding of exactly 32 random bytes used only for WHU token fingerprints. Its rotation is gated by the automatic startup re-fingerprint described below. |
| `PUBLIC_APP_ORIGINS` | Optional comma-separated list of additional exact HTTPS origins, such as the approved `www` alias. |
| `LEGACY_DATA_ENCRYPTION_KEY` | Optional and temporary. Retain only through the data-key backup/rotation/rollback window, then remove it. |
| `ADMIN_MASTER_PASSWORD_HASH` | Required bcrypt password hash. |
| `TRUST_PROXY` | Number of trusted proxy hops for the deployed Nginx topology. |
| `ENABLE_BEARER_AUTH` | Keep `false`; temporary browser Bearer fallback is disabled by default. |
| `ENABLE_BEARER_EXCHANGE` | Keep `false`; enable only for a short audited legacy browser-session migration window. |
| `OKTOR_SMS_*` | Optional integration values; leave unset when SMS is not enabled. |

## Authentication Rollout

Deploy cookie-only first. The current browser contract uses host-only HttpOnly session cookies, readable CSRF cookies, exact `PUBLIC_APP_URL` plus optional `PUBLIC_APP_ORIGINS` validation, and `x-csrf-token` on authenticated mutations. `ENABLE_BEARER_AUTH=false` keeps legacy browser Bearer authentication disabled, and `ENABLE_BEARER_EXCHANGE=false` keeps the one-time exchange endpoint closed.

Required checks before reopening traffic:

1. Confirm `PUBLIC_APP_URL` exactly matches the primary HTTPS public origin and every `PUBLIC_APP_ORIGINS` entry is an approved alias.
2. Rotate `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `TOKEN_FINGERPRINT_KEY`, and `ADMIN_MASTER_PASSWORD_HASH` before production sign-off. If any previous value was exposed outside the secret manager, revoke or purge it before a public Git/GHCR release.
3. Login as a tenant user and verify dashboard, refresh, logout, and one mutating request with CSRF.
4. Login as global admin and verify `/api/admin/verify`, impersonation, admin logout, and tenant logout.
5. Confirm browser storage contains no tenant/admin credential values; only non-authoritative UI preferences such as theme or impersonation display state may remain.
6. Confirm cookies include `HttpOnly` for access/refresh cookies, `SameSite=Lax`, and `Secure` over HTTPS.

If the deployment must preserve old browser sessions, enable only `ENABLE_BEARER_EXCHANGE=true` for a short maintenance window while keeping `ENABLE_BEARER_AUTH=false`. Validate `/api/auth/exchange` and `/api/admin/auth/exchange` from the approved origin, confirm cookies are issued, then disable `ENABLE_BEARER_EXCHANGE` again and repeat the login/refresh/logout smoke checks. Do not leave exchange enabled as a normal production mode.

## Data Key Rotation

1. Take and validate the paired database/uploads backup described in `backup-restore.md`; retain the previous key for rollback.
2. Run `node dist/rotate-data-encryption.js` first. It is dry-run by default and reports only counts, table/field names, and row IDs.
3. Investigate any malformed or undecryptable rows without changing their values. Do not use output as a source of credentials.
4. During a controlled maintenance window run `node dist/rotate-data-encryption.js --apply`, verify a following dry run has no rotatable rows, then keep `LEGACY_DATA_ENCRYPTION_KEY` only for the approved rollback window.
5. Remove `LEGACY_DATA_ENCRYPTION_KEY` only after the backup retention and rollback window have elapsed. Restore the paired backup and prior key together for operational rollback.

## WHU Token Fingerprint Backfill

The production migration runner performs an automatic WHU token fingerprint backfill after migration `0019` and before the application accepts traffic. On every startup it scans all active WHU channel connections with a token, decrypts each retained token only in process, and recomputes its fingerprint using the current `TOKEN_FINGERPRINT_KEY`. It updates divergent fingerprints with compare-and-set protection in batches and is idempotent on later starts.

`TOKEN_FINGERPRINT_KEY` rotation is therefore an automatic all-active-WHU re-fingerprint during startup, not a manual key swap. The application remains unavailable until the scan completes. An invalid fingerprint key or a global active WHU token conflict fails startup closed. Do not bypass the migration: disable or rotate the duplicate active connection, correct the key configuration when applicable, then restart so the automatic backfill can resume.

The uploads mount is persistent: `${UPLOADS_HOST_PATH}` is mounted at `/app/uploads`. Do not replace it with an anonymous volume or a repository-relative directory.

## Petition WhatsApp Contact Message

Migration `0027_petition_whatsapp_message.sql` adds the nullable
`petitions.contact_whatsapp_message` column. It is additive and compatible
with an image rollback that does not know the field; do not drop the column
during an image-only rollback.

The petition editor keeps the post-signature WhatsApp contact message
separate from the petition sharing text. Its supported variables are exactly
`{nome}`, `{cidade}`, `{peticao}`, and `{link}`. Unknown variables and messages
longer than 1,000 characters are rejected by the API. Brazilian contact
numbers entered with 10 or 11 digits receive country code `55` before the
`wa.me` link is generated; already complete 12-15 digit international numbers
are preserved.

For release smoke testing, create or edit a disposable petition, configure a
contact number and message, sign it with a non-production test identity, and
inspect the post-signature WhatsApp URL. It must contain the canonical number
and an encoded `text` query with no literal `undefined` values. The ordinary
petition sharing buttons must retain their existing sharing text and behavior.

## External PostgreSQL

Preferred option: set `APP_NETWORK_NAME` to the stable external network created during preflight, attach the existing PostgreSQL container to it, and configure `PROD_DATABASE_URL` with the database container DNS name. Compose attaches the application to this network but never creates or manages the database service. Restrict database access to the shared network and confirm DNS resolution and TLS settings before the first migration.

The host-published database port remains a legacy option when DNS migration cannot be completed in the same window. Restrict the host firewall so the database port is not publicly reachable. The application remains attached to the external network even while this legacy endpoint is used, allowing the database connection to move to container DNS in a later reviewed change.

## External Nginx And Attendance Realtime

Use [nginx-websocket.conf](nginx-websocket.conf) as two separate snippets: place its `map` block in the Nginx `http` context, and place only its `location = /api/attendance/realtime` block in the HTTPS `server` block for the public domain. Do not include the whole file inside the server block. The app endpoint is exact-match `/api/attendance/realtime`, authenticated by the browser session cookie, and must not be exposed with credentials in query strings.

Required checks before reopening traffic:

1. `nginx -t` passes and the proxy reload is controlled.
2. `GET /api/health` and `GET /api/ready` pass through Nginx.
3. An authenticated operator opens `Atendimentos` and the connection badge reaches `Conectado`.
4. The browser Network panel shows `101 Switching Protocols` for `/api/attendance/realtime`.
5. A controlled inbound test message appears in the selected conversation while the socket is connected.
6. Repeat one blocked-upgrade test only in staging or a local QA harness: the badge should show `Sincronizacao automatica` and inbound messages should still appear through polling. This fallback confirms resilience, but it is not sufficient for production sign-off.

Rollback for proxy-only changes is to restore the previous Nginx server block and reload after `nginx -t`. If the application was also redeployed, follow the image/database rollback rules below instead of treating it as a proxy-only rollback.

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

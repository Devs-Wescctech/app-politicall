# Authentication API Contract

This document describes the browser authentication contract used by Politicall after the cookie-session hardening. It intentionally documents cookie and CSRF behavior instead of token values. Never place real cookie values, bearer tokens, passwords, database URLs, or hashes in examples.

## Shared Rules

- Production requires `PUBLIC_APP_URL`. Browser credential routes accept its exact origin plus any exact origins listed in the optional comma-separated `PUBLIC_APP_ORIGINS` value.
- Credential-bearing cookies are host-only, `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.
- Browser requests must use `credentials: "include"`.
- State-changing authenticated requests require `x-csrf-token`.
- CSRF tokens use the double-submit cookie pattern: the readable CSRF cookie value must match the `x-csrf-token` header and the session.
- Successful auth responses set cookies and return only public JSON. Access token, refresh token, CSRF token, cookie values, password hashes, and session secrets are never returned in response bodies.
- Generic authentication failures use `{ "error": "Authentication failed" }` and `Cache-Control: no-store`.
- Tenant browser Bearer fallback is disabled by default with `ENABLE_BEARER_AUTH=false`.
- Legacy Bearer exchange is disabled by default with `ENABLE_BEARER_EXCHANGE=false` and must be enabled only for a short, audited migration window.

## Cookies

| Cookie | Scope | Path | HttpOnly | Lifetime |
| --- | --- | --- | --- | --- |
| `politicall_access` | tenant user access session | `/` | yes | 15 minutes |
| `politicall_refresh` | tenant user refresh session | `/api/auth/refresh` | yes | up to 7 days |
| `politicall_csrf` | tenant user CSRF token | `/` | no | refresh-session remaining time |
| `politicall_admin_access` | global admin access session | `/` | yes | 15 minutes |
| `politicall_admin_refresh` | global admin refresh session | `/api/admin/auth/refresh` | yes | up to 4 hours |
| `politicall_admin_csrf` | global admin CSRF token | `/` | no | refresh-session remaining time |

## Public Tenant Auth

### POST `/api/auth/register`

Creates the account owner and the initial tenant session.

Authentication: public, exact `Origin` required.

Body:

```json
{
  "email": "user@example.test",
  "password": "minimum-accepted-password",
  "name": "User Name",
  "permissions": {}
}
```

Response `200`:

```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.test",
    "name": "User Name",
    "role": "admin",
    "permissions": {}
  }
}
```

Notes:

- Account, first user, and first session are committed in one database transaction.
- Duplicate email, validation failure, invalid origin, or internal session failure return only generic authentication failure.
- Rate limit: 10 registration attempts per IP per 15 minutes.

### POST `/api/auth/login`

Starts a tenant user session.

Authentication: public, exact `Origin` required.

Body:

```json
{
  "email": "user@example.test",
  "password": "password"
}
```

Response `200`: same public `user` shape as registration.

Failure and limits:

- Invalid credentials, malformed payload, stale password race, and storage errors return generic authentication failure.
- Rate limits: 300 attempts per IP and 5 attempts per normalized email per 15 minutes.

### GET `/api/auth/me`

Returns the current tenant user profile from the access cookie.

Authentication: tenant access cookie.

Response `200`: public user/account profile. Unauthorized requests return `401`.

## Tenant Session Maintenance

### GET `/api/auth/csrf`

Refreshes the readable tenant CSRF cookie for the current access session.

Authentication: tenant access cookie.

Response `200`:

```json
{ "csrf": true }
```

### POST `/api/auth/refresh`

Rotates a tenant refresh session and issues fresh access, refresh, and CSRF cookies.

Authentication: tenant refresh cookie plus `x-csrf-token`.

Response `200`: public `user` JSON. Missing, expired, reused, or invalid refresh sessions clear cookies and return generic authentication failure.

### DELETE `/api/auth/refresh`

Revokes the refresh-session family and clears tenant cookies.

Authentication: tenant refresh cookie plus `x-csrf-token`.

Response `204`: empty body.

### POST `/api/auth/logout`

Revokes the current tenant access session and clears tenant cookies.

Authentication: tenant access cookie plus `x-csrf-token`.

Response `204`: empty body.

### POST `/api/auth/exchange`

One-time migration endpoint that exchanges a valid legacy tenant Bearer session for cookies.

Authentication: `Authorization: Bearer <legacy-token>`, exact `Origin`, and `ENABLE_BEARER_EXCHANGE=true`.

Response `200`: public `user` JSON and cookies. Disabled, reused, invalid, expired, or cross-tenant tokens return generic authentication failure.

## Global Admin Auth

### POST `/api/admin/login`

Starts a global admin session.

Authentication: public, exact `Origin` required.

Body:

```json
{ "password": "admin-password" }
```

Response `200`:

```json
{ "admin": true }
```

Failure and limits:

- Invalid password, malformed payload, stale password race, and storage errors return generic authentication failure.
- Rate limit: 10 attempts per IP per 15 minutes.

### GET `/api/admin/verify`

Verifies the current global admin access cookie.

Authentication: global admin access cookie.

Response `200`:

```json
{ "valid": true }
```

## Global Admin Session Maintenance

The admin maintenance endpoints mirror tenant endpoints with the `/api/admin/auth` base path:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/auth/csrf` | Refresh admin CSRF cookie for the current access session. |
| `POST` | `/api/admin/auth/refresh` | Rotate admin refresh session and set fresh cookies. |
| `DELETE` | `/api/admin/auth/refresh` | Revoke admin refresh-session family and clear admin cookies. |
| `POST` | `/api/admin/auth/logout` | Revoke current admin access session and clear admin cookies. |
| `POST` | `/api/admin/auth/exchange` | One-time legacy global admin Bearer-to-cookie exchange when explicitly enabled. |

## Impersonation

### POST `/api/admin/users/:id/impersonate`

Issues a tenant user session for a selected gabinete admin while keeping the browser's global admin session separate.

Authentication: global admin access cookie plus the route's admin authorization checks.

Path params:

- `id`: target user ID.

Response `200`: public tenant `user` JSON and tenant cookies.

Rules:

- Only users with role `admin` can be impersonated.
- The response does not expose the global admin access token, tenant access token, refresh token, CSRF token, or password hash.
- Browser state may keep a non-authoritative impersonation UI marker, but authorization always comes from cookies and server checks.

## Status Codes

| Status | Meaning |
| --- | --- |
| `200` | Session created, refreshed, verified, or exchanged. |
| `204` | Logout completed and cookies cleared. |
| `400` | Malformed request, failed registration transaction, or generic credential failure. |
| `401` | Missing or invalid authentication. |
| `403` | Exact origin or CSRF validation failed. |
| `429` | Rate limit exceeded. |

## Deployment Notes

- Production must start with `ENABLE_BEARER_AUTH=false` and `ENABLE_BEARER_EXCHANGE=false`.
- Configure `PUBLIC_APP_ORIGINS` only for additional HTTPS hostnames that serve the same application, such as the approved `www` alias. Cookies remain host-only, so each hostname maintains its own browser session.
- When migration from old browser Bearer sessions is required, enable only `ENABLE_BEARER_EXCHANGE=true` for a short window, validate `/api/auth/exchange` and `/api/admin/auth/exchange`, then disable it again.
- Rotate `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, and admin password hash before production sign-off. Purge or revoke any historical secret that appeared outside the secret manager before pushing a public release.

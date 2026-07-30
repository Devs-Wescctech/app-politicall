# Authentication and HTTP Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-stored 30-day JWTs with revocable, rotating HttpOnly cookie sessions while preserving user, admin, impersonation, and realtime workflows.

**Architecture:** Short-lived signed access cookies are backed by hashed rotating refresh sessions in PostgreSQL. A shared HTTP client manages credentials and CSRF; a temporary Bearer exchange supports controlled rollout. Data encryption receives a separate versioned keyring and migration command.

**Tech Stack:** Express 4.21, PostgreSQL/Drizzle, jsonwebtoken, Node crypto, bcrypt, `cookie`, React Query, Vitest.

## Global Constraints

- No authentication credential may be accessible through `localStorage` or returned in normal login JSON after migration.
- Access tokens expire after 15 minutes.
- User refresh sessions expire after 7 days; admin refresh sessions expire after 4 hours.
- Refresh tokens are random and only SHA-256 hashes are stored.
- State-changing authenticated requests require a valid CSRF double-submit token and allowed Origin.
- Bearer compatibility is temporary, tested, and disabled by configuration after rollout.
- Existing encrypted integration values must remain readable during key rotation.

---

### Task 1: Add the session persistence model

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0010_auth_sessions.sql`
- Create: `server/services/auth-session-store.ts`
- Create: `server/services/auth-session-store.test.ts`

**Interfaces:**
- Produces: `createSession`, `findRefreshSession`, `rotateSession`, `revokeSession`, `revokeSessionFamily`, and `revokeUserSessions`.

- [ ] **Step 1: Write RED store tests**

Test tenant isolation, hashed token lookup, rotation linkage, expiry, reuse revocation, logout and password-change revocation.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/services/auth-session-store.test.ts`

Expected: FAIL because the store and table do not exist.

- [ ] **Step 3: Add schema and additive migration**

Define `auth_sessions` with a stable family ID, rotation linkage, bounded hashed
device/IP metadata, and indexes on refresh hash, user, account and expiry. Add a
`legacy_auth_exchanges` table keyed by SHA-256 token hash so each legacy Bearer token
can be exchanged only once and its marker survives for the original token lifetime.
Never store a raw refresh or legacy token.

- [ ] **Step 4: Implement the store**

Use:

```ts
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

All tenant mutations include `accountId`; global-admin rows use an explicit admin
principal rather than inheriting a user tenant. Rotation and reuse-family revocation
occur in one transaction.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- server/services/auth-session-store.test.ts`

Expected: PASS.

Commit: `feat: add revocable authentication sessions`

### Task 2: Create cookie, JWT, and CSRF primitives

**Files:**
- Create: `server/security/auth-cookies.ts`
- Create: `server/security/auth-cookies.test.ts`
- Create: `server/security/csrf.ts`
- Create: `server/security/csrf.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `issueAccessToken`, `readAccessToken`, `createRefreshToken`, `setSessionCookies`, `clearSessionCookies`, `issueCsrfToken`, `requireCsrf`.

- [ ] **Step 1: Write RED tests**

Assert user/admin cookie names, refresh-only paths, HttpOnly, Secure production
behavior, SameSite=Lax, max ages, session-bound CSRF signatures, constant-time
comparison and Origin allowlist.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/security/auth-cookies.test.ts server/security/csrf.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add `cookie@2.0.1` and implement primitives**

Use `crypto.randomBytes(32).toString("base64url")` for refresh and CSRF nonces. Access
JWT claims include `sid` and session kind, use an explicit issuer/audience/algorithm,
and expire after exactly 15 minutes. Bind each CSRF token to that `sid` and session
kind with an HMAC under `SESSION_SECRET`; require header, cookie and signature to
agree using constant-time comparison. Use distinct readable `politicall_csrf` and
`politicall_admin_csrf` cookies so user and global-admin sessions can coexist. Parse
request cookies with the actual `cookie@2.0.1` API, `cookie.parseCookie`; use Express
`res.cookie`/`res.clearCookie` with matching path/security attributes.

Use `/` for access/CSRF cookies, `/api/auth/refresh` for the user refresh cookie and
`/api/admin/auth/refresh` for the admin refresh cookie.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- server/security/auth-cookies.test.ts server/security/csrf.test.ts`

Expected: PASS.

Commit: `feat: add secure auth cookie primitives`

### Task 3: Implement login, refresh, exchange, and logout services

**Files:**
- Create: `server/services/auth-session-service.ts`
- Create: `server/services/auth-session-service.test.ts`
- Modify: `server/services/auth-session-store.ts`
- Modify: `server/services/auth-session-store.test.ts`
- Modify: `server/security/auth-cookies.ts`
- Modify: `server/security/auth-cookies.test.ts`
- Modify: `server/routes.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: Session store and cookie primitives.
- Produces: `/api/auth/csrf`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/exchange`, `/api/auth/logout`, plus admin equivalents.

- [ ] **Step 1: Write RED service tests**

Cover user login, admin login, refresh rotation without sliding the original family
expiry, expired refresh, token reuse, logout after access expiry, user/admin isolation,
one-time Bearer exchange, and exchange gating through `ENABLE_BEARER_EXCHANGE`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/services/auth-session-service.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement session issuance**

Login JSON returns `{ user }` or `{ admin: true }`, never raw tokens. Resolve an
opaque refresh cookie only through its SHA-256 hash and expected session kind, then
derive tenant/principal scope from the stored row. Refresh rotates the database row
and all cookies, inherits the source row's absolute expiry, and sets only the
remaining cookie lifetime. Logout is idempotent and is also available as a
CSRF-protected `DELETE` on each exact refresh path so an expired access cookie does
not prevent server-side revocation.

- [ ] **Step 4: Integrate routes and rate limits**

Apply stricter limits to login, refresh, exchange and admin auth. Require an exact
configured Origin; `PUBLIC_APP_URL` is fail-closed in production and defaults only
for local development. Responses use `Cache-Control: no-store`. Revoke the affected
user/session families in the existing profile-password, user-administration and
admin-master password-change flows. Preserve the independent `Bearer pk_*` API-key
contract in `server/auth-api.ts`; it is not browser authentication.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- server/services/auth-session-service.test.ts server/auth-api.test.ts`

Expected: PASS.

Commit: `feat: add rotating cookie authentication endpoints`

### Task 4: Update authorization middleware and proxy security

**Files:**
- Modify: `server/auth.ts`
- Create: `server/auth-cookie.test.ts`
- Create: `server/security/request-security.ts`
- Create: `server/security/request-security.test.ts`
- Modify: `server/index.ts`
- Modify: `server/security-headers.ts`
- Modify: `server/security-headers.test.ts`

**Interfaces:**
- Produces: cookie-first authentication with temporary Bearer fallback, explicit trust proxy, global API limiter, CSP and scoped body limits.

- [ ] **Step 1: Write RED tests**

Test cookie authentication, disabled Bearer fallback, CSRF on authenticated mutation, trusted one-hop proxy, CSP directives, generic errors and global body limit.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/auth-cookie.test.ts server/security/request-security.test.ts server/security-headers.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement middleware**

`authenticateToken` reads `politicall_access` first. Bearer is accepted only when `ENABLE_BEARER_AUTH=true`. Configure `app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1))` in production.

- [ ] **Step 4: Implement CSP and limits**

Use a CSP that permits self, Google Fonts, HTTPS images, `data:`, `blob:`, HTTPS/WSS connections, and inline styles required by React while rejecting objects and foreign frames.

- [ ] **Step 5: Verify GREEN and commit**

Run the same test command and expect PASS.

Commit: `feat: enforce cookie auth and http security policy`

### Task 5: Migrate the shared frontend HTTP client

**Files:**
- Modify: `client/src/lib/auth.ts`
- Modify: `client/src/lib/queryClient.ts`
- Create: `client/src/lib/session.ts`
- Create: `client/src/lib/session.test.ts`
- Modify: `client/src/pages/login.tsx`
- Modify: `client/src/components/app-sidebar.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: `ensureCsrfToken()`, `refreshSession()`, `logoutSession()`, and cookie-only `apiRequest`.

- [ ] **Step 1: Write RED client tests**

Assert no auth token localStorage calls, credentials included, CSRF header on mutation, one refresh attempt after 401, and logout cache cleanup.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/lib/session.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the session client**

Keep only non-sensitive user display cache. `apiRequest` obtains CSRF before mutation, retries one time after successful refresh, and never attaches Authorization.

- [ ] **Step 4: Migrate login and logout**

Login stores returned user display data only. Logout calls the API, clears query/attendance caches and navigates to login.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- client/src/lib/session.test.ts`

Expected: PASS.

Commit: `feat: migrate user client to cookie sessions`

### Task 6: Remove administrative tokens from browser storage

**Files:**
- Create: `client/src/lib/admin-session.ts`
- Create: `client/src/lib/admin-session.test.ts`
- Modify: `client/src/pages/admin-login.tsx`
- Modify: `client/src/pages/admin.tsx`
- Modify: `client/src/pages/admin-sales.tsx`
- Modify: `client/src/pages/contracts.tsx`
- Modify: `client/src/pages/settings.tsx`
- Modify: `client/src/components/admin-bottom-nav.tsx`
- Modify: `client/src/components/admin/AdminIntegrationsDialog.tsx`

**Interfaces:**
- Produces: `adminRequest` using admin cookies and CSRF, plus cookie-based impersonation.

- [ ] **Step 1: Write RED tests and source guard**

Test admin CSRF/refresh and add a deployment test that rejects `localStorage.getItem("admin_token")`, `setItem("admin_token")`, and `X-Admin-Token`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/lib/admin-session.test.ts tests/deployment-config.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement and migrate all call sites**

Use `adminRequest` everywhere. The server reads the independent admin cookie when validating impersonation; no admin credential is exposed to page JavaScript.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npm test -- client/src/lib/admin-session.test.ts tests/deployment-config.test.ts
rg -n "admin_token|X-Admin-Token|auth_token" client/src
```

Expected: tests PASS and no credential storage/header matches remain.

Commit: `feat: migrate admin workflows to secure sessions`

### Task 7: Separate and rotate data encryption keys

**Files:**
- Modify: `server/crypto.ts`
- Create: `server/crypto-rotation.test.ts`
- Create: `scripts/rotate-data-encryption.ts`
- Create: `server/services/data-key-rotation.ts`
- Create: `server/services/data-key-rotation.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: versioned ciphertext `v2:<keyId>:<iv>:<tag>:<data>` and a dry-run capable rotation service.

- [ ] **Step 1: Write RED crypto tests**

Cover v2 round-trip, wrong key rejection, legacy decrypt with explicit legacy key, rotation to v2, dry run, and redacted logging.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/crypto-rotation.test.ts server/services/data-key-rotation.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement keyring**

Require `DATA_ENCRYPTION_KEY` in production. Permit legacy decrypt only when `LEGACY_DATA_ENCRYPTION_KEY` is set. New writes always use v2.

- [ ] **Step 4: Implement rotation command**

Enumerate only known encrypted integration columns, decrypt with legacy/new keyring,
re-encrypt with the active key, and update in transactions. `--dry-run` reports
IDs/counts only. Add `scripts/rotate-data-encryption.ts` to the production build so the
command is available as `dist/rotate-data-encryption.js`, but never execute it during
normal container startup.

- [ ] **Step 5: Verify GREEN and commit**

Run the RED command again and expect PASS.

Commit: `feat: separate and rotate integration encryption keys`

### Task 8: Complete auth validation and evidence

**Files:**
- Create: `docs/testing/auth-security-hardening.tdd.md`
- Modify: `docs/deployment/portainer-production.md`

**Interfaces:**
- Consumes: All authentication RED/GREEN evidence.
- Produces: Rollout sequence that preserves active production access.

- [ ] **Step 1: Run full gates**

Run `npm run check`, `npm test`, `npm run build`, `npm run security:secrets`, and the
production audit.

- [ ] **Step 2: Run Browser QA**

Verify user login/logout, refresh after access expiry, admin login/logout, impersonation, two simultaneous sessions, CSRF rejection, mobile login and no credential values in browser storage.

- [ ] **Step 3: Document staged rollout**

Document enable cookie auth, exchange old session, smoke, disable Bearer auth, run data-key dry-run, rotate data, rotate session secret, and remove legacy data key.

- [ ] **Step 4: Commit**

Commit: `docs: record authentication hardening evidence`

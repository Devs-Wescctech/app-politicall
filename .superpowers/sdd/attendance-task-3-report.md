# Attendance Realtime Resilience Task 3 Report

Status: APPROVED

## Scope and source material

- Worktree: `C:\Users\guilherme.pereira\Documents\Politicall-worktrees\production-hardening`
- Branch: `codex/production-hardening`
- Base commit: `d463e1bfac6e5091ea847b627fbfbfb176fee0cf`
- Requirements: `.superpowers/sdd/task-3-brief.md`
- Binding clarifications:
  `.superpowers/sdd/attendance-task-3-controller-clarifications.md`
- Preserved contracts: Task 1 reconciliation and Task 2 connection state,
  generation, zero-based backoff, and two-confirmation recovery.
- Excluded operations: no production, Git remote, Nginx, DNS, Portainer, or
  deployment action was performed.

## Commits

### RED

```text
1fe0be0 test: specify resilient attendance cookie transport
```

This commit added executable client/controller and server/socket tests and
migrated the existing connected and pending-auth lifecycle happy paths from
query tokens to cookie, Origin, and authoritative session setup.

### GREEN/refactor

```text
4f5fde6 feat: make attendance realtime cookie based and resilient
```

This commit added the injectable controller, thin React hook integration,
shared heartbeat protocol, cookie/session/Origin WebSocket authentication,
observable application heartbeats, connection identifiers, and lifecycle
cleanup.

## TDD evidence

### Initial RED

Command:

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts
```

Result: FAIL as intended. Vitest reported 18 failed and 11 passed tests. All 12
client cases failed because `createAttendanceRealtimeController` did not yet
exist. Server positive handshake/heartbeat cases failed because the legacy
implementation rejected the valid cookie, while Origin and query-credential
expectations exposed the old authentication order.

Command:

```text
npm test -- server/attendance-events.test.ts
```

Result: FAIL as intended. The 2 migrated cookie happy paths failed because the
server still required `?token=`.

### Concurrency regression RED

Command:

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts
```

Result: FAIL as intended with 1 failed and 12 passed tests. The current socket
was not physically closed by its `error` callback. The controller was then
changed to close that socket while neutralizing callbacks and retaining one
reconnect timer.

### GREEN

Command:

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts
```

Result: PASS, 2 files and 31 tests passed.

## Delivered guarantees

### Browser transport

- The URL is exactly the same-origin
  `/api/attendance/realtime` WebSocket URL with no query or credential.
- A testable controller owns sockets, retries, heartbeats, online/offline and
  visibility listeners; the React hook only bridges controller snapshots.
- Every callback captures and validates its socket generation. Replacement,
  offline, manual reconnect, and cleanup neutralize stale callbacks.
- Pre-open close uses attempt zero; open resets backoff; retries use the Task 2
  bounded jitter helper.
- The acknowledgement is confirmation one and the first matching application
  heartbeat is confirmation two. Business packets do not accelerate recovery.
- Hidden tabs suspend heartbeat failure timers. Visibility return evaluates
  staleness immediately.
- Cleanup removes exact listeners, clears reconnect and heartbeat timers,
  neutralizes callbacks, and closes the active socket idempotently.
- Malformed, unknown, wrong-account, and stale-connection packets are ignored.
  Approved business packets use `applyAttendanceRealtimeEvent`; settings
  invalidations remain intact.
- Transport transitions do not clear query data or mutate host draft,
  selection, or scroll state, and the controller has no outbound-send path.

### Server transport

- Authentication uses only `politicall_access` through `readAccessToken`,
  `resolveAccessSession`, and a fresh user lookup.
- Active, unrevoked, unexpired user session shape and exact
  session/user/account agreement are enforced. Admin cookies and Bearer auth do
  not authenticate this endpoint.
- Any query string is rejected before authentication, including legacy
  credential parameters even when a valid cookie is present.
- Missing and non-allowlisted Origins are rejected using the browser
  authentication Origin source before `handleUpgrade`.
- The `ws` no-server lifecycle installs a temporary socket error handler,
  authenticates asynchronously, checks instance/socket liveness after each
  lookup, removes the temporary handler before upgrade, and emits the standard
  connection event.
- Connected packets contain a fresh non-secret connection ID, user ID, account
  ID, heartbeat interval, and timestamp. Application heartbeats contain only
  connection/account scope and timestamp.
- Protocol ping/pong, pending-auth shutdown, connected-client shutdown,
  heartbeat cleanup, listener cleanup, and setup/close exclusion are preserved.

## Final validation

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts
```

PASS: 2 files, 31 tests.

```text
npm test -- server/attendance-events.test.ts
```

PASS: 1 file, 5 tests.

```text
npm test -- client/src/lib/attendance-reconciliation.test.ts client/src/lib/attendance-connection-state.test.ts
```

PASS: 2 files, 25 tests.

```text
npm test
```

PASS: 87 files passed, 2 skipped; 666 tests passed, 2 skipped.

```text
npm run check
```

PASS: TypeScript exited 0.

```text
npm run build
```

PASS: Vite client build and all three esbuild server/script bundles exited 0.

```text
npm run security:secrets
```

PASS: release secret scan exited 0.

```text
npm audit --omit=dev
```

PASS: 0 vulnerabilities.

```text
git diff --check d463e1b..HEAD
```

PASS: no whitespace errors.

## Review 1 remediation

- Review contract: `.superpowers/sdd/attendance-task-3-review-1.md`
- Reviewed head: `aecc522`
- Review verdict: `CHANGES_REQUIRED`
- Current status: fixes implemented and awaiting independent re-review. This
  report does not mark the task approved.

### Review 1 commits

```text
823fa4d test: cover attendance realtime review gaps
e7da731 fix: harden attendance realtime admission and smoke
```

### Review 1 RED evidence

Command:

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts
```

Result: FAIL as intended, 3 failed and 13 passed. The failures demonstrated
that `attendance.conversation.created` was dropped, two immediate
`reconnectNow()` calls created two replacement sockets, and a socket that never
opened had no 10-second deadline.

Command:

```text
npm test -- server/attendance-events-cookie.test.ts
```

Result: FAIL as intended, 8 failed and 21 passed. Bare-query, fragment, and
absolute-form targets upgraded or used the legacy query rejection path;
pending-auth overload attempts were not rejected; authentication had no
deadline; and a 4,097-byte inbound payload remained open.

Command:

```text
npm test -- tests/attendance-smoke-helpers.test.ts
```

Result: FAIL as intended because
`scripts/attendance-smoke-helpers.mjs` did not exist.

### Review 1 changes

- The client now routes every bounded, same-account `attendance.*` business
  packet through `applyAttendanceRealtimeEvent`, while reserving
  `attendance.realtime.*` for validated control packets and preserving settings
  invalidations.
- Manual reconnects are coalesced while their replacement socket is pending.
  The flag clears only when that socket opens or fails; connected sockets remain
  a no-op.
- Every browser socket receives a generation-safe 10-second pre-open deadline.
  Timeout closes the socket, enters fallback, and schedules exactly one
  attempt-zero retry. Offline, replacement, open, failure, and cleanup clear
  the deadline.
- The server accepts only the literal raw target
  `/api/attendance/realtime`. Bare `?`, query, fragment, alternate path, and
  absolute-form targets are rejected before authentication.
- Pending authentication is bounded to 128 upgrades globally and 8 per access
  session, with an 8-second deadline. Test overrides may only lower these
  bounds.
- Admission release is centralized and idempotent across reject, peer
  close/end/error, authentication timeout, thrown/late lookup result,
  successful upgrade, and shutdown. Half-closed pending sockets are destroyed.
- `WebSocketServer` uses a 4 KiB `maxPayload` and disables per-message
  compression.
- The attendance smoke now requires explicit `TEST_EMAIL` and `TEST_PASSWORD`,
  uses an isolated cookie jar for the admin and each concurrent operator,
  applies exact Origin and user CSRF to mutations, and opens the credential-free
  WebSocket target with cookie and Origin.
- Shared executable smoke helpers cover cookie capture, CSRF, exact Origin,
  isolated operator jars, explicit environment requirements, and WebSocket
  construction. The smoke and helpers contain no legacy authorization header,
  token query, raw login-token assertion, fixed password fallback, or token
  option.

### Review 1 final validation

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts server/attendance-events.test.ts tests/attendance-smoke-helpers.test.ts client/src/lib/attendance-reconciliation.test.ts client/src/lib/attendance-connection-state.test.ts
```

PASS: 6 files, 80 tests.

```text
npm test
```

PASS: 88 files passed, 2 skipped; 685 tests passed, 2 skipped.

```text
npm run check
```

PASS: TypeScript exited 0.

```text
npm run build
```

PASS: Vite client build and all three esbuild server/script bundles exited 0.

```text
npm run security:secrets
```

PASS: release secret scan exited 0.

```text
npm audit --omit=dev
```

PASS: 0 vulnerabilities.

```text
node --check scripts/attendance-smoke-test.mjs
node --check scripts/attendance-smoke-helpers.mjs
```

PASS: both scripts parsed successfully.

```text
rg -n "Authorization|\?token=|\.token\b|admin123|Bearer|options\.token|token:" scripts/attendance-smoke-test.mjs scripts/attendance-smoke-helpers.mjs
```

PASS: no matches.

```text
git diff --check d463e1b..HEAD
```

PASS: no whitespace errors.

## Review 2 remediation

- Review contract: `.superpowers/sdd/attendance-task-3-review-2.md`
- Reviewed head: `a10142c`
- Review verdict: `CHANGES_REQUIRED`
- Current status: fixes implemented and awaiting independent re-review. This
  report does not mark the task approved.

### Review 2 commits

```text
70c6db7 test: specify URL-scoped smoke cookies
ac05173 fix: scope smoke cookies to request URLs
```

### Review 2 RED evidence

Command:

```text
npm test -- tests/attendance-smoke-helpers.test.ts
```

Result: FAIL as intended, 6 failed and 2 passed. The failures proved that the
refresh cookie reached both the attendance HTTP request and realtime WebSocket,
and that the existing jar ignored path boundaries, Secure transport, expiry,
clearing, and host scope.

### Review 2 changes

- The smoke cookie jar now absorbs each Set-Cookie against the exact response
  URL and retains host-only/domain scope, browser default or explicit Path,
  Secure, expiry/max-age, and creation order.
- Cookie identity is scoped by name, domain, and path. Expired and cleared
  entries are removed, invalid cross-domain Set-Cookie values are ignored, and
  raw encoded values are preserved for the Cookie header.
- `header(targetUrl)` and CSRF lookup select only cookies matching the target
  scheme, host, browser-compatible path boundary, and expiry. `wss:` is treated
  as secure.
- Every HTTP request selects cookies for its exact destination and absorbs
  response cookies against the effective response URL. The realtime helper
  selects against the exact credential-free `ws:`/`wss:` URL.
- The executable login fixture now contains access, refresh, and CSRF cookies.
  Tests prove that attendance HTTP and realtime WS include access and CSRF but
  exclude refresh, while the exact refresh endpoint includes refresh.
- Executable regressions also cover Secure behavior across HTTP/HTTPS/WS/WSS,
  expired and cleared cookies, host-only isolation, Domain scope, encoded
  values, and exact/slash-boundary Path matching.

### Review 2 final validation

```text
npm test -- tests/attendance-smoke-helpers.test.ts
```

PASS: 1 file, 8 tests.

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts server/attendance-events.test.ts
```

PASS: 3 files, 51 tests.

```text
npm test -- client/src/lib/attendance-reconciliation.test.ts client/src/lib/attendance-connection-state.test.ts
```

PASS: 2 files, 25 tests.

```text
npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts server/attendance-events.test.ts tests/attendance-smoke-helpers.test.ts client/src/lib/attendance-reconciliation.test.ts client/src/lib/attendance-connection-state.test.ts
```

PASS: 6 files, 84 tests.

```text
npm test
```

PASS: 88 files passed, 2 skipped; 689 tests passed, 2 skipped.

```text
npm run check
```

PASS: TypeScript exited 0.

```text
npm run build
```

PASS: Vite client build and all three esbuild server/script bundles exited 0.

```text
npm run security:secrets
```

PASS: release secret scan exited 0.

```text
npm audit --omit=dev
```

PASS: 0 vulnerabilities.

```text
node --check scripts/attendance-smoke-test.mjs
node --check scripts/attendance-smoke-helpers.mjs
```

PASS: both scripts parsed successfully.

```text
rg -n "Authorization|\?token=|\.token\b|admin123|Bearer|options\.token|token:" scripts/attendance-smoke-test.mjs scripts/attendance-smoke-helpers.mjs
```

PASS: no matches.

```text
git diff --check d463e1b..HEAD
```

PASS: no whitespace errors, including the report update.

## Independent review

The third independent review approved the complete task with no Critical,
Important, or Minor findings. It reconfirmed authoritative cookie/session
authentication, exact Origin/target checks, bounded admission and payloads,
generation-safe deadlines/reconnects, heartbeat and cleanup behavior, complete
business-event reconciliation, and browser-faithful URL-scoped smoke cookies.

## Current concerns

- The destructive end-to-end smoke script was not run because no explicit
  `TEST_EMAIL`/`TEST_PASSWORD` or dedicated live smoke environment was
  provided. Its authentication transport is covered by eight executable helper
  tests, and the complete script passes syntax validation.
- Browser fallback polling and connection-status UI remain assigned to later
  tasks in the approved plan and were not implemented here.

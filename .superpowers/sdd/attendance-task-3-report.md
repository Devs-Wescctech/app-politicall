# Attendance Realtime Resilience Task 3 Report

Status: DONE

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

## Concerns

None identified for Task 3. Browser fallback polling and connection-status UI
remain assigned to later tasks in the approved plan and were not implemented
here.

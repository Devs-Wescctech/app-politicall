# Attendance Realtime Task 3 - Controller Clarifications

## Security contract

- The browser URL is exactly the same-origin
  `/api/attendance/realtime` WebSocket URL. It contains no query string,
  fragment, token, tenant ID, user ID, session ID, or other credential.
- The server must reject legacy `token`/credential query parameters even when a
  valid cookie is also present.
- Authenticate only the `politicall_access` user cookie through the shared
  access-token verifier and authoritative session lookup. Require an active,
  unrevoked user session, then reload the user and require exact
  user/account/session agreement. Do not accept admin cookies or legacy Bearer
  auth for this endpoint.
- Enforce the same exact Origin allowlist used by browser authentication.
  Reject missing or non-allowed origins before `handleUpgrade`.
- Account scope comes only from the authoritative session/user. Never trust a
  request query or payload for account routing.
- The connected packet includes a fresh non-secret connection identifier, user
  ID, account ID, heartbeat interval, and timestamp. It must not expose a JWT,
  cookie, session ID, or database credential.

## `ws` server lifecycle

- Follow the official `ws@8.18.3` `noServer` pattern: attach a temporary socket
  error handler, authenticate before `handleUpgrade`, remove the temporary
  handler before upgrading, and destroy rejected/pending sockets safely.
- Preserve the existing shutdown guarantees: pending async authentication is
  cancelled by close, late auth results cannot upgrade, all clients terminate,
  heartbeat timers clear, the upgrade listener is removed, and setup is blocked
  while the previous instance closes.
- Keep protocol-level ping/pong liveness and add a bounded application heartbeat
  packet that the browser can observe. Use one documented interval and a client
  timeout comfortably greater than two heartbeat intervals.
- Never log raw cookies, tokens, request headers, SDK errors, or packet bodies.

## Client transport lifecycle

- `useAttendanceRealtime(enabled)` returns
  `{ mode, isConnected, reconnectNow }` using the Task 2 state machine.
- Keep transport mechanics in an injectable/testable controller if needed; the
  React hook must remain a thin real integration and must not use source-text
  assertions as behavioral tests.
- Register `online`, `offline`, and `visibilitychange` listeners exactly once per
  active lifecycle. Cleanup must remove the exact listeners, clear every
  reconnect/heartbeat/stability timer, neutralize callbacks, and close the
  current socket. Cleanup and `reconnectNow` are idempotent.
- Capture the state-machine generation in every socket callback. A replaced
  socket's open/message/close/error/timeout callback must not mutate current
  state or schedule another reconnect.
- A close before `open` activates fallback and schedules the first reconnect
  using attempt zero (1,000 ms at neutral jitter). A successful open resets
  backoff. Heartbeat failure schedules exactly one reconnect.
- The connected acknowledgement is the first healthy confirmation; the first
  valid application heartbeat is the second. Only then may mode become
  `connected`. Business events do not accelerate this counter.
- While the document is hidden, avoid false heartbeat failures caused by browser
  timer throttling. On return to visible, evaluate staleness and reconnect
  immediately when needed.
- Offline clears reconnect work and closes/invalidates the socket. Online
  triggers one immediate generation-safe reconnect. Visibility returning while
  disconnected may also trigger one immediate reconnect.
- `reconnectNow` replaces pending/fallback transport immediately but does not
  create duplicate sockets or disturb a healthy connected socket.
- Preserve current drafts, selected conversation, query cache, and scroll state
  across transport transitions. This task must never retry an outbound send.

## Realtime packet handling

- Feed attendance business packets through
  `applyAttendanceRealtimeEvent(queryClient, event)`.
- Preserve settings invalidations for connections, sectors, queues, quick
  replies, and automation settings.
- Ignore malformed JSON, unknown packets, wrong-account packets, and stale
  connection packets without throwing or clearing cached messages.
- A server packet whose account ID differs from the authenticated connection
  acknowledgement must not reach reconciliation.

## Required executable tests

- Client: credential-free URL, pre-open failure/backoff, open reset, two healthy
  confirmations, stale generations, heartbeat timeout, hidden/visible,
  offline/online, manual reconnect, malformed/wrong-account packets, listener
  registration, complete idempotent cleanup, and preserved cache/draft state.
- Server: valid cookie/session/account handshake, query credential rejection,
  missing/wrong Origin, missing/invalid/revoked/expired session, account
  mismatch, connection identifier, heartbeat, pending-auth shutdown, connected
  shutdown, listener cleanup, and setup/close race.
- Migrate existing tokenized realtime tests; do not leave executable query-token
  happy paths.
- Follow RED/GREEN TDD. Run the two focused test files, existing realtime
  lifecycle tests, Task 1 and Task 2 tests, the full Vitest suite, typecheck,
  build, secret scan, production audit, and
  `git diff --check d463e1b..HEAD`.
- Write the report to `.superpowers/sdd/attendance-task-3-report.md`.

## Documentation influence

- The server lifecycle decisions follow the official `ws@8.18.3` noServer
  authentication and ping/pong cleanup examples retrieved through Context7.
- The hook lifecycle follows React 18 guidance to pair every external
  subscription/timer with effect cleanup and ignore stale asynchronous results.

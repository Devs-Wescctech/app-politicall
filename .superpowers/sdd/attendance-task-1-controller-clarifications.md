# Attendance Realtime Task 1 - Controller Clarifications

## Scope

- This task centralizes cache reconciliation only. Do not change WebSocket
  authentication, retry timing, polling intervals, connection UI, or outbound
  send retry behavior yet.
- Preserve the current React Query keys and the existing invalidations for
  conversation lists, reports, history, and attendance settings.

## Message identity and merge behavior

- Match by the database/local `id` first.
- When IDs differ, match by a non-empty `externalMessageId`.
- Never treat two missing external IDs as equal.
- When an incoming server record matches an optimistic or stale record, prefer
  the server record's canonical identity and current delivery fields while
  preserving existing fields that the incoming partial event omits.
- Merge metadata objects instead of discarding existing metadata.
- Repeated application of the same event must be idempotent.

## Ordering

- Normalize `createdAt` from `Date`, ISO string, or numeric input without
  mutating either input array.
- Sort oldest to newest.
- Use the normalized timestamp first and a stable string ID tie-breaker second.
- Handle an invalid/missing timestamp deterministically without throwing.

## Realtime event integration

- `applyAttendanceRealtimeEvent(queryClient, event)` must operate on the
  conversation-detail cache shape `{ messages: AttMessage[] }`.
- A message-created event with a usable `payload.event.after` record should
  reconcile immediately and avoid a duplicate detail-cache insertion.
- Conversation-updated and settings event behavior must remain intact.
- Malformed or unrelated events must fail safely and leave existing cache data
  unchanged apart from the already-required broad invalidations.

## Verification

- Follow RED/GREEN TDD and record both commands and expected failure/pass output.
- Test input immutability, idempotence, duplicate local ID, duplicate external
  ID, absent external ID, partial metadata/status updates, timestamp
  normalization, deterministic tie-breaking, and the actual React Query cache
  shape.
- Run the focused tests, relevant existing attendance tests, `npm run check`,
  and `git diff --check 269d505..HEAD`.
- Write the implementation report to
  `.superpowers/sdd/attendance-task-1-report.md`.

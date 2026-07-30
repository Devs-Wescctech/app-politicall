# Attendance Realtime Task 2 - Controller Clarifications

## Scope and purity

- Implement a pure reducer and pure reconnect-delay helper only. Do not create a
  WebSocket, timer, browser listener, React hook, polling query, or UI component
  in this task.
- The state machine must expose the public mode
  `connected | reconnecting | fallback` and retain explicit internal facts for
  online/offline, visibility, reconnect attempt, socket-open state, and
  consecutive stability confirmations.

## Required transitions

- Initial enabled/online state is `reconnecting`.
- A socket close or heartbeat failure activates `fallback`, increments the
  reconnect attempt, clears socket-open state, and resets stability
  confirmations.
- `offline` is an internal fact. Going offline activates public `fallback`,
  resets stability confirmations, and prevents the state from claiming a live
  socket.
- Returning online permits an immediate reconnect attempt without claiming
  `connected`.
- A socket open resets reconnect backoff to attempt zero but does not by itself
  disable HTTP fallback.
- The two-stability rule means two consecutive healthy confirmations for the
  currently open socket. The hook in Task 3 will emit those confirmations after
  `onopen`; the reducer reaches `connected` only after the second. This avoids
  requiring an artificial second physical reconnect when the first recovered
  socket remains healthy.
- A close/offline/heartbeat failure between confirmations resets the count.
- Visibility changes update state deterministically and do not invent a
  connection transition.
- A manual reconnect/reset event must return to a coherent online
  `reconnecting` state without carrying stale attempts or confirmations.

## Reconnect delay

- Use a zero-based attempt number with a 1,000 ms exponential base and a final
  30,000 ms cap.
- Apply bounded jitter in the inclusive range 0.8x to 1.2x, then cap the final
  value at 30,000 ms.
- Accept an injectable random sample in `[0, 1]` so tests are deterministic;
  default to `Math.random` for production callers.
- Normalize invalid/negative attempts and random samples rather than returning
  `NaN`, a negative delay, or a value above the cap.

## Tests and handoff

- Cover every transition above, reducer immutability, repeated/stale events, the
  two-confirmation recovery rule, offline/online recovery, hidden/visible state,
  attempt reset/increment, deterministic jitter bounds, and the 30-second cap.
- Export stable types/events that Task 3 can consume without React or DOM types.
- Follow RED/GREEN TDD and write the report to
  `.superpowers/sdd/attendance-task-2-report.md`.
- Run focused tests, the Task 1 reconciliation tests, `npm run check`, and
  `git diff --check fdfed3f..HEAD`.

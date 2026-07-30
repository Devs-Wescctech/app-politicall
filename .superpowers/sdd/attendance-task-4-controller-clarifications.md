# Attendance Realtime Task 4 - Controller Clarifications

## Polling policy

Use these exact pure-policy results:

| Mode | Visibility | Conversation | List |
| --- | --- | ---: | ---: |
| `connected` | `visible` | 60,000 ms | 60,000 ms |
| `fallback` | `visible` | 5,000 ms | 10,000 ms |
| `reconnecting` | `visible` | 5,000 ms | 10,000 ms |
| any mode | `hidden` | 30,000 ms | 30,000 ms |

- Offline is represented by the realtime public fallback behavior; React Query's
  online manager may pause actual network work. Do not create a custom offline
  request loop.
- Both queries must set `refetchIntervalInBackground: true`; otherwise the
  required hidden-tab 30-second safety interval is disabled by React Query.
- Do not poll faster than this table and do not use fixed legacy 3-second chat
  polling.

## Environment lifecycle

- Add one page-level polling-environment lifecycle in
  `client/src/lib/attendance-polling.ts`; do not register separate
  online/visibility listeners in both child components.
- It must expose `visible | hidden` and online state, register listeners exactly
  once, remove the exact listeners on cleanup, and be safe under repeated
  start/stop or React Strict Mode.
- Trigger one immediate broad invalidation of
  `["/api/attendance/conversations"]` only on offline-to-online or
  hidden-to-visible rising edges. A combined transition must still invalidate
  once. Initial mount and duplicate events must not cause an extra refresh.
- The broad prefix must cover paged list and open detail queries without
  clearing cache, selected conversation, draft, scroll position, or optimistic
  messages.

## Component wiring

- Capture `{ mode }` from `useAttendanceRealtime()` in `attendance.tsx`.
- Pass `mode` and polling visibility to `ConversationList` and `ChatPanel`
  through typed props.
- Keep current query keys, query functions, initial cached conversation data,
  pagination, filters, optimistic send behavior, and manual refresh actions.
- HTTP polling is read-only. Never retry or repeat an outbound send mutation.

## Tests

- Follow RED/GREEN TDD.
- Pure tests cover every row in the interval table and unexpected/repeated
  environment transitions.
- Executable lifecycle tests cover one listener registration, exact cleanup,
  initial hidden/offline state, duplicate events, combined rising edges, and one
  broad invalidation.
- Run the polling tests, attendance lane/layout tests, Tasks 1-3 focused tests,
  full suite, typecheck, build, secret scan, production audit, and
  `git diff --check 4aa753c..HEAD`.
- Write the report to `.superpowers/sdd/attendance-task-4-report.md`.

## Documentation influence

TanStack Query v5.60.5 documentation confirms that each QueryObserver owns its
own interval and that background intervals run only when
`refetchIntervalInBackground` is enabled. The implementation must therefore
keep one observer per existing list/detail query and opt into the required
hidden-tab interval explicitly.

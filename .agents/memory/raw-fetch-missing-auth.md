---
name: Custom queryFn raw fetch drops JWT auth header
description: Why hand-written fetch() in a react-query queryFn silently 401s in this app
---

This app authenticates with a JWT Bearer token read from localStorage (`getAuthToken`), NOT cookies. Auth headers are injected in two places only: `apiRequest()` and the default `getQueryFn` fetcher (both in `client/src/lib/queryClient.ts` via `getAuthHeaders`).

**Rule:** A custom `queryFn`/`mutationFn` that calls raw `fetch(url, { credentials: "include" })` will send NO Authorization header, so every such request returns 401 and the UI shows empty/zero data — looks like "the data disappeared", not like an auth error.

**Why:** `credentials: "include"` only sends cookies; this app doesn't use auth cookies. The token lives in localStorage and must be attached explicitly.

**How to apply:** When adding query params (pagination, filters, search) forces you to write a custom `queryFn`, build the URL yourself but fetch through `apiRequest("GET", url)` (it attaches the token and throws on !ok). Never reach for bare `fetch` in a queryFn here. This was the root cause of the campaigns list showing total 0 after server-side pagination was added.

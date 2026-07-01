---
name: Replit internal npm registry leaking into package-lock.json
description: Lockfiles generated inside Replit can contain internal-only registry URLs that break `npm ci` outside Replit (e.g. GitHub Actions)
---

## Issue

Replit's environment routes npm installs through an internal caching proxy
(`http://package-firewall.replit.local/npm/...`). When `package-lock.json` is
generated/updated inside Replit, some packages' `"resolved"` fields get
recorded pointing at that internal hostname instead of the public registry.

That hostname only resolves inside Replit's sandbox network. Any CI/CD system
running `npm ci` outside Replit (GitHub Actions, other CI, self-hosted
runners) will fail intermittently with `EAI_AGAIN` / `getaddrinfo` errors for
whichever packages happen to need a fresh (non-cached) fetch — this looks like
a flaky/random CI failure, not an obvious config bug.

**Why:** the proxy is transparent inside Replit (cache hits mask it most of
the time), so the bad URLs sit undetected in the lockfile until a CI run
needs an uncached package.

**How to apply:** If a CI pipeline's `npm ci` step fails with `EAI_AGAIN` /
`getaddrinfo ... package-firewall.replit.local`, grep `package-lock.json` for
`package-firewall.replit.local`. If found, rewrite those URLs to the public
registry — the URL path structure maps 1:1:

```
http://package-firewall.replit.local/npm/<pkg>/-/<pkg>-<version>.tgz
  -> https://registry.npmjs.org/<pkg>/-/<pkg>-<version>.tgz
```

A simple `sed` replacement across the whole file is safe:
`sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`

Note this can't be verified by running `npm ci` locally inside Replit's
sandbox (it can't reach the public registry directly, only through the
proxy) — validate by pushing and watching the actual CI run instead.

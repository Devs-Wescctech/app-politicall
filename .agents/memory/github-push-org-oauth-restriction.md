---
name: GitHub push fails/hangs due to org OAuth app restriction
description: git push to a GitHub org repo silently hangs or 403s even with a valid token/permissions — check org's third-party OAuth app policy.
---

## Symptom
- `git push` to an org-owned GitHub repo hangs indefinitely (no error) when using the stale credential-helper path, or fails fast with `remote: Permission to <org>/<repo>.git denied to <user>` (403) when using a fresh OAuth token directly — even though:
  - `GET /repos/{owner}/{repo}` via the API shows `permissions.push: true` for that user.
  - The OAuth token has `repo` scope.
  - `git ls-remote` (read) succeeds fine (reads aren't blocked the same way).

## Root cause
The repo's owner is a GitHub **organization** with "Third-party application access policy" set to **Access restricted**. Only OAuth apps explicitly approved by an org owner can act on org data — even if the authorizing member has push permission. GitHub doesn't always surface this as a clear error for git's smart-HTTP protocol; it can manifest as a hang via Replit's askpass credential helper, or a blunt 403 once a direct token is used.

**Why:** the permissions check on `GET repo` reflects the *user's* collaborator role, not whether the *OAuth app* is allowed to act on the org's behalf — these are separate authorization layers.

**How to apply:** if a Replit GitHub connector push to an org repo fails/hangs despite correct token+scope+permissions, check the org's Settings → Third-party access → "Third-party application access policy". Either have an owner approve the specific app, or click "Remove restrictions" to unblock (simplest fix, but opens org data to any member-authorized OAuth app going forward).

## Diagnostic path that worked
1. `git push` hangs → test `git ls-remote` (works) to confirm it's push-specific, not general connectivity/auth.
2. Test the Replit `replit-git-askpass` helper directly with a password prompt string — if it hangs, the credential helper itself is stuck (e.g., waiting on an unconfigured/expired connector).
3. Set up the real Replit GitHub connector (`searchIntegrations`/`proposeIntegration`) to get a fresh token, and push directly via `https://x-access-token:<token>@github.com/...` (bypasses the stuck askpass helper).
4. If that push now fails fast with 403 "Permission denied", check `octokit.rest.repos.get(...).data.permissions` (often still shows `push:true` — misleading) and check `octokit.rest.orgs.get()` to confirm the owner is an org, then check the org's OAuth app restriction policy.

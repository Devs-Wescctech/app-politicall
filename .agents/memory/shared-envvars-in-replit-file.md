---
name: Shared env vars are committed in .replit
description: setEnvVars "shared" scope writes values into .replit [userenv.shared], which is version-controlled — never put sensitive values there.
---

# Shared env vars land in version control

Environment variables set in the "shared" scope are stored in `.replit` under `[userenv.shared]`, and `.replit` is committed with the code.

**Why:** A code review flagged the Oktor SMS n8n webhook URL (bearer-like secret) and account e-mail stored this way as a security issue; they had to be deleted from shared env, re-added by the user as Replit Secrets, and the webhook path rotated (old URL remains in git history).

**How to apply:** Anything credential-like (webhook URLs with tokens, accounts, API endpoints acting as secrets) must go through `requestEnvVar` as a Secret — never `setEnvVars` shared/dev/prod. Use shared env vars only for genuinely non-sensitive config. If a sensitive value is found in `.replit`, delete it, request it as a Secret, and recommend rotation.

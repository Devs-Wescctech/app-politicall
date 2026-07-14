---
name: SMS dispatch via n8n proxy
description: How Politicall sends Oktor SMS through an n8n proxy, and the n8n webhook activation gotchas.
---

# SMS dispatch goes through an n8n proxy, never direct to Oktor

Oktor blocks Replit's egress IP ("IP não autorizado"). The n8n server's IP is
whitelisted, so all SMS must be routed through an n8n webhook that forwards to
Oktor.

**Rule:** never call Oktor directly from the server. `endpoint()` in
`server/services/oktor-sms.ts` throws if no endpoint is configured — there is no
direct-Oktor fallback anymore.

Config resolution (see `oktorConfigFromIntegration` in `server/routes.ts`):
endpoint/account/code/tipoEnvio come from the company integration OR env vars
(`OKTOR_SMS_ENDPOINT`, `OKTOR_SMS_ACCOUNT`, `OKTOR_SMS_CODE`,
`OKTOR_SMS_TIPO_ENVIO`). `client` (cost center) comes ONLY from
`integration.smsClient` (Admin Master) — never hardcoded, never sent to frontend.

**Endpoint precedence MUST be env-first:** `process.env.OKTOR_SMS_ENDPOINT ||
integration.smsEndpoint`. **Why:** the SMS admin form historically seeded
`smsEndpoint` in the DB with the direct Oktor URL. With integration-first
precedence that stale DB value overrode the proxy env var, so real dispatches
went straight to Oktor and got "IP não autorizado (código 901)". The
`endpoint()` guard also now hard-rejects any `*.oktor.com.br` / `integracao3.do`
URL so a stale DB value can never cause a direct call again.

Param format (unchanged): send = `type=E&dispatch=sendmsg&msg&to&tipoEnvio&account&code&client`;
query = `type=C&id&account&code&client`.

## n8n webhook activation gotchas (common cause of 404)
- **Test URL** (`/webhook-test/...`): 404 unless someone clicks "Execute workflow"
  in the n8n canvas, and it fires only ONCE per arming. Not for production.
- **Production URL** (`/webhook/...`): 404 with "The workflow must be active for a
  production URL to run successfully" until the workflow's Active toggle (top-right
  of n8n editor) is turned ON.
- **Why:** a 404 from the send is almost always the n8n workflow state, not the
  Replit code. Connectivity Replit→n8n is fine (TLS/connect ~0.25s).

## How to test the real code path without app/auth/DB setup
Run a tsx script in the workspace root that imports `sendOktorSms` from
`server/services/oktor-sms.ts`, reads account/code/endpoint from `process.env`,
sets `client` explicitly, and calls it with a `{to, msg}`. Import path must be
`./server/services/oktor-sms.ts` from the workspace root (not /tmp).

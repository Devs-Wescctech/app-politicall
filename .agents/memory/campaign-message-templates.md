---
name: Campaign message templates & per-contact render (Disparos Phase 3)
description: How multichannel campaign templates, variable rendering, and WhatsApp official template sends are wired.
---

# Campaign templates / dispatch rendering

Multichannel "Disparos" campaigns support saved message models (SMS/email/WhatsApp)
and per-contact variable substitution rendered **at send time**, not at draft time.

## Variable rendering
- Shared pure helpers live in `shared/templates.ts` (renderTemplate, extractVariables,
  unknownVariables, smsSegments, isWaTemplateUsable, waTemplateBlockReason,
  contactTemplateContext). Supported vars: `{nome}{telefone}{cidade}{protocolo}{link}`.
- The send loop indexes contacts by phone (last 8 digits) and email, resolves each
  recipient to a contact, builds context, and renders message + subject **per recipient**
  right before dispatch. Drafts store the raw `{var}` template.

## WhatsApp API Oficial templates
- Campaign WA official send uses **Meta Graph** via `wescctech.sendOfficialTemplate`
  (needs `whatsappPhoneNumberId` + `whatsappAccessToken`/`whatsappToken`), NOT the WHU
  `send-text` session path. Only `APPROVED` templates are usable — everything else
  (REJECTED/PAUSED/DISABLED/PENDING/…) is blocked by `isWaTemplateUsable`.
- `templateConfig.variables` is keyed by positional index string ("1","2",…) and mapped
  to `[{type:"body", parameters:[{type:"text",text}]}]` components in send order.
- Template list endpoint reads from Graph `{businessAccountId}/message_templates`.

**Why:** official templates are a separate Graph API surface from the normal WHU
proxy; mixing them silently fails. Rendering at send time (not draft) is what makes
`{nome}` resolve to each recipient rather than one frozen value.

**How to apply:** any new campaign channel/template feature should render via the
shared helpers in the send loop and keep the draft message as raw template text.
`campaign.templateConfig` (jsonb, type `CampaignTemplateConfig`) + `campaign.templateId`
(FK message_templates, set null) carry the config; both are additive columns.

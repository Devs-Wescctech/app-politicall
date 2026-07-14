# WhatsApp Template Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require and correctly transmit every dynamic WhatsApp template variable from attendance chat, new conversation, and campaigns.

**Architecture:** A dependency-free shared module extracts template placeholders, validates values, renders previews, and builds Meta/WHU component payloads. A reusable React editor consumes that module in every interactive template flow. Server-side policy validates the selected provider template before any external send, while campaign dispatch renders configured values per recipient.

**Tech Stack:** TypeScript 5.6, React 18, Express, TanStack Query, Vitest, Meta Graph API and WHU WACLOUD adapter.

## Global Constraints

- Variable inputs start empty and are mandatory.
- Cover HEADER, BODY and dynamic BUTTON parameters, not only BODY.
- Preserve numeric variable order and provider component structure.
- Campaign values may contain supported Politicall contact tokens and must render per recipient.
- Never call an external provider when variables are incomplete.
- Never send a real template during verification.
- Graphify is unavailable in this workspace; use focused source reads.

---

### Task 1: Shared template-variable contract

**Files:**
- Create: `shared/whatsapp-template-variables.ts`
- Create: `shared/whatsapp-template-variables.test.ts`
- Modify: `shared/templates.ts`

**Interfaces:**
- Produces `extractWhatsAppTemplateVariables(template): TemplateVariable[]` where each item contains `key`, `position`, `componentType`, `componentIndex`, `parameterIndex`, `label`, and `placeholder`.
- Produces `validateTemplateVariableValues(variables, values): { valid: boolean; missing: string[] }`.
- Produces `buildWhatsAppTemplateComponents(template, values): any[]`.
- Produces `renderWhatsAppTemplatePreview(template, values): string`.

- [ ] **Step 1: Add failing tests** for BODY `{{1}}..{{3}}`, HEADER and BUTTON, deduplication, numeric ordering, blank values, resolved preview, and provider payload.
- [ ] **Step 2: Run RED** with `npx.cmd vitest run shared/whatsapp-template-variables.test.ts`; expect module-not-found or missing-export failures.
- [ ] **Step 3: Implement the minimal shared functions** using component type/index as identity and `{ type: "text", text: value }` parameters.
- [ ] **Step 4: Run GREEN** with the same command and confirm all cases pass.
- [ ] **Step 5: Replace `waTemplateBodyVariables` internals** with the shared extraction while preserving its current numeric return contract.

### Task 2: Reusable confirmation editor

**Files:**
- Create: `client/src/components/attendance/TemplateVariableDialog.tsx`
- Modify: `client/src/components/attendance/ChatPanel.tsx`
- Modify: `client/src/pages/attendance.tsx`

**Interfaces:**
- Consumes an `AttendanceTemplate`, open state and `onConfirm({ values, components, preview })` callback.
- Produces one empty controlled input per extracted variable, a resolved preview and a disabled confirm button until valid.

- [ ] **Step 1: Add pure-state tests** to the shared module for initial empty values and confirmation readiness.
- [ ] **Step 2: Run RED** and confirm the new assertions fail for missing state helpers.
- [ ] **Step 3: Build `TemplateVariableDialog`** with component-aware labels (`Cabeçalho`, `Corpo`, `Botão`), required inputs, inline missing-value messages and preview.
- [ ] **Step 4: Change ChatPanel selection** so a template opens the dialog instead of sending immediately; submit computed `templateComponents` and resolved `message` only after confirmation.
- [ ] **Step 5: Change NewConversationDialog** so template selection renders the shared editor before `create-new`; reset values when template/connection changes and block `Iniciar` while incomplete.
- [ ] **Step 6: Run TypeScript check** with `npm.cmd run check`.

### Task 3: Server-side attendance enforcement

**Files:**
- Create: `server/services/attendance-template-variables.ts`
- Create: `server/services/attendance-template-variables.test.ts`
- Modify: `server/attendance-routes.ts`

**Interfaces:**
- Produces `prepareAttendanceTemplateSend(selected, suppliedComponents, suppliedMessage)` returning validated components and resolved preview or throwing an error with code `TEMPLATE_VARIABLES_REQUIRED`.
- API behavior: `POST /api/attendance/conversations/:id/send-template` and `POST /api/attendance/conversations/create-new` return HTTP 400 `{ error, code: "TEMPLATE_VARIABLES_REQUIRED", missingVariables }` before provider calls.

- [ ] **Step 1: Add failing service tests** for missing BODY values, complete WHU WACLOUD values, complete direct Meta values and static templates.
- [ ] **Step 2: Run RED** with `npx.cmd vitest run server/services/attendance-template-variables.test.ts`.
- [ ] **Step 3: Implement policy service** using the shared extractor and validator.
- [ ] **Step 4: Call policy at the start of `sendTemplateToConversation`** and use its resolved preview in message history.
- [ ] **Step 5: Map the typed validation error** to HTTP 400 on both attendance endpoints without recording a sent message.
- [ ] **Step 6: Run focused service and provider adapter tests**.

### Task 4: Campaign template variables

**Files:**
- Modify: `shared/schema.ts`
- Modify: `client/src/components/campaign-wizard.tsx`
- Create: `server/services/campaign-template-variables.ts`
- Create: `server/services/campaign-template-variables.test.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- `CampaignTemplateConfig.variables` remains `Record<string,string>` and stores keys generated by shared extraction.
- Produces `prepareCampaignTemplateComponents(template, configuredValues, contactContext)` that renders `{nome}`, `{telefone}`, `{cidade}`, `{protocolo}` and `{link}` per recipient, validates the rendered values and returns provider components.

- [ ] **Step 1: Add failing campaign tests** for fixed values, per-contact `{nome}`, blank-after-render values, and numeric order.
- [ ] **Step 2: Run RED** with `npx.cmd vitest run server/services/campaign-template-variables.test.ts`.
- [ ] **Step 3: Implement campaign preparation service** by composing existing `renderTemplate` with shared component construction.
- [ ] **Step 4: Extend the campaign template response** to include complete `components` and extracted variable descriptors.
- [ ] **Step 5: Render mandatory fields in MessageComposer** when a WhatsApp official template is selected; allow supported Politicall tokens and update the sample preview live.
- [ ] **Step 6: Block wizard progression, campaign creation and campaign send** when selected-template values are incomplete.
- [ ] **Step 7: Build per-recipient provider components** in `dispatchCampaignMessage` instead of forwarding raw values.
- [ ] **Step 8: Run campaign-focused tests and TypeScript check**.

### Task 5: End-to-end verification and contracts

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-whatsapp-template-variables-design.md` only if runtime provider shapes require clarification.

- [ ] **Step 1: Run all tests** with `npm.cmd test`; expect zero failures.
- [ ] **Step 2: Run `npm.cmd run check` and `npm.cmd run build`; expect exit code 0.**
- [ ] **Step 3: Restart the local server and verify `/api/health` returns HTTP 200.**
- [ ] **Step 4: In Chat, choose `tratamento_chamado`, verify three empty required fields, fill them and confirm the preview contains no `{{n}}`; do not click final external send.**
- [ ] **Step 5: In Nova conversa, select the same dynamic template and verify `Iniciar` remains disabled until all values are filled.**
- [ ] **Step 6: In Campanhas, select an official dynamic template, verify fixed values and `{nome}` preview, and stop before starting the campaign.**


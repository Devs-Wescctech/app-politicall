# Petition WhatsApp Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-petition WhatsApp contact message with safe variables and canonical Brazilian phone normalization.

**Architecture:** Keep normalization, validation, interpolation, and link construction in the shared petition contact module. Persist one nullable message template on `petitions`, expose it through the existing safe public projection, and preserve only the successful signature's name/city in page state so the post-signature dialog can construct the final encoded `wa.me` URL.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, PostgreSQL migrations, React, TanStack Query, React Hook Form, Vitest.

## Global Constraints

- The message is optional and limited to 1,000 characters.
- Allowed variables are exactly `{nome}`, `{cidade}`, `{peticao}`, and `{link}`.
- A missing optional value resolves to an empty string, never `undefined`.
- Brazilian numbers with 10 or 11 digits receive country code `55`; valid complete international numbers with 12 to 15 digits are preserved.
- Sharing text and politician contact text remain independent.
- Migration `0027` is additive, nullable, and idempotent.
- No HTML interpretation or message execution is allowed.

---

### Task 1: Shared WhatsApp Phone and Message Domain

**Files:**
- Modify: `shared/petition-contact-links.ts`
- Test: `shared/petition-contact-links.test.ts`

**Interfaces:**
- Produces: `formatPetitionWhatsappInput(value: unknown): string`
- Produces: `interpolatePetitionWhatsappMessage(template: unknown, context: PetitionWhatsappMessageContext): string | null`
- Changes: `buildPetitionContactLinks(source, context?)` accepts an optional interpolation context.
- Changes: `petitionContactConfigSchema` validates and normalizes `contactWhatsappMessage`.

- [x] **Step 1: Write failing phone normalization and formatting tests**

Add expectations proving `(51) 99999-0000` normalizes to `5551999990000`, a complete international number is preserved, invalid lengths are rejected, and the canonical Brazilian value formats as `+55 (51) 99999-0000`.

```ts
expect(normalizePetitionWhatsapp("(51) 99999-0000")).toBe("5551999990000");
expect(normalizePetitionWhatsapp("+351 912 345 678")).toBe("351912345678");
expect(formatPetitionWhatsappInput("5551999990000")).toBe("+55 (51) 99999-0000");
expect(normalizePetitionWhatsapp("123")).toBeNull();
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- shared/petition-contact-links.test.ts`

Expected: FAIL because local Brazilian numbers are not prefixed and the formatter does not exist.

- [x] **Step 3: Implement canonical normalization and display formatting**

Strip non-digits, prefix `55` only for 10/11-digit local Brazilian input, preserve 12-15-digit complete numbers, and format complete Brazilian values for the administrative input.

```ts
export function normalizePetitionWhatsapp(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}
```

- [x] **Step 4: Write failing message validation/interpolation/link tests**

Cover all allowed variables, a missing city, an unknown `{email}` variable, the 1,000-character limit, URL encoding, and no `text` query when the message is empty.

```ts
expect(buildPetitionContactLinks({
  contactWhatsapp: "(51) 99999-0000",
  contactWhatsappMessage: "Ola, sou {nome}. Assinei {peticao}: {link}",
}, {
  nome: "Ana Maria",
  cidade: "",
  peticao: "Mais seguranca",
  link: "https://politicall.com.br/p/seguranca",
})[0]?.url).toContain("?text=Ola%2C%20sou%20Ana%20Maria");
```

- [x] **Step 5: Run the focused test and verify RED**

Run: `npm test -- shared/petition-contact-links.test.ts`

Expected: FAIL because the message field, interpolation function, and encoded query are absent.

- [x] **Step 6: Implement message schema, interpolation, and link generation**

Add `contactWhatsappMessage` to `PetitionContactSource`, validate only the four allowed placeholders, replace them from an explicit context, and append `?text=${encodeURIComponent(message)}` only for a non-empty result.

- [x] **Step 7: Run focused tests and commit**

Run: `npm test -- shared/petition-contact-links.test.ts`

Expected: PASS.

```bash
git add shared/petition-contact-links.ts shared/petition-contact-links.test.ts
git commit -m "feat: build petition WhatsApp contact messages"
```

### Task 2: PostgreSQL and API Contract

**Files:**
- Create: `migrations/0027_petition_whatsapp_message.sql`
- Modify: `shared/schema.ts`
- Modify: `server/services/production-migrations.ts`
- Modify: `server/services/production-migrations.test.ts`
- Modify: `server/services/production-migrations.integration.test.ts`
- Modify: `server/services/petitions.ts`
- Test: `server/services/petitions.test.ts`
- Test: `tests/deployment-config.test.ts`

**Interfaces:**
- Produces database/API property: `contactWhatsappMessage: string | null`.
- Consumes: `petitionContactConfigSchema.shape.contactWhatsappMessage` from Task 1.

- [x] **Step 1: Write failing schema, migration registration, and public projection tests**

Assert that the Drizzle table and insert schema expose `contactWhatsappMessage`, migration `0027_petition_whatsapp_message.sql` is approved by both migration runners, and `sanitizePublicPetition` includes the configured message but excludes unrelated internal fields.

```ts
expect(sanitizePublicPetition({
  id: "petition-1",
  title: "Peticao",
  contactWhatsappMessage: "Ola, {nome}",
})).toMatchObject({ contactWhatsappMessage: "Ola, {nome}" });
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/deployment-config.test.ts server/services/petitions.test.ts server/services/production-migrations.test.ts`

Expected: FAIL because migration `0027` and the schema/public field are absent.

- [x] **Step 3: Add the nullable column and register migration `0027`**

Create the idempotent SQL artifact:

```sql
ALTER TABLE petitions
ADD COLUMN IF NOT EXISTS contact_whatsapp_message text;
```

Add `contactWhatsappMessage: text("contact_whatsapp_message")` next to `contactWhatsapp`, include the Zod field through the existing contact schema shape, and add `0027_petition_whatsapp_message.sql` to both explicit migration lists.

- [x] **Step 4: Expose the public message template safely**

Add only `contactWhatsappMessage: normalized.contactWhatsappMessage ?? null` to `sanitizePublicPetition`.

- [x] **Step 5: Run focused and PostgreSQL integration tests**

Run: `npm test -- tests/deployment-config.test.ts server/services/petitions.test.ts server/services/production-migrations.test.ts server/services/production-migrations.integration.test.ts`

Expected: PASS; PostgreSQL integration may skip only when `MIGRATION_TEST_DATABASE_URL` is unavailable locally.

- [x] **Step 6: Commit**

```bash
git add migrations/0027_petition_whatsapp_message.sql shared/schema.ts server/services/production-migrations.ts server/services/production-migrations.test.ts server/services/production-migrations.integration.test.ts server/services/petitions.ts server/services/petitions.test.ts tests/deployment-config.test.ts
git commit -m "feat: persist petition WhatsApp messages"
```

### Task 3: Administrative Petition Form

**Files:**
- Modify: `client/src/pages/petitions.tsx`
- Test: `client/src/pages/petition-contact-fields.test.ts`

**Interfaces:**
- Consumes: `formatPetitionWhatsappInput` and schema-backed form property `contactWhatsappMessage`.
- Produces: administrative controls `input-petition-contact-whatsapp` and `input-petition-contact-whatsapp-message`.

- [x] **Step 1: Write a failing administrative form test**

Require the message textarea, 1,000-character limit, variable reference copy, and phone formatter wiring.

```ts
expect(source).toContain('name="contactWhatsappMessage"');
expect(source).toContain('data-testid="input-petition-contact-whatsapp-message"');
expect(source).toContain("{nome}");
expect(source).toContain("{cidade}");
expect(source).toContain("formatPetitionWhatsappInput");
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- client/src/pages/petition-contact-fields.test.ts`

Expected: FAIL because the new control and phone formatter are absent.

- [x] **Step 3: Implement the message textarea and phone formatting**

Add the message to default/edit form values. Format the phone on input without changing backend canonicalization. Render a full-width textarea beneath the social destination grid with `maxLength={1000}` and concise variable helper text.

- [x] **Step 4: Run focused tests and commit**

Run: `npm test -- client/src/pages/petition-contact-fields.test.ts shared/petition-contact-links.test.ts`

Expected: PASS.

```bash
git add client/src/pages/petitions.tsx client/src/pages/petition-contact-fields.test.ts
git commit -m "feat: configure petition WhatsApp messages"
```

### Task 4: Post-Signature Variable Context

**Files:**
- Modify: `client/src/pages/petition-public.tsx`
- Test: `client/src/pages/petition-public-contact-links.test.ts`

**Interfaces:**
- Consumes: `buildPetitionContactLinks(petition, context)` from Task 1.
- Produces: in-memory `PetitionWhatsappMessageContext` based only on name, city, petition title, and canonical public link.

- [x] **Step 1: Write a failing public-flow test**

Require `onSuccess` to capture mutation variables before clearing the form and require contact links to receive name, city, petition title, and public link.

```ts
expect(source).toContain("setSignedContactContext");
expect(source).toContain("buildPetitionContactLinks(petition, {");
expect(source).toContain("nome: signedContactContext?.name ?? \"\"");
expect(source).toContain("cidade: signedContactContext?.city ?? \"\"");
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- client/src/pages/petition-public-contact-links.test.ts`

Expected: FAIL because signer context is discarded before the dialog builds links.

- [x] **Step 3: Preserve the minimal successful signature context**

Change the mutation success callback to receive submitted variables, retain trimmed `name` and `city`, then clear the full form as before. Pass the retained context, title, and canonical public link to `buildPetitionContactLinks`.

- [x] **Step 4: Run focused tests and commit**

Run: `npm test -- client/src/pages/petition-public-contact-links.test.ts shared/petition-contact-links.test.ts`

Expected: PASS.

```bash
git add client/src/pages/petition-public.tsx client/src/pages/petition-public-contact-links.test.ts
git commit -m "feat: personalize petition WhatsApp contact link"
```

### Task 5: Full Verification and Operational Documentation

**Files:**
- Modify: `docs/deployment/portainer-production.md`

**Interfaces:**
- Verifies all interfaces produced by Tasks 1-4.

- [x] **Step 1: Document migration and rollback behavior**

Document migration `0027`, nullable-column image rollback compatibility, the four allowed placeholders, and the rule that local Brazilian numbers receive `55`.

- [x] **Step 2: Run static and security checks**

Run:

```bash
npm run check
npm run security:secrets
npm run build
```

Expected: all commands exit successfully.

- [x] **Step 3: Run the complete automated suite**

Run: `npm test`

Expected: all repository tests pass; any environment-specific skip must be reported explicitly.

- [x] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors and only intentional changes.

- [x] **Step 5: Commit documentation**

```bash
git add docs/deployment/portainer-production.md
git commit -m "docs: document petition WhatsApp messages"
```

- [ ] **Step 6: Browser validation**

Start the local application with its configured development environment, open the petition editor, verify the masked number and message field at desktop/mobile widths, then sign a disposable local petition and confirm the WhatsApp URL contains the normalized number and encoded substituted text. Do not publish to production without a separate explicit deployment confirmation.

Local browser validation remains pending because this worktree has no development
database credentials and Docker Desktop is unavailable. Do not substitute the
production database for this validation.

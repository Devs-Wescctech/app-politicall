# Petition Post-Signature Social Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir configurar WhatsApp, Facebook, X/Twitter e Telegram por peticao e usar esses destinos no dialogo exibido depois da assinatura.

**Architecture:** Quatro colunas opcionais e tipadas serao adicionadas a `petitions`. Um helper compartilhado concentrara normalizacao, validacao de hosts e construcao segura dos links; o formulario administrativo persistira os campos e a pagina publica separara compartilhamento pre-assinatura de contato pos-assinatura.

**Tech Stack:** TypeScript 5.6, React 18, React Hook Form, Zod, Express, Drizzle ORM, PostgreSQL, Vitest, Testing Library e Playwright.

## Global Constraints

- Trabalhar somente na worktree `C:/Users/guilherme.pereira/Documents/Politicall-worktrees/petition-social-contact-links` baseada em `origin/main` `b5aa829`.
- Nao copiar alteracoes do checkout antigo e nao publicar, fazer push ou deploy.
- Os campos sao configurados individualmente por peticao.
- Antes da assinatura, os controles continuam compartilhando a peticao.
- Depois da assinatura, os icones abrem apenas contatos oficiais configurados.
- Redes sem valor valido nao aparecem.
- Peticoes existentes continuam validas com campos `NULL`.
- Somente HTTPS e hosts oficiais sao aceitos para Facebook, X/Twitter e Telegram.
- WhatsApp deve conter codigo do pais e entre 10 e 15 digitos.
- Links externos abrem com `noopener,noreferrer`.
- A falha CRLF preexistente em `tests/deployment-config.test.ts` nao deve ser mascarada por esta feature.

---

### Task 1: Dominio, schema e migration

**Files:**
- Create: `shared/petition-contact-links.ts`
- Create: `shared/petition-contact-links.test.ts`
- Create: `migrations/0026_petition_contact_social_links.sql`
- Modify: `shared/schema.ts:2176-2207`
- Modify: `shared/schema.ts:2324-2338`
- Modify: `scripts/migrate-production.ts`
- Test: `shared/petition-contact-links.test.ts`
- Test: `tests/deployment-config.test.ts`

**Interfaces:**
- Produces: `type PetitionContactNetwork = "whatsapp" | "facebook" | "x" | "telegram"`
- Produces: `normalizePetitionWhatsapp(value: unknown): string | null`
- Produces: `normalizePetitionSocialUrl(network: Exclude<PetitionContactNetwork, "whatsapp">, value: unknown): string | null`
- Produces: `petitionContactConfigSchema`
- Produces: `buildPetitionContactLinks(source: PetitionContactSource): PetitionContactLink[]`

- [ ] **Step 1: Write failing domain tests**

Create `shared/petition-contact-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPetitionContactLinks,
  normalizePetitionSocialUrl,
  normalizePetitionWhatsapp,
  petitionContactConfigSchema,
} from "./petition-contact-links";

describe("petition contact links", () => {
  it("normalizes an international WhatsApp number", () => {
    expect(normalizePetitionWhatsapp("+55 (51) 99999-0000")).toBe("5551999990000");
    expect(normalizePetitionWhatsapp("123")).toBeNull();
    expect(normalizePetitionWhatsapp(" ")).toBeNull();
  });

  it("accepts only HTTPS URLs on official social hosts", () => {
    expect(normalizePetitionSocialUrl("facebook", "https://www.facebook.com/politico"))
      .toBe("https://www.facebook.com/politico");
    expect(normalizePetitionSocialUrl("x", "https://x.com/politico"))
      .toBe("https://x.com/politico");
    expect(normalizePetitionSocialUrl("telegram", "https://t.me/politico"))
      .toBe("https://t.me/politico");
    expect(normalizePetitionSocialUrl("facebook", "javascript:alert(1)")).toBeNull();
    expect(normalizePetitionSocialUrl("x", "https://x.com.attacker.test/politico")).toBeNull();
  });

  it("builds only configured links in stable order", () => {
    expect(buildPetitionContactLinks({
      contactWhatsapp: "+55 51 99999-0000",
      contactFacebookUrl: "https://facebook.com/politico",
      contactXUrl: null,
      contactTelegramUrl: "https://t.me/politico",
    })).toEqual([
      { network: "whatsapp", label: "WhatsApp", url: "https://wa.me/5551999990000" },
      { network: "facebook", label: "Facebook", url: "https://facebook.com/politico" },
      { network: "telegram", label: "Telegram", url: "https://t.me/politico" },
    ]);
  });

  it("rejects non-empty invalid administrative values", () => {
    expect(() => petitionContactConfigSchema.parse({ contactWhatsapp: "123" }))
      .toThrow("Informe um WhatsApp com código do país e DDD");
    expect(() => petitionContactConfigSchema.parse({ contactFacebookUrl: "https://example.test/perfil" }))
      .toThrow("Informe uma URL HTTPS válida do Facebook");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run shared/petition-contact-links.test.ts
```

Expected: FAIL because `shared/petition-contact-links.ts` does not exist.

- [ ] **Step 3: Implement the domain helper**

Create `shared/petition-contact-links.ts` with explicit host matching:

```ts
import { z } from "zod";

export type PetitionContactNetwork = "whatsapp" | "facebook" | "x" | "telegram";
type SocialNetwork = Exclude<PetitionContactNetwork, "whatsapp">;

export type PetitionContactSource = {
  contactWhatsapp?: unknown;
  contactFacebookUrl?: unknown;
  contactXUrl?: unknown;
  contactTelegramUrl?: unknown;
};

export type PetitionContactLink = {
  network: PetitionContactNetwork;
  label: string;
  url: string;
};

const allowedHosts: Record<SocialNetwork, readonly string[]> = {
  facebook: ["facebook.com"],
  x: ["x.com", "twitter.com"],
  telegram: ["t.me", "telegram.me"],
};

function isOfficialHost(hostname: string, roots: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

export function normalizePetitionWhatsapp(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function normalizePetitionSocialUrl(network: SocialNetwork, value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !isOfficialHost(url.hostname, allowedHosts[network])) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const optionalInput = z.union([z.string(), z.null(), z.undefined()]);

function optionalNormalizedField(
  normalize: (value: unknown) => string | null,
  message: string,
) {
  return optionalInput
    .transform((value) => String(value ?? "").trim())
    .refine((value) => value === "" || normalize(value) !== null, message)
    .transform((value) => value === "" ? null : normalize(value));
}

export const petitionContactConfigSchema = z.object({
  contactWhatsapp: optionalNormalizedField(normalizePetitionWhatsapp, "Informe um WhatsApp com código do país e DDD"),
  contactFacebookUrl: optionalNormalizedField((value) => normalizePetitionSocialUrl("facebook", value), "Informe uma URL HTTPS válida do Facebook"),
  contactXUrl: optionalNormalizedField((value) => normalizePetitionSocialUrl("x", value), "Informe uma URL HTTPS válida do X/Twitter"),
  contactTelegramUrl: optionalNormalizedField((value) => normalizePetitionSocialUrl("telegram", value), "Informe uma URL HTTPS válida do Telegram"),
});

export function buildPetitionContactLinks(source: PetitionContactSource): PetitionContactLink[] {
  const links: PetitionContactLink[] = [];
  const whatsapp = normalizePetitionWhatsapp(source.contactWhatsapp);
  const facebook = normalizePetitionSocialUrl("facebook", source.contactFacebookUrl);
  const x = normalizePetitionSocialUrl("x", source.contactXUrl);
  const telegram = normalizePetitionSocialUrl("telegram", source.contactTelegramUrl);
  if (whatsapp) links.push({ network: "whatsapp", label: "WhatsApp", url: `https://wa.me/${whatsapp}` });
  if (facebook) links.push({ network: "facebook", label: "Facebook", url: facebook });
  if (x) links.push({ network: "x", label: "X/Twitter", url: x });
  if (telegram) links.push({ network: "telegram", label: "Telegram", url: telegram });
  return links;
}
```

Keep the normalizers returning `null` for defensive rendering. Reuse `petitionContactConfigSchema.shape` in `insertPetitionSchema` so non-empty invalid administrative input produces a field error rather than silently becoming `null`.

- [ ] **Step 4: Add schema columns and validation**

In `petitions`, add:

```ts
contactWhatsapp: text("contact_whatsapp"),
contactFacebookUrl: text("contact_facebook_url"),
contactXUrl: text("contact_x_url"),
contactTelegramUrl: text("contact_telegram_url"),
```

Extend `insertPetitionSchema` with `petitionContactConfigSchema.shape`, which maps blank strings to `null`, normalizes valid values and returns these exact messages for invalid non-empty input:

```ts
"Informe um WhatsApp com código do país e DDD"
"Informe uma URL HTTPS válida do Facebook"
"Informe uma URL HTTPS válida do X/Twitter"
"Informe uma URL HTTPS válida do Telegram"
```

- [ ] **Step 5: Add the additive migration and runner entry**

Create `migrations/0026_petition_contact_social_links.sql`:

```sql
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_whatsapp text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_facebook_url text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_x_url text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_telegram_url text;
```

Add the exact migration filename to the ordered migration inventory in `scripts/migrate-production.ts`. Extend `tests/deployment-config.test.ts` to require all four `ADD COLUMN IF NOT EXISTS` statements and the runner entry.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npx vitest run shared/petition-contact-links.test.ts tests/deployment-config.test.ts
npm run check
```

Expected: contact-link tests PASS; deployment test may retain only the already recorded CRLF assertion failure on Windows and must introduce no new failure; TypeScript exits 0.

- [ ] **Step 7: Commit Task 1**

```bash
git add shared/petition-contact-links.ts shared/petition-contact-links.test.ts shared/schema.ts migrations/0026_petition_contact_social_links.sql scripts/migrate-production.ts tests/deployment-config.test.ts
git commit -m "feat: add petition contact social links"
```

---

### Task 2: API privada e resposta publica

**Files:**
- Modify: `server/services/petitions.ts`
- Modify: `server/services/petitions.test.ts`
- Modify: `server/routes.ts:5789-5833`
- Test: `server/services/petitions.test.ts`

**Interfaces:**
- Consumes: four normalized petition fields from Task 1.
- Produces: `sanitizePublicPetition()` response containing only the four deliberate public contact values, never integration credentials.

- [ ] **Step 1: Write failing sanitizer tests**

Add to `server/services/petitions.test.ts`:

```ts
it("publishes configured petition contact destinations", () => {
  const result = sanitizePublicPetition({
    id: "petition-contact-1",
    title: "Petição com contato",
    description: "Descrição",
    goal: 100,
    status: "publicada",
    slug: "peticao-com-contato",
    contactWhatsapp: "5551999990000",
    contactFacebookUrl: "https://facebook.com/politico",
    contactXUrl: "https://x.com/politico",
    contactTelegramUrl: "https://t.me/politico",
    signaturesCount: 7,
  });
  expect(result).toMatchObject({
    contactWhatsapp: "5551999990000",
    contactFacebookUrl: "https://facebook.com/politico",
    contactXUrl: "https://x.com/politico",
    contactTelegramUrl: "https://t.me/politico",
  });
  expect(result).not.toHaveProperty("accountId");
  expect(result).not.toHaveProperty("userId");
});
```

Also add an assertion to the existing `returns only public petition fields` test that null contact values remain null.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run server/services/petitions.test.ts
```

Expected: FAIL because the sanitizer does not include the four fields.

- [ ] **Step 3: Extend the public sanitizer**

Add the fields to the explicit return object in `sanitizePublicPetition`:

```ts
contactWhatsapp: normalized.contactWhatsapp ?? null,
contactFacebookUrl: normalized.contactFacebookUrl ?? null,
contactXUrl: normalized.contactXUrl ?? null,
contactTelegramUrl: normalized.contactTelegramUrl ?? null,
```

Do not spread the database row into the public response.

- [ ] **Step 4: Normalize writes at the route boundary**

After Zod parsing in create and patch routes, use the parsed normalized fields directly. Keep `accountId` and `userId` sourced only from the authenticated request. Ensure the patch path normalizes a blank value to `null` so administrators can remove a link.

- [ ] **Step 5: Run tests and typecheck**

```bash
npx vitest run server/services/petitions.test.ts shared/petition-contact-links.test.ts
npm run check
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add server/services/petitions.ts server/services/petitions.test.ts server/routes.ts
git commit -m "feat: expose safe petition contact links"
```

---

### Task 3: Configuracao no formulario de peticao

**Files:**
- Modify: `client/src/pages/petitions.tsx`
- Create: `client/src/pages/petition-contact-fields.test.ts`
- Test: `client/src/pages/petition-contact-fields.test.ts`

**Interfaces:**
- Consumes: `InsertPetition` fields from Task 1.
- Produces: create/edit payloads containing normalized nullable contact fields.

- [ ] **Step 1: Write a failing source contract test**

Create `client/src/pages/petition-contact-fields.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petitions.tsx", import.meta.url), "utf8");

describe("petition contact fields", () => {
  it("configures all post-signature social destinations", () => {
    expect(source).toContain("Redes para contato após a assinatura");
    for (const field of ["contactWhatsapp", "contactFacebookUrl", "contactXUrl", "contactTelegramUrl"]) {
      expect(source).toContain(`name="${field}"`);
    }
    expect(source).toContain('data-testid="input-petition-contact-whatsapp"');
    expect(source).toContain('data-testid="input-petition-contact-facebook"');
    expect(source).toContain('data-testid="input-petition-contact-x"');
    expect(source).toContain('data-testid="input-petition-contact-telegram"');
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run client/src/pages/petition-contact-fields.test.ts
```

Expected: FAIL because the fields are absent.

- [ ] **Step 3: Add defaults and edit hydration**

Add these values to `petitionDefaults` and to the edit `form.reset` mapping:

```ts
contactWhatsapp: "",
contactFacebookUrl: "",
contactXUrl: "",
contactTelegramUrl: "",
```

For edit hydration, use `petition.contactWhatsapp ?? ""` and the equivalent for each URL.

- [ ] **Step 4: Add the form section**

Immediately after `Texto de compartilhamento`, add a full-width section with heading `Redes para contato após a assinatura`, helper copy and four `FormField` controls. Use the corresponding Lucide icons, `type="tel"` for WhatsApp and `type="url"` for the three URLs. Do not put a card inside the existing form card.

Required placeholders:

```text
+55 (51) 99999-0000
https://facebook.com/seu-perfil
https://x.com/seu-perfil
https://t.me/seu-usuario
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npx vitest run client/src/pages/petition-contact-fields.test.ts shared/petition-contact-links.test.ts
npm run check
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add client/src/pages/petitions.tsx client/src/pages/petition-contact-fields.test.ts
git commit -m "feat: configure petition contact networks"
```

---

### Task 4: Contatos no dialogo pos-assinatura

**Files:**
- Modify: `client/src/pages/petition-public.tsx`
- Create: `client/src/pages/petition-public-contact-links.test.ts`
- Test: `client/src/pages/petition-public-contact-links.test.ts`

**Interfaces:**
- Consumes: `buildPetitionContactLinks()` and public fields from Tasks 1-2.
- Produces: independent `socialShares` and `contactLinks` collections.

- [ ] **Step 1: Write failing page contract tests**

Create `client/src/pages/petition-public-contact-links.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./petition-public.tsx", import.meta.url), "utf8");

describe("public petition contact links", () => {
  it("keeps sharing separate from post-signature contacts", () => {
    expect(source).toContain("const socialShares");
    expect(source).toContain("const contactLinks");
    expect(source).toContain("buildPetitionContactLinks");
    expect(source).toContain('data-testid="section-petition-contact-links"');
    expect(source).toContain("Fale com o político");
    expect(source).toContain("noopener,noreferrer");
    expect(source).not.toContain("button-success-share-");
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run client/src/pages/petition-public-contact-links.test.ts
```

Expected: FAIL because `contactLinks` is absent.

- [ ] **Step 3: Extend the public petition type**

Add the four nullable contact fields to the local response interface, matching `sanitizePublicPetition`.

- [ ] **Step 4: Build and render contact links**

Import `buildPetitionContactLinks`, derive `contactLinks` once, and map network names to Lucide icons. Keep `socialShares` unchanged in the pre-signature section.

In the success dialog, replace the `socialShares` map with:

```tsx
{contactLinks.length > 0 && (
  <section className="mt-5" data-testid="section-petition-contact-links">
    <p className="mb-3 text-sm font-semibold text-foreground">Fale com o político</p>
    <div className="flex flex-wrap items-center justify-center gap-2">
      {contactLinks.map((contact) => (
        <Button
          key={contact.network}
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Abrir ${contact.label} do político`}
          title={`Abrir ${contact.label} do político`}
          onClick={() => window.open(contact.url, "_blank", "noopener,noreferrer")}
          data-testid={`button-contact-${contact.network}`}
        >
          {renderContactIcon(contact.network)}
        </Button>
      ))}
    </div>
  </section>
)}
```

Use a helper local exaustivo para os icones e nao use SVG manual.

- [ ] **Step 5: Run focused tests and build**

```bash
npx vitest run client/src/pages/petition-public-contact-links.test.ts shared/petition-contact-links.test.ts server/services/petitions.test.ts
npm run check
npm run build
```

Expected: all focused tests PASS, TypeScript exits 0 and production build succeeds.

- [ ] **Step 6: Commit Task 4**

```bash
git add client/src/pages/petition-public.tsx client/src/pages/petition-public-contact-links.test.ts
git commit -m "feat: open politician contacts after petition signing"
```

---

### Task 5: E2E, documentacao e gate local

**Files:**
- Modify: `tests/e2e/critical-flows.spec.ts`
- Create: `docs/api/petition-contact-links.md`
- Modify: `docs/testing/e2e-critical-flows.md`

**Interfaces:**
- Consumes: complete feature from Tasks 1-4.
- Produces: browser regression coverage and reader-facing API/business contract.

- [ ] **Step 1: Extend the critical petition flow**

In the existing petition E2E fixture, configure four safe test destinations:

```ts
contactWhatsapp: "5551999990000",
contactFacebookUrl: "https://facebook.com/politicall-e2e",
contactXUrl: "https://x.com/politicall_e2e",
contactTelegramUrl: "https://t.me/politicall_e2e",
```

Before submitting, assert `button-share-whatsapp` exists. After signing, inspect the four contact buttons and assert their click targets through a `window.open` spy or popup URL without navigating external providers. Remove one destination through edit and verify it no longer renders.

- [ ] **Step 2: Write the API/business contract**

Create `docs/api/petition-contact-links.md` documenting:

- four private create/update fields;
- normalization and validation messages;
- public response fields;
- pre-signature share versus post-signature contact behavior;
- permission `petitions`, CSRF and tenant isolation;
- backward compatibility and migration `0026`;
- examples using reserved/test identities only.

- [ ] **Step 3: Update E2E documentation**

Add the journey and explain that external providers are not contacted during CI; the test verifies generated destinations.

- [ ] **Step 4: Run the delivery gate**

Run:

```bash
npm run check
npm test
npm run build
npm run security:secrets
npm run test:e2e -- --project=chromium
git diff --check origin/main...HEAD
```

Expected:

- feature-focused tests PASS;
- typecheck and build PASS;
- secret scan PASS;
- E2E petition journey PASS when the isolated PostgreSQL/Chromium fixture is available;
- full suite introduces no failure beyond the documented preexisting Windows CRLF assertion;
- diff check reports no whitespace errors.

- [ ] **Step 5: Commit Task 5**

```bash
git add tests/e2e/critical-flows.spec.ts docs/api/petition-contact-links.md docs/testing/e2e-critical-flows.md
git commit -m "test: cover petition post-signature contacts"
```

- [ ] **Step 6: Final review**

Review `origin/main...HEAD` for tenant isolation, unsafe URL handling, accidental changes to pre-signature sharing, secrets, migration order and responsive/accessibility regressions. Do not push or deploy.

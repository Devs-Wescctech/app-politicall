# Public Petition Form UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Brazilian phone formatting and validation, complete municipality autocomplete with automatic UF selection, and clear brand-colored petition sharing actions only on the initial public page.

**Architecture:** Shared pure utilities own phone normalization and municipality lookup so the browser and server enforce identical rules. The public signing route normalizes and validates before persistence, while a focused React autocomplete component manages accessible city selection. The success dialog retains only configured proponent contact actions.

**Tech Stack:** TypeScript, React 18, Express, Zod, Vitest, Testing Library, Vite, bundled IBGE municipality JSON.

## Global Constraints

- Phone validation is structural and does not claim that a telephone line exists or belongs to the signer.
- The complete municipality list is bundled; there is no external runtime geocoding or IBGE dependency.
- Search ignores accents and letter case and selection fills city and UF together.
- Sharing appears only on the initial petition page; post-signature actions are only configured proponent contacts.
- Social controls have stable touch targets of at least 44 by 44 pixels and accessible names.
- Existing petition administration fields and stored signatures are unchanged.

---

### Task 1: Shared Brazilian phone rules

**Files:**
- Create: `shared/brazilian-phone.ts`
- Create: `shared/brazilian-phone.test.ts`

**Interfaces:**
- Produces: `normalizeBrazilianPhone(value: unknown): string`
- Produces: `formatBrazilianPhone(value: unknown): string`
- Produces: `isValidBrazilianPhone(value: unknown): boolean`

- [ ] **Step 1: Write failing utility tests**

Cover `(51) 99999-9999`, fixed-line `(11) 3333-4444`, pasted `+55`, partial formatting, invalid DDD, repeated digits, invalid fixed prefix, and mobile without ninth digit.

```ts
expect(normalizeBrazilianPhone("+55 (51) 99999-9999")).toBe("51999999999");
expect(formatBrazilianPhone("51999999999")).toBe("(51) 99999-9999");
expect(isValidBrazilianPhone("(11) 3333-4444")).toBe(true);
expect(isValidBrazilianPhone("(00) 99999-9999")).toBe(false);
expect(isValidBrazilianPhone("(51) 11111-1111")).toBe(false);
```

- [ ] **Step 2: Run the new test and confirm failure**

Run: `npm test -- shared/brazilian-phone.test.ts`

Expected: FAIL because `shared/brazilian-phone.ts` does not exist.

- [ ] **Step 3: Implement the shared rules**

Use the official Brazilian DDD set and these deterministic rules:

```ts
export function normalizeBrazilianPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits.slice(0, 11);
}

export function isValidBrazilianPhone(value: unknown): boolean {
  const digits = normalizeBrazilianPhone(value);
  if (!VALID_DDDS.has(digits.slice(0, 2)) || /^(\d)\1+$/.test(digits.slice(2))) return false;
  if (digits.length === 10) return /^[2-5]/.test(digits.slice(2));
  return digits.length === 11 && digits[2] === "9";
}
```

`formatBrazilianPhone` must preserve useful partial input while applying the two final masks.

- [ ] **Step 4: Run phone tests**

Run: `npm test -- shared/brazilian-phone.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/brazilian-phone.ts shared/brazilian-phone.test.ts
git commit -m "feat: add Brazilian phone validation"
```

### Task 2: Complete municipality data and lookup

**Files:**
- Create: `shared/data/brazilian-municipalities.json`
- Create: `shared/brazilian-municipalities.ts`
- Create: `shared/brazilian-municipalities.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Produces: `BrazilianMunicipality = { name: string; uf: string }`
- Produces: `searchBrazilianMunicipalities(query: string, limit?: number): BrazilianMunicipality[]`
- Produces: `findBrazilianMunicipality(city: string, uf?: string): BrazilianMunicipality | null`

- [ ] **Step 1: Add failing lookup tests**

```ts
expect(searchBrazilianMunicipalities("sao jose", 10))
  .toContainEqual({ name: "São José", uf: "SC" });
expect(findBrazilianMunicipality("Florianópolis", "SC"))
  .toEqual({ name: "Florianópolis", uf: "SC" });
expect(findBrazilianMunicipality("Cidade inexistente", "SC")).toBeNull();
```

Also assert that the bundled list contains more than 5,500 entries and every entry has a two-letter UF.

- [ ] **Step 2: Run the lookup test and confirm failure**

Run: `npm test -- shared/brazilian-municipalities.test.ts`

Expected: FAIL because the module and data do not exist.

- [ ] **Step 3: Add the official dataset and pure search helpers**

Fetch `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome` during development, transform it once to sorted `{ name, uf }` entries, and commit the resulting JSON. Add `"resolveJsonModule": true` to TypeScript options. Normalize search terms with Unicode NFD and remove combining marks:

```ts
const searchKey = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();
```

Prioritize prefix matches before substring matches and cap results to `limit`, defaulting to 8.

- [ ] **Step 4: Run municipality tests and type checking**

Run: `npm test -- shared/brazilian-municipalities.test.ts && npm run check`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/data/brazilian-municipalities.json shared/brazilian-municipalities.ts shared/brazilian-municipalities.test.ts tsconfig.json
git commit -m "feat: bundle Brazilian municipality lookup"
```

### Task 3: Server-side signature normalization

**Files:**
- Modify: `server/services/petitions.ts`
- Modify: `server/services/petitions.test.ts`
- Modify: `server/routes/public-petition-routes.ts`
- Create: `server/routes/public-petition-routes.test.ts`

**Interfaces:**
- Consumes: `normalizeBrazilianPhone`, `isValidBrazilianPhone`, `findBrazilianMunicipality`
- Produces: `normalizePublicSignatureInput(input): normalized input`
- Extends: `validatePublicSignatureRequirements` with supplied-value validation.

- [ ] **Step 1: Add failing service tests**

Assert that optional malformed phones are rejected, valid phones normalize to national digits, valid city/UF casing is canonicalized, and unknown required municipalities are rejected.

```ts
expect(validatePublicSignatureRequirements(
  { requirePhone: false },
  { phone: "123", acceptedTerms: true },
)).toContainEqual({ field: "phone", message: "Telefone inválido." });
```

- [ ] **Step 2: Add a failing route test**

Post a formatted phone and selected municipality and assert `createPetitionSignature` and contact synchronization receive `51999999999`, `Florianópolis`, and `SC`. Post malformed direct API values and assert HTTP 400 with field details and no persistence call.

- [ ] **Step 3: Run focused server tests and confirm failure**

Run: `npm test -- server/services/petitions.test.ts server/routes/public-petition-routes.test.ts`

Expected: FAIL on missing normalization and validation.

- [ ] **Step 4: Implement normalization before schema parsing**

Normalize a copied request object, pass it to validation and Zod, and never mutate `req.body`:

```ts
const normalizedInput = normalizePublicSignatureInput(req.body ?? {});
const requirementIssues = validatePublicSignatureRequirements(petition, normalizedInput);
const validated = insertPetitionSignatureSchema
  .omit({ petitionId: true })
  .parse(normalizedInput);
```

When city is supplied, require an exact municipality match after accent-insensitive normalization and persist the canonical name and UF.

- [ ] **Step 5: Run focused server tests**

Run: `npm test -- server/services/petitions.test.ts server/routes/public-petition-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/petitions.ts server/services/petitions.test.ts server/routes/public-petition-routes.ts server/routes/public-petition-routes.test.ts
git commit -m "feat: validate public petition contact data"
```

### Task 4: Accessible municipality autocomplete

**Files:**
- Create: `client/src/components/petitions/brazilian-city-autocomplete.tsx`
- Create: `client/src/components/petitions/brazilian-city-autocomplete.test.tsx`
- Modify: `client/src/pages/petition-public.tsx`

**Interfaces:**
- Consumes: `searchBrazilianMunicipalities`
- Produces: `BrazilianCityAutocomplete({ city, state, required, onSelect, onInvalidChange })`

- [ ] **Step 1: Add failing component tests**

Test accent-insensitive suggestions, keyboard selection, mouse selection, automatic UF, no-results state, and invalidation when edited after selection.

```tsx
await user.type(screen.getByTestId("input-city"), "florianop");
await user.click(await screen.findByRole("option", { name: "Florianópolis - SC" }));
expect(onSelect).toHaveBeenCalledWith({ name: "Florianópolis", uf: "SC" });
```

- [ ] **Step 2: Run the component test and confirm failure**

Run: `npm test -- client/src/components/petitions/brazilian-city-autocomplete.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the combobox**

Use the existing `Input` and an absolutely positioned listbox below it. Support ArrowDown, ArrowUp, Enter, Escape, blur-safe mouse selection, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and a maximum of 8 visible results. Keep input and result dimensions stable on mobile and desktop.

- [ ] **Step 4: Integrate city and phone fields into the petition page**

Use `formatBrazilianPhone` on every phone change, show `Telefone inválido.` inline once a complete value is invalid, and block submission for any supplied invalid phone. Replace the city `Input` with the autocomplete; selecting it updates both `form.city` and `form.state`. Submit state when it was inferred from a city even if the standalone state field is hidden.

- [ ] **Step 5: Run component and existing petition tests**

Run: `npm test -- client/src/components/petitions/brazilian-city-autocomplete.test.tsx client/src/pages/petition-contact-fields.test.ts client/src/pages/petition-public-contact-links.test.ts`

Expected: autocomplete tests PASS; the contact-links source test may still fail until Task 5 removes success sharing.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/petitions/brazilian-city-autocomplete.tsx client/src/components/petitions/brazilian-city-autocomplete.test.tsx client/src/pages/petition-public.tsx
git commit -m "feat: improve public petition contact fields"
```

### Task 5: Initial-only branded sharing actions

**Files:**
- Modify: `client/src/pages/petition-public.tsx`
- Modify: `client/src/pages/petition-public-contact-links.test.ts`
- Create: `client/src/pages/petition-public-sharing.test.tsx`

**Interfaces:**
- Preserves: configured `contactLinks` in the success dialog.
- Removes: `section-petition-success-sharing` and success-dialog share buttons.
- Enhances: initial `button-share-*` and `button-copy-link` controls.

- [ ] **Step 1: Update tests to specify the new layout**

Assert that the success sharing section and `button-success-*` controls are absent, proponent contacts remain, and initial controls expose network-specific accessible labels and classes.

```ts
expect(source).not.toContain("section-petition-success-sharing");
expect(source).toContain('data-testid="section-petition-initial-sharing"');
expect(source).toContain("bg-[#25D366]");
```

- [ ] **Step 2: Run sharing tests and confirm failure**

Run: `npm test -- client/src/pages/petition-public-contact-links.test.ts client/src/pages/petition-public-sharing.test.tsx`

Expected: FAIL because success sharing is still rendered and initial controls are neutral/small.

- [ ] **Step 3: Implement the branded initial controls**

Render 48px icon buttons with 20px icons, visible focus rings, titles, and these backgrounds: WhatsApp `#25D366`, Facebook `#1877F2`, X `#000000`, Telegram `#229ED9`, copy link slate. Use white icons and network-specific hover colors. Remove only the success-dialog sharing section; do not remove `contactLinks`.

- [ ] **Step 4: Run all petition-focused tests**

Run: `npm test -- shared/brazilian-phone.test.ts shared/brazilian-municipalities.test.ts server/services/petitions.test.ts server/routes/public-petition-routes.test.ts client/src/components/petitions/brazilian-city-autocomplete.test.tsx client/src/pages/petition-contact-fields.test.ts client/src/pages/petition-public-contact-links.test.ts client/src/pages/petition-public-sharing.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/petition-public.tsx client/src/pages/petition-public-contact-links.test.ts client/src/pages/petition-public-sharing.test.tsx
git commit -m "feat: refine public petition sharing actions"
```

### Task 6: Full verification and browser QA

**Files:**
- Modify only if verification identifies a defect in files already in scope.

**Interfaces:**
- Verifies the complete feature without publishing it.

- [ ] **Step 1: Run static and focused validation**

Run:

```bash
npm run check
npm run security:secrets
npm test -- shared/brazilian-phone.test.ts shared/brazilian-municipalities.test.ts server/services/petitions.test.ts server/routes/public-petition-routes.test.ts client/src/components/petitions/brazilian-city-autocomplete.test.tsx client/src/pages/petition-contact-fields.test.ts client/src/pages/petition-public-contact-links.test.ts client/src/pages/petition-public-sharing.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 2: Run the full suite and production build**

Run: `npm test && npm run build`

Expected: all tests and build PASS.

- [ ] **Step 3: Start the local application and perform browser checks**

Validate desktop and mobile widths on an existing public petition:

- Phone formats while typing and rejects invalid DDDs.
- Typing an unaccented city shows accented `City - UF` suggestions.
- Selection fills UF and the form submits normalized data.
- Initial sharing buttons are large, colored, non-overlapping, and open the expected URLs.
- The success dialog has no sharing section and retains configured proponent contacts.

- [ ] **Step 4: Review the final diff**

Run: `git diff origin/main...HEAD --check && git status --short`

Expected: no whitespace errors and only planned files changed.

- [ ] **Step 5: Commit verification corrections when needed**

If a defect was corrected, stage only the already planned files changed for that correction and commit with `git commit -m "fix: address petition form verification findings"`. If no defect was found, leave the clean branch unchanged.

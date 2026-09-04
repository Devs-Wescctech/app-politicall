# Petition Success Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clearly separated proponent-contact and petition-sharing actions to the post-signature confirmation dialog.

**Architecture:** Reuse the existing `contactLinks` and `socialShares` collections in `petition-public.tsx`. Keep link construction in the existing shared helpers, add only modal presentation and copy-feedback state, and cover the behavior with source-level and Playwright tests.

**Tech Stack:** React, TypeScript, TanStack Query, Radix Dialog, Tailwind CSS, Vitest, Playwright

## Global Constraints

- Contact heading and accessibility copy must say `proponente da peticao`, never `politico`.
- Contact actions appear only when the petition has configured contact networks.
- Share actions for WhatsApp, Facebook, X/Twitter, Telegram, and copy link always appear.
- No database migration, endpoint, or schema change.
- External links open in a new tab with `noopener,noreferrer`.
- Copy success or failure is visible without closing the dialog.

---

### Task 1: Specify the post-signature actions

**Files:**
- Modify: `client/src/pages/petition-public-contact-links.test.ts`
- Modify: `tests/e2e/critical-flows.spec.ts`

**Interfaces:**
- Consumes: existing `socialShares`, `contactLinks`, and `handleCopy` in `petition-public.tsx`
- Produces: assertions for `section-petition-contact-links`, `section-petition-success-sharing`, `button-success-share-*`, and `button-success-copy-link`

- [ ] **Step 1: Update the source-level test with the required labels and controls**

```ts
expect(source).toContain("Fale com o proponente da petição");
expect(source).not.toContain("Fale com o político");
expect(source).toContain('data-testid="section-petition-success-sharing"');
expect(source).toContain('data-testid={`button-success-share-${s.name.toLowerCase()}`}');
expect(source).toContain('data-testid="button-success-copy-link"');
```

- [ ] **Step 2: Extend the petition E2E scenario**

After opening `dialog-success`, assert both section headings, click the success-dialog WhatsApp share action, confirm the opened URL starts with `https://wa.me/?text=`, click copy link, and assert the visible success text.

```ts
await expect(page.getByText("Fale com o proponente da petição", { exact: true })).toBeVisible();
await expect(page.getByText("Compartilhe esta petição", { exact: true })).toBeVisible();
await page.getByTestId("button-success-share-whatsapp").click();
await expect.poll(() => page.evaluate(() => sessionStorage.getItem("e2e-window-open-url")))
  .toMatch(/^https:\/\/wa\.me\/\?text=/);
await page.getByTestId("button-success-copy-link").click();
await expect(page.getByText("Link copiado", { exact: true })).toBeVisible();
```

- [ ] **Step 3: Run the focused test and verify failure**

Run: `npm test -- client/src/pages/petition-public-contact-links.test.ts`

Expected: FAIL because the new heading and success-sharing controls do not exist yet.

- [ ] **Step 4: Commit the failing specification**

```bash
git add client/src/pages/petition-public-contact-links.test.ts tests/e2e/critical-flows.spec.ts
git commit -m "test: specify petition success sharing actions"
```

### Task 2: Implement the success-dialog experience

**Files:**
- Modify: `client/src/pages/petition-public.tsx`

**Interfaces:**
- Consumes: `socialShares: { name: string; icon: LucideIcon; url: string }[]` and `contactLinks: PetitionContactLink[]`
- Produces: success-dialog contact and sharing sections with stable test IDs and copy feedback

- [ ] **Step 1: Add copy feedback state and a reusable async copy handler**

```ts
const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl);
    setCopyStatus("copied");
  } catch {
    setCopyStatus("error");
  }
};
```

Reset `copyStatus` to `idle` when a new signature succeeds and when the dialog closes.

- [ ] **Step 2: Rename the contact section and accessibility labels**

```tsx
<p>Fale com o proponente da petição</p>
aria-label={`Abrir ${contact.label} do proponente da petição`}
title={`Abrir ${contact.label} do proponente da petição`}
```

- [ ] **Step 3: Render the sharing section after the optional contact section**

```tsx
<section className="mt-5 border-t pt-5" data-testid="section-petition-success-sharing">
  <p className="mb-3 text-sm font-semibold text-foreground">Compartilhe esta petição</p>
  <div className="flex flex-wrap items-center justify-center gap-2">
    {socialShares.map((s) => (
      <Button
        key={s.name}
        type="button"
        size="icon"
        variant="outline"
        aria-label={`Compartilhar petição no ${s.name}`}
        title={`Compartilhar no ${s.name}`}
        onClick={() => window.open(s.url, "_blank", "width=600,height=400,noopener,noreferrer")}
        data-testid={`button-success-share-${s.name.toLowerCase()}`}
      >
        <s.icon className="h-4 w-4" />
      </Button>
    ))}
    <Button type="button" size="icon" variant="outline" onClick={handleCopy} data-testid="button-success-copy-link">
      <LinkIcon className="h-4 w-4" />
    </Button>
  </div>
  <p aria-live="polite">
    {copyStatus === "copied" ? "Link copiado" : copyStatus === "error" ? "Não foi possível copiar o link" : ""}
  </p>
</section>
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- client/src/pages/petition-public-contact-links.test.ts shared/petition-contact-links.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add client/src/pages/petition-public.tsx
git commit -m "feat: add sharing actions after petition signature"
```

### Task 3: Validate and publish

**Files:**
- No source changes expected

**Interfaces:**
- Consumes: completed feature branch
- Produces: merged PR, immutable container image, and healthy production deployment

- [ ] **Step 1: Run complete validation**

Run: `npm test && npm run check && npm run security:secrets && npm run build`

Expected: all test files pass, TypeScript exits `0`, secret scan exits `0`, and production build succeeds.

- [ ] **Step 2: Run Playwright petition flow at desktop and mobile widths**

Run the existing E2E setup for `tests/e2e/critical-flows.spec.ts`, verify no overlap in the modal, and confirm both sets of actions remain visible.

- [ ] **Step 3: Push, open a PR, and wait for CI**

```bash
git push -u origin codex/petition-success-sharing
```

Merge only after all required checks pass.

- [ ] **Step 4: Deploy the immutable image with rollback metadata**

Back up `/var/www/html/app-politicall/docker-compose.yml`, update only the Politicall image digest, run `docker compose pull app` and `docker compose up -d --no-deps --force-recreate app` from `/var/www/html/app-politicall`.

- [ ] **Step 5: Verify production**

Confirm `docker compose ps` reports `healthy`, `/api/health` and `/api/ready` return `200`, the public petition page returns `200` with and without `www`, and recent application logs contain no fatal errors.

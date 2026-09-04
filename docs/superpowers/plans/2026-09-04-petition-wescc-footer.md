# Petition Wescctech Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, accessible Wescctech attribution link directly over the petition background at the bottom of every public petition page.

**Architecture:** Keep the feature inside the existing public petition page because it has no state or reusable behavior. Render one semantic footer after the main petition content and before the success dialog, then protect the contract with the existing source-level Vitest suite.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

## Global Constraints

- Display exactly `Plataforma desenvolvida por Wescctech`.
- Link to exactly `https://wescctech.com.br/`.
- Open the external site in a new tab with `rel="noopener noreferrer"`.
- Do not add a logo, separate black bar, border, or modify other pages.
- Preserve the petition form, sharing controls, and confirmation dialog.

---

### Task 1: Public petition attribution footer

**Files:**
- Modify: `client/src/pages/petition-public.tsx:522`
- Modify: `client/src/pages/petition-public-sharing.test.ts`

**Interfaces:**
- Consumes: the existing public petition page layout and Tailwind utility classes.
- Produces: a semantic `footer` identified by `data-testid="footer-wescc-tech"` and an external attribution link.

- [ ] **Step 1: Write the failing test**

Add this test to `client/src/pages/petition-public-sharing.test.ts`:

```ts
it("credits Wescctech discreetly without a separate black bar", () => {
  expect(source).toContain('data-testid="footer-wescc-tech"');
  expect(source).toContain("Plataforma desenvolvida por Wescctech");
  expect(source).toContain('href="https://wescctech.com.br/"');
  expect(source).toContain('target="_blank"');
  expect(source).toContain('rel="noopener noreferrer"');
  expect(source).toContain('className="relative z-10 px-4 pb-4 text-center"');
  expect(source).toContain("text-[11px]");
  expect(source).not.toContain("border-t border-white/15 bg-black/95");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run client/src/pages/petition-public-sharing.test.ts`

Expected: FAIL because `footer-wescc-tech` is absent.

- [ ] **Step 3: Implement the footer**

Insert after the main petition content and before the success dialog in `client/src/pages/petition-public.tsx`:

```tsx
<footer className="relative z-10 px-4 pb-4 text-center" data-testid="footer-wescc-tech">
  <a
    href="https://wescctech.com.br/"
    target="_blank"
    rel="noopener noreferrer"
    className="inline-block text-[11px] text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
  >
    Plataforma desenvolvida por Wescctech
  </a>
</footer>
```

- [ ] **Step 4: Run automated validation**

Run: `npm test -- --run client/src/pages/petition-public-sharing.test.ts`

Expected: all tests in the file pass.

Run: `npm run check`

Expected: TypeScript exits with code 0.

Run: `npm run build`

Expected: production build exits with code 0.

- [ ] **Step 5: Verify responsive rendering**

Start the local application using the repository's existing development command, open a published petition, and capture the bottom of the page at desktop and mobile widths. Confirm the attribution is below the sharing section, remains readable directly over the petition background, has no independent bar or border, and opens the exact Wescctech URL in a new tab.

- [ ] **Step 6: Commit the implementation**

```bash
git add client/src/pages/petition-public.tsx client/src/pages/petition-public-sharing.test.ts
git commit -m "fix: refina credito Wescctech nas peticoes"
```

# Petition Link Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve petition-specific Open Graph metadata with image, summary, signature count, and goal when social crawlers request `/p/:slug`.

**Architecture:** Extract social-preview formatting and HTML injection from `server/index.ts` into a focused, pure module. Register a dependency-injected Express handler that loads the environment-appropriate HTML template, fetches only publicly visible petitions, retrieves the existing aggregate signature count, and falls back to the current SPA on operational errors.

**Tech Stack:** Node.js 24, TypeScript, Express 4, Vitest, existing storage abstraction and HTML escaping utility.

## Global Constraints

- Do not change the database schema or add a new persistence layer.
- Only published or completed petitions may expose petition-specific metadata.
- Use the petition banner first, logo second, and a public Politicall image last.
- Production must read `dist/public/index.html`; development must read `client/index.html`.
- Canonical URLs contain only `/p/:slug` and do not retain tracking query parameters.
- Metadata values must be HTML escaped.
- Operational failures must fall through to the existing SPA without exposing secrets.

---

### Task 1: Pure petition preview model and HTML renderer

**Files:**
- Create: `server/petition-link-preview.ts`
- Create: `server/petition-link-preview.test.ts`

**Interfaces:**
- Consumes: petition fields `title`, `description`, `bannerUrl`, `logoUrl`, `goal`, `status`, and `slug`.
- Produces: `isSocialCrawler(userAgent: string): boolean`, `resolvePublicOrigin(headers, configuredUrl?): string`, `buildPetitionPreview(petition, signaturesCount, origin): PetitionLinkPreview`, `buildGenericPetitionPreview(origin, slug): PetitionLinkPreview`, `injectPetitionPreviewHtml(html, preview): string`, and `resolvePetitionTemplatePath(environment, runtimeDirectory): string`.

- [ ] **Step 1: Write failing crawler and template-path tests**

Add table-driven tests proving WhatsApp, Facebook, Telegram, X, LinkedIn, Slack, Discord, Google, Bing, Pinterest, and Apple user agents are recognized; normal Chrome is rejected. Assert production resolves `<runtime>/public/index.html` and development resolves `<runtime>/../client/index.html`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run server/petition-link-preview.test.ts`

Expected: FAIL because `server/petition-link-preview.ts` does not exist.

- [ ] **Step 3: Implement crawler detection, origin normalization, and path resolution**

Use a fixed lower-case crawler token list. Parse the first forwarded host/protocol value, allow only `http` or `https`, prefer `PUBLIC_APP_URL` when valid, and default to `https://www.politicall.com.br`. Resolve the production path from `runtimeDirectory/public/index.html` and the development path from `runtimeDirectory/../client/index.html`.

- [ ] **Step 4: Write failing preview-content tests**

Cover:

```ts
expect(preview.title).toBe("Mais segurança no bairro");
expect(preview.description).toContain("128 assinaturas de uma meta de 500");
expect(preview.image).toBe("https://politicall.com.br/uploads/petitions/seguranca.jpg");
expect(preview.url).toBe("https://politicall.com.br/p/mais-seguranca");
```

Also cover HTML removal, whitespace normalization, safe truncation, singular `1 assinatura`, banner/logo/default image fallback, absolute images, rejection of `data:` images, and completed-petition visibility through the existing policy.

- [ ] **Step 5: Implement preview formatting**

Build a plain-text description capped before metadata injection, append the localized signature/meta sentence and CTA, and convert relative image paths with `new URL(path, origin)`. Use the stable default `/favicon.png` only when the petition has no crawler-safe image.

- [ ] **Step 6: Write failing metadata injection tests**

Assert one copy of each tag is inserted: `og:title`, `og:description`, `og:image`, `og:image:alt`, `og:url`, `og:type`, `og:site_name`, `og:locale`, `twitter:card`, Twitter title/description/image, canonical link, document title, and standard description. Include `<`, `>`, `&`, and quotes in fixture content and verify escaping.

- [ ] **Step 7: Implement idempotent HTML injection**

Remove prior dynamic preview blocks and replace the base title/description before inserting one marked metadata block before `</head>`. Return the original HTML only when it lacks a head element.

- [ ] **Step 8: Run focused tests and commit**

Run: `npx vitest run server/petition-link-preview.test.ts server/html-escape.test.ts server/services/petitions.test.ts`

Expected: all tests pass.

Commit:

```bash
git add server/petition-link-preview.ts server/petition-link-preview.test.ts
git commit -m "feat: generate petition social previews"
```

---

### Task 2: Dependency-injected social crawler route

**Files:**
- Create: `server/petition-link-preview-route.ts`
- Create: `server/petition-link-preview-route.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `storage.getPetitionBySlug(slug)`, `storage.getPetitionSignatureCount(id)`, `isPublicPetitionVisible`, filesystem template loading, and Task 1 preview helpers.
- Produces: `createPetitionLinkPreviewHandler(dependencies): RequestHandler`.

- [ ] **Step 1: Write failing route tests**

Use an Express test server with injected storage and template reader. Verify a WhatsApp request to `/p/teste` returns status 200 and petition-specific metadata, queries the signature count once, sets `Content-Type: text/html`, and sets a short revalidating cache policy.

- [ ] **Step 2: Add visibility and fallback tests**

Prove that a regular browser calls `next()` without storage access; draft, paused, and missing petitions use generic metadata without title/description leakage; a read or storage error calls `next()`; and query parameters do not enter the canonical URL.

- [ ] **Step 3: Run route tests and verify RED**

Run: `npx vitest run server/petition-link-preview-route.test.ts`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 4: Implement the handler**

The handler must:

```ts
if (!isSocialCrawler(req.get("user-agent") ?? "")) return next();
const petition = await dependencies.getPetitionBySlug(req.params.slug);
const visible = isPublicPetitionVisible(petition);
const count = visible ? await dependencies.getPetitionSignatureCount(petition.id) : 0;
const preview = visible
  ? buildPetitionPreview(petition, count, origin)
  : buildGenericPetitionPreview(origin, req.params.slug);
```

Load the resolved template, inject metadata, return HTML, and use `public, max-age=60, stale-while-revalidate=300`. Log only a concise error message before calling `next()`.

- [ ] **Step 5: Replace the inline petition SSR block**

Delete only the existing `handlePetitionSSR` implementation in `server/index.ts`. Register the extracted handler with real storage methods, `fs.promises.readFile`, `process.env.NODE_ENV`, `process.env.PUBLIC_APP_URL`, `import.meta.dirname`, and the existing logger.

- [ ] **Step 6: Run route and regression tests**

Run: `npx vitest run server/petition-link-preview-route.test.ts server/petition-link-preview.test.ts server/routes/public-petition-routes.test.ts`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/index.ts server/petition-link-preview-route.ts server/petition-link-preview-route.test.ts
git commit -m "fix: serve petition previews in production"
```

---

### Task 3: Production artifact and full regression verification

**Files:**
- Modify only if a verified test exposes a defect in Task 1 or Task 2.

**Interfaces:**
- Consumes: built `dist/index.js` and `dist/public/index.html`.
- Produces: evidence that the production bundle contains and can resolve the petition preview template.

- [ ] **Step 1: Run static and unit verification**

Run:

```bash
npm run check
npm test -- --run
npm run security:secrets
```

Expected: TypeScript exits 0, all non-skipped tests pass, and the secret scanner exits 0.

- [ ] **Step 2: Build the production artifact**

Run: `npm run build`

Expected: Vite and all esbuild commands exit 0, producing `dist/index.js` and `dist/public/index.html`.

- [ ] **Step 3: Verify the production path against built files**

Run a focused Vitest case with a runtime directory ending in `dist` and assert the resolved path exists after build. Read the built template, inject a fixture preview, and verify the resulting HTML contains the petition title, absolute image, localized metrics, and canonical URL.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors and no unintended generated files.

- [ ] **Step 5: Commit any final test-only refinement**

If Step 3 required a new production-artifact test, commit it with:

```bash
git add server/petition-link-preview.test.ts
git commit -m "test: verify production petition preview template"
```


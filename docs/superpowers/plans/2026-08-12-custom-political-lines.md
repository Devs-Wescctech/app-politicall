# Custom Political Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar linhas políticas totalmente personalizáveis por gabinete e conectá-las ao cadastro, visualização, filtros e relatórios de alianças.

**Architecture:** Uma nova tabela `alliance_lines` pertence ao gabinete e é referenciada opcionalmente por `political_alliances`. Rotas REST dedicadas aplicam validação Zod e isolamento multi-tenant; o frontend consome essas rotas por um componente de gerenciamento separado e enriquece os registros de aliança com a linha associada.

**Tech Stack:** PostgreSQL 16, Drizzle ORM, Zod, Express, React 18, TanStack Query, React Hook Form, Radix UI, Lucide, Vitest e Playwright.

## Global Constraints

- Cada aliança pertence a no máximo uma linha política.
- Linhas são isoladas por `account_id` e exigem permissão `alliances`.
- Cor aceita somente `#RRGGBB`; ícone vem de allowlist Lucide.
- Linha em uso não pode ser excluída; inativação permanece disponível.
- Registros legados devem ser preservados e classificados por ideologia quando possível.
- Nenhuma alteração será publicada; validação final ocorre em `http://127.0.0.1:5001`.

---

### Task 1: Domínio, migration e contratos

**Files:**
- Create: `migrations/0018_custom_alliance_lines.sql`
- Create: `shared/alliance-lines.ts`
- Create: `shared/alliance-lines.test.ts`
- Modify: `shared/schema.ts`
- Modify: `scripts/setup-dev-db.ts`

**Interfaces:**
- Produces: `AllianceLine`, `InsertAllianceLine`, `insertAllianceLineSchema`, `updateAllianceLineSchema`, `reorderAllianceLinesSchema`, `ALLIANCE_LINE_ICONS`, `allianceLineTextColor(color)`.

- [ ] **Step 1: Write failing schema and contrast tests** covering valid `#14B8A6`, invalid shorthand/unsafe icons, trimmed names, non-negative order and deterministic black/white contrast.
- [ ] **Step 2: Run `npx vitest run shared/alliance-lines.test.ts`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the shared validation module and Drizzle schema** with `alliance_lines`, unique account/name index, order/status indexes, relations and nullable `political_alliances.lineId` using `ON DELETE RESTRICT`.
- [ ] **Step 4: Implement migration 0018** creating the table/column/indexes, creating only used ideology lines per account, and updating existing alliances by party ideology without overwriting a populated `line_id`.
- [ ] **Step 5: Add migration 0018 to local bootstrap** and run the focused tests, TypeScript and migration integration tests.

### Task 2: Storage e API multi-tenant

**Files:**
- Create: `server/services/alliance-line-service.ts`
- Create: `server/services/alliance-line-service.test.ts`
- Modify: `server/storage.ts`
- Modify: `server/routes/alliance-routes.ts`
- Create: `tests/alliance-line-routes.test.ts`

**Interfaces:**
- Consumes: schemas from Task 1.
- Produces: `GET/POST/PATCH/PUT/DELETE /api/alliance-lines` and enriched `GET /api/alliances` response with `line`.

- [ ] **Step 1: Write failing service tests** for duplicate names, foreign/inactive lines, complete reorder validation and deletion in use.
- [ ] **Step 2: Run focused tests** and confirm expected missing-service failures.
- [ ] **Step 3: Add storage methods** to list, create, update, reorder and delete lines scoped by account; add lookup/count helpers and transactional reorder.
- [ ] **Step 4: Implement service validation** that normalizes names/colors, rejects inactive/foreign assignments and converts conflicts to typed domain errors.
- [ ] **Step 5: Write failing route contract tests** for authentication, permission, status codes 201/400/404/409 and account isolation.
- [ ] **Step 6: Implement routes and alliance enrichment**, validate `lineId` on create/update, and leave accepted public invites unclassified.
- [ ] **Step 7: Run service/route tests, TypeScript and all backend tests.**

### Task 3: Gerenciador de linhas políticas

**Files:**
- Create: `client/src/components/alliances/AllianceLineBadge.tsx`
- Create: `client/src/components/alliances/AllianceLineManager.tsx`
- Create: `client/src/components/alliances/alliance-line-ui.test.ts`
- Modify: `client/src/pages/alliances.tsx`

**Interfaces:**
- Consumes: `/api/alliance-lines`, shared icon allowlist and contrast helper.
- Produces: botão `button-manage-alliance-lines`, formulário CRUD, preview, status, ordem e exclusão protegida.

- [ ] **Step 1: Write failing UI contract tests** asserting test IDs, accessible labels, color input, icon selector, active switch and badge text/icon fallback.
- [ ] **Step 2: Run focused UI tests** and confirm failure because components do not exist.
- [ ] **Step 3: Implement `AllianceLineBadge`** with allowlist icon resolver, color background/border and accessible name.
- [ ] **Step 4: Implement `AllianceLineManager`** with list ordered by `displayOrder`, create/edit dialog, synchronized color controls, icon picker, numeric order, active switch, preview, Query mutations and conflict messages.
- [ ] **Step 5: Connect manager button to Alliances** and invalidate both line and alliance queries after mutations.
- [ ] **Step 6: Run focused tests and TypeScript.**

### Task 4: Ecossistema de alianças e validação E2E

**Files:**
- Modify: `client/src/pages/alliances.tsx`
- Modify: `tests/e2e/global-setup.ts`
- Modify: `tests/e2e/global-teardown.ts`
- Modify: `tests/e2e/critical-flows.spec.ts`
- Modify: `docs/testing/e2e-critical-flows.md`

**Interfaces:**
- Consumes: linhas e alianças enriquecidas das Tasks 2 e 3.
- Produces: filtros, resumo, formulários, PDF/Excel e fluxo Playwright completo.

- [ ] **Step 1: Add a failing E2E flow** that creates a custom line, changes its color, creates an alliance assigned to it, filters the page and verifies the badge.
- [ ] **Step 2: Run only the new Playwright test** and confirm failure at the first missing control.
- [ ] **Step 3: Add line query/filter/summary** including “Sem linha”, line badge on alliance rows and “Linha predominante”.
- [ ] **Step 4: Add required active-line selector** to create/edit forms and line column to PDF/Excel exports.
- [ ] **Step 5: Add E2E setup/teardown cleanup** for the custom line and alliance without touching non-E2E records.
- [ ] **Step 6: Run E2E twice** and verify zero residual E2E records.
- [ ] **Step 7: Run `npm run check`, `npm test`, `npm run build`, both npm audits, secret scan, YAML lint and `git diff --check`; confirm `/api/ready` returns 200 on port 5001.**

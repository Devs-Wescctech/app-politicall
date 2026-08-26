# Demand Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar localmente um fluxo de Demandas conectado a eleitor, atendimento, agenda, usuarios, dashboard e relatorio de SLA.

**Architecture:** O dominio sera extraido das rotas monoliticas para um service testavel. O schema sera ampliado de forma aditiva e o frontend consumira respostas enriquecidas mantendo compatibilidade com registros antigos.

**Tech Stack:** TypeScript 5.6, Express 4, React 18, TanStack Query 5, Drizzle ORM 0.45, PostgreSQL, Zod 3, Vitest 4.

## Global Constraints

- Demanda externa exige eleitor; demanda interna exige categoria e responsavel.
- Todos os vinculos devem pertencer a conta autenticada.
- A migracao deve preservar demandas existentes.
- Nenhuma alteracao sera enviada ao GitHub ou publicada em producao.
- Toda regra nova deve seguir TDD.

---

### Task 1: Modelo, migracao e regras puras

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0011_demand_ecosystem.sql`
- Create: `server/services/demand-domain.ts`
- Test: `server/services/demand-domain.test.ts`

**Interfaces:**
- Produces: `calculateSlaDueAt(createdAt, slaHours)`, `validateDemandLinksInput(input)`, `buildDemandProtocol(year, sequence)`, `buildDemandSummary(demands, now)`.

- [ ] Escrever testes falhando para protocolo, SLA, regra externa/interna e resumo.
- [ ] Rodar `npx vitest run server/services/demand-domain.test.ts` e confirmar falhas pela ausencia das funcoes.
- [ ] Implementar as funcoes puras e enums compartilhados.
- [ ] Adicionar schema Drizzle, indices e migracao idempotente com backfill.
- [ ] Rodar o teste e `npm run check`.
- [ ] Commitar o incremento.

### Task 2: Service, persistencia e API

**Files:**
- Create: `server/services/demands.ts`
- Create: `server/routes/demand-routes.ts`
- Create: `server/routes/demand-routes.test.ts`
- Modify: `server/storage.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: tipos e regras da Task 1.
- Produces: `DemandService` e `registerDemandRoutes(app)`.

- [ ] Escrever testes falhando para criacao externa/interna, isolamento de conta, historico, alteracao de status e follow-up.
- [ ] Executar os testes e confirmar falhas funcionais esperadas.
- [ ] Implementar repository methods e service transacional.
- [ ] Registrar novas rotas e remover o bloco legado equivalente de `routes.ts`.
- [ ] Rodar testes focados, suite completa e typecheck.
- [ ] Commitar o incremento.

### Task 3: Interface operacional de Demandas

**Files:**
- Modify: `client/src/pages/demands.tsx`
- Create: `client/src/components/demands/demand-form.tsx`
- Create: `client/src/components/demands/demand-summary.tsx`
- Create: `client/src/components/demands/demand-history.tsx`
- Create: `client/src/components/demands/demand-form.test.tsx`

**Interfaces:**
- Consumes: APIs de demandas, categorias, usuarios e contatos.
- Produces: formulario condicional, resumo de SLA e historico no painel lateral.

- [ ] Escrever teste falhando para obrigatoriedade de eleitor externo e responsavel interno.
- [ ] Implementar formulario acessivel com estados de carregamento/erro/vazio.
- [ ] Adicionar busca e filtros sem alterar o tamanho estavel das colunas.
- [ ] Exibir protocolo, origem, categoria, responsavel, eleitor e SLA nos cards/detalhes.
- [ ] Rodar testes de componente e typecheck.
- [ ] Commitar o incremento.

### Task 4: Conexoes com agenda, atendimento e dashboard

**Files:**
- Modify: `client/src/pages/attendance.tsx`
- Modify: `client/src/pages/dashboard.tsx`
- Modify: `server/routes/dashboard-routes.ts`
- Modify: `server/services/dashboard-stats.ts`
- Modify: `server/services/dashboard-stats.test.ts`

**Interfaces:**
- Consumes: `POST /api/demands`, `POST /api/demands/:id/follow-up`, `GET /api/demands/summary`.
- Produces: atalho contextual do atendimento e indicadores de SLA no dashboard.

- [ ] Escrever testes falhando para indicadores de SLA.
- [ ] Implementar indicadores no service e rota de dashboard.
- [ ] Adicionar criacao de demanda no contexto do atendimento sem duplicar formulario.
- [ ] Adicionar acao de follow-up no detalhe da demanda.
- [ ] Rodar testes e typecheck.
- [ ] Commitar o incremento.

### Task 5: Validacao integrada local

**Files:**
- Modify: `docs/DEMANDAS.md`
- Create: `tests/demand-ecosystem.e2e.test.ts` quando o harness permitir banco local isolado.

**Interfaces:**
- Consumes: sistema completo das Tasks 1-4.
- Produces: evidencia de funcionamento e instrucoes locais.

- [ ] Aplicar migracao apenas no banco local e registrar o resultado.
- [ ] Rodar `npm run check`, `npm test`, `npm run build` e `npm run security:secrets`.
- [ ] Iniciar o servidor local em porta livre.
- [ ] Validar com navegador desktop e mobile o fluxo principal e estados de erro.
- [ ] Documentar contratos, migracao, rollback e validacao local.
- [ ] Revisar o diff e confirmar que nao houve push nem acesso a producao.

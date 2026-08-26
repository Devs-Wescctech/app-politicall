# Demand Operations Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar uma central operacional de demandas que concentre pendencias, prazos, encaminhamentos, indicadores e exportacoes, integrada a Demandas, Dashboard e Relatorios.

**Architecture:** Um dominio puro classifica demandas e calcula indicadores a partir de snapshots account-scoped carregados pelo servico PostgreSQL. Um endpoint protegido expoe filtros, resumo, rankings e fila paginada; componentes React reutilizam esse contrato nas tres paginas e exportam a mesma visao em XLSX/PDF.

**Tech Stack:** TypeScript, Express, Drizzle ORM/PostgreSQL, Zod, React, TanStack Query, shadcn/ui, ExcelJS, pdfmake, Vitest.

## Global Constraints

- Executar e validar somente no ambiente local `http://127.0.0.1:5001`; nao publicar nem alterar producao.
- Isolar todos os dados por `accountId` e exigir a permissao `demands`.
- Manter o periodo padrao nos ultimos 30 dias, `pageSize` padrao 25 e limite 100.
- Considerar prazo proximo quando vencer em ate 4 horas e demanda parada quando nao houver atualizacao ha 7 dias.
- Nao criar tabela ou migration; reutilizar demandas, categorias, usuarios, destinos, encaminhamentos e historico existentes.
- Exportar no maximo 5.000 linhas e carregar ExcelJS/pdfmake apenas quando o usuario solicitar.

---

### Task 1: Dominio de classificacao e indicadores

**Files:**
- Create: `server/services/demand-operations-domain.ts`
- Test: `server/services/demand-operations-domain.test.ts`

**Interfaces:**
- Produces: `classifyDemandOperation(input, now)`, `buildDemandOperationsReport(rows, filters, now)` e os tipos `DemandOperationFilters`, `DemandOperationSummary`, `DemandOperationItem`, `DemandOperationsReport`.

- [x] **Step 1: Write the failing tests**

Cobrir prioridade unica `forwarding_overdue > demand_overdue > due_soon > stale > active`, estados ativos, taxas sem divisao por zero, medias de primeiro movimento/resposta/resolucao, rankings e paginacao deterministica.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/demand-operations-domain.test.ts`
Expected: FAIL porque o modulo ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Criar tipos serializaveis, constantes `ACTIVE_DEMAND_STATUSES`, `ACTIVE_FORWARDING_STATUSES`, `DUE_SOON_HOURS = 4`, `STALE_DAYS = 7`; classificar cada demanda uma unica vez, calcular taxas como fracoes entre 0 e 1 e ordenar por severidade, prazo e protocolo.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/demand-operations-domain.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/services/demand-operations-domain.ts server/services/demand-operations-domain.test.ts
git commit -m "feat: add demand operations domain"
```

### Task 2: Servico account-scoped e filtros

**Files:**
- Create: `server/services/demand-operations.ts`
- Test: `server/services/demand-operations.test.ts`

**Interfaces:**
- Consumes: `buildDemandOperationsReport` e tabelas de demandas.
- Produces: `getDemandOperations(accountId, filters)` e `normalizeDemandOperationFilters(query, now)`.

- [x] **Step 1: Write the failing tests**

Testar periodo padrao de 30 dias, limites de pagina, busca normalizada, filtros por categoria/destino/responsavel/status/prazo e rejeicao de intervalo invertido. Verificar no codigo que todas as consultas incluem `accountId` e que destinatarios de outra conta nao entram no snapshot.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/demand-operations.test.ts`
Expected: FAIL porque o servico ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Consultar demandas do periodo com categoria, contato e responsavel; carregar encaminhamentos/destinos e primeiro evento de historico apenas dos IDs encontrados; converter timestamps para ISO e delegar calculos ao dominio. Aplicar filtros antes dos rankings e da paginacao.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/demand-operations.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/services/demand-operations.ts server/services/demand-operations.test.ts
git commit -m "feat: query demand operations data"
```

### Task 3: Endpoint protegido

**Files:**
- Create: `server/routes/demand-operation-routes.ts`
- Test: `server/routes/demand-operation-routes.test.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: `getDemandOperations(accountId, filters)`.
- Produces: `GET /api/demand-operations` com `{ generatedAt, filters, summary, breakdowns, items, pagination }`.

- [x] **Step 1: Write the failing tests**

Testar autenticacao, permissao `demands`, parsing de filtros validos, resposta 400 para datas/paginacao invalidas e encaminhamento do `accountId` autenticado ao servico.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/demand-operation-routes.test.ts`
Expected: FAIL porque a rota ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Registrar a rota com `authenticateToken` e `requirePermission("demands")`, validar query com Zod, responder 400 com `VALIDATION_ERROR` e 500 com `DEMAND_OPERATIONS_INTERNAL_ERROR`, e registrar o modulo em `server/routes.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/demand-operation-routes.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add server/routes/demand-operation-routes.ts server/routes/demand-operation-routes.test.ts server/routes.ts
git commit -m "feat: expose demand operations endpoint"
```

### Task 4: Central operacional em Demandas

**Files:**
- Create: `client/src/components/demands/demand-operations-center.tsx`
- Create: `client/src/components/demands/demand-operations-types.ts`
- Test: `client/src/components/demands/demand-operations-center.test.tsx`
- Modify: `client/src/pages/demands.tsx`

**Interfaces:**
- Consumes: `GET /api/demand-operations` e callback `onOpenDemand(id)`.
- Produces: painel com indicadores, filtros, rankings e fila paginada, identificado por `data-testid="demand-operations-center"`.

- [x] **Step 1: Write the failing tests**

Testar loading, erro com nova tentativa, vazio, indicadores, aplicacao/limpeza de filtros, paginacao e clique de linha chamando `onOpenDemand`.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/demands/demand-operations-center.test.tsx`
Expected: FAIL porque o componente ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Adicionar aba `Central` ao lado do quadro existente; usar controles compactos, cards sem aninhamento, tabela desktop e lista mobile. Exibir motivo operacional, protocolo, titulo, responsavel, destino, status e prazo, preservando o drawer atual ao abrir uma demanda.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/demands/demand-operations-center.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add client/src/components/demands/demand-operations-center.tsx client/src/components/demands/demand-operations-types.ts client/src/components/demands/demand-operations-center.test.tsx client/src/pages/demands.tsx
git commit -m "feat: add demand operations center"
```

### Task 5: Exportacoes XLSX e PDF

**Files:**
- Create: `client/src/lib/demand-operations-export.ts`
- Test: `client/src/lib/demand-operations-export.test.ts`
- Modify: `client/src/components/demands/demand-operations-center.tsx`

**Interfaces:**
- Produces: `buildDemandOperationsExportRows(report)`, `exportDemandOperationsXlsx(report)` e `exportDemandOperationsPdf(report)`.

- [x] **Step 1: Write the failing tests**

Testar cabecalhos, formatacao de percentuais/horas/datas, limite de 5.000 linhas, nomes de arquivo e ausencia de valores `undefined`.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/demand-operations-export.test.ts`
Expected: FAIL porque o modulo ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Reutilizar `downloadWorkbookAsXlsx` e `downloadPdf`, montar resumo e fila com rotulos em portugues e buscar paginas adicionais ate o limite somente no clique de exportacao.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/demand-operations-export.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add client/src/lib/demand-operations-export.ts client/src/lib/demand-operations-export.test.ts client/src/components/demands/demand-operations-center.tsx
git commit -m "feat: export demand operations reports"
```

### Task 6: Integracao com Dashboard e Relatorios

**Files:**
- Create: `client/src/components/reports/demand-operations-report.tsx`
- Test: `client/src/components/reports/demand-operations-report.test.tsx`
- Modify: `client/src/pages/dashboard.tsx`
- Modify: `client/src/pages/reports.tsx`

**Interfaces:**
- Consumes: o contrato de `GET /api/demand-operations`.
- Produces: card de alerta no Dashboard e secao `Demandas` em Relatorios, ambos com link `/demands?view=operations`.

- [x] **Step 1: Write the failing tests**

Testar que o resumo apresenta demandas ativas, SLA atrasado e encaminhamentos atrasados; que a secao de Relatorios exibe taxas, medias e rankings; e que os links apontam para a Central.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/reports/demand-operations-report.test.tsx`
Expected: FAIL porque o componente ainda nao existe.

- [x] **Step 3: Write minimal implementation**

Adicionar consulta compartilhada com cache TanStack Query, manter os cards existentes e acrescentar uma area operacional discreta no Dashboard. Em Relatorios, criar seletor de area `Campanhas/Demandas` e renderizar indicadores/rankings sem duplicar a fila completa.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/reports/demand-operations-report.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add client/src/components/reports/demand-operations-report.tsx client/src/components/reports/demand-operations-report.test.tsx client/src/pages/dashboard.tsx client/src/pages/reports.tsx
git commit -m "feat: integrate demand operations insights"
```

### Task 7: Documentacao e validacao final local

**Files:**
- Modify: `docs/DEMANDAS.md`
- Create: `docs/DEMAND_OPERATIONS.md`

**Interfaces:**
- Documents: contrato da API, filtros, formulas, permissao, exportacao, estados vazios/erro e roteiro de homologacao.

- [x] **Step 1: Update documentation**

Registrar rota, exemplos de query/response sem dados pessoais, definicoes exatas dos indicadores, limite de exportacao e passos de validacao local.

- [x] **Step 2: Run focused and full automated validation**

Run: `npm test -- --run`, `npm run check`, `npm run build` e os scripts de seguranca existentes no `package.json`.
Expected: todos passam; skips preexistentes devem ser identificados no relatorio final.

- [x] **Step 3: Run local API smoke**

Autenticar em `127.0.0.1:5001`, consultar `/api/demand-operations` com filtros e confirmar 200, isolamento da conta, contagens coerentes e ausencia de respostas 5xx.

- [x] **Step 4: Run browser QA**

Validar desktop e mobile em `/demands?view=operations`, `/dashboard` e `/reports`: loading, vazio, filtros, paginacao, abertura da demanda, exportacoes, contraste, overflow e console sem erros.

- [x] **Step 5: Commit**

```bash
git add docs/DEMANDAS.md docs/DEMAND_OPERATIONS.md
git commit -m "docs: document demand operations center"
```

## Self-Review

- Spec coverage: dominio, filtros, fila unica, indicadores, rankings, navegacao, exportacoes e integracoes possuem tarefa e teste dedicados.
- Placeholder scan: o plano nao depende de TODO/TBD e define comandos, contratos e resultados esperados.
- Type consistency: `DemandOperationsReport` e o contrato HTTP sao produzidos no Task 1/3 e consumidos pelos Tasks 4-6 com os mesmos nomes.
- Scope: nenhuma migration, automacao de envio ou alteracao de producao foi incluida.

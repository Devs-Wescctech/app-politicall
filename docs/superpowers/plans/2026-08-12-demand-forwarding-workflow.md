# Demand Forwarding Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar um fluxo local de orgaos/setores e multiplos encaminhamentos por demanda, com prazos, historico, notificacoes e rascunho revisavel para o eleitor.

**Architecture:** O dominio fica em modulos pequenos e independentes das rotas. Uma migracao aditiva cria destinos, encaminhamentos e eventos idempotentes; servicos aplicam isolamento por conta e transacoes; componentes dedicados integram o fluxo ao painel de Demandas e as Configuracoes sem ampliar a responsabilidade dos arquivos de pagina.

**Tech Stack:** TypeScript, React, TanStack Query, React Hook Form, Zod, Express, Drizzle ORM, PostgreSQL, Vitest e Playwright.

## Global Constraints

- Nenhum push, imagem de container ou deploy.
- Banco exclusivamente local em `127.0.0.1:55432`.
- Envio externo nunca e automatico; o usuario revisa o rascunho.
- Todas as rotas exigem autenticacao, permissao `demands` e CSRF nas mutacoes.
- Consultas e mutacoes sao isoladas por `accountId`.
- Migracao aditiva e idempotente, preservando dados existentes.
- Implementacao orientada por testes, observando RED antes de GREEN.

---

### Task 1: Dominio e migracao

**Files:**
- Create: `server/services/demand-forwarding-domain.test.ts`
- Create: `server/services/demand-forwarding-domain.ts`
- Create: `migrations/0017_demand_forwarding_workflow.sql`
- Create: `server/services/demand-forwarding-migration.test.ts`
- Modify: `shared/schema.ts`
- Modify: `server/services/production-migrations.ts`
- Modify: `server/services/production-migrations.test.ts`
- Modify: `scripts/setup-dev-db.ts`

**Interfaces:**
- Produces: `calculateForwardingDueAt`, `validateForwardingTransition`, `classifyForwardingDeadline`, `buildCitizenUpdateDraft`, schemas e tipos `DemandDestination`, `DemandForwarding` e `DemandForwardingEvent`.

- [x] Escrever testes falhando para prazo padrao, transicoes validas/invalidas, estados finais, classificacao `due_soon`/`overdue` e texto do rascunho.
- [x] Executar `npm test -- --run server/services/demand-forwarding-domain.test.ts` e confirmar falha por modulo ausente.
- [x] Implementar as funcoes puras com estados fechados e alerta de quatro horas.
- [x] Executar o teste de dominio e confirmar aprovacao.
- [x] Escrever teste falhando que exige tres tabelas, unicidade de destino por conta/tipo/nome, indices e evento idempotente.
- [x] Criar `0017_demand_forwarding_workflow.sql`, registrar a migracao e espelhar as tabelas/relacoes no Drizzle.
- [x] Executar testes de migracao e producao; confirmar aprovacao.

### Task 2: Cadastro de orgaos e setores

**Files:**
- Create: `server/services/demand-destinations.test.ts`
- Create: `server/services/demand-destinations.ts`
- Modify: `server/routes/demand-routes.ts`
- Create: `server/routes/demand-destination-routes.test.ts`

**Interfaces:**
- Consumes: `demandDestinations`, `insertDemandDestinationSchema`.
- Produces: `listDemandDestinations(accountId, filters)`, `createDemandDestination(accountId, userId, input)` e `updateDemandDestination(accountId, id, input)`.

- [x] Escrever testes falhando para normalizacao, duplicidade sem diferenciar caixa, isolamento por conta, inativacao e rejeicao de prazo invalido.
- [x] Executar testes focados e confirmar falha pelo servico ausente.
- [x] Implementar servico transacional e converter conflito de unicidade em `DESTINATION_DUPLICATE`.
- [x] Adicionar schemas Zod e rotas `GET`, `POST` e `PATCH /api/demand-destinations`.
- [x] Testar autenticacao, permissao, validacao, `201`, `200`, `404` e `409`.

### Task 3: Servico e API de encaminhamentos

**Files:**
- Create: `server/services/demand-forwardings.test.ts`
- Create: `server/services/demand-forwardings.ts`
- Create: `server/routes/demand-forwarding-routes.test.ts`
- Modify: `server/routes/demand-routes.ts`

**Interfaces:**
- Produces: `listDemandForwardings`, `createDemandForwarding`, `updateDemandForwarding`, `createForwardingCitizenDraft`.
- Response listada inclui `destination`, `assigneeUser`, `deadlineState` e datas ISO.

- [x] Escrever testes falhando para demanda/destino/responsavel de outra conta, destino inativo, criacao de rascunho, encaminhamento imediato e multiplos destinos.
- [x] Implementar validacao de vinculos e criacao transacional com historico `forwarding_created` ou `forwarding_forwarded`.
- [x] Escrever testes falhando para transicoes, resposta, conclusao, cancelamento e transferencia.
- [x] Implementar atualizacao transacional, datas derivadas, notificacao do responsavel e historico com metadados.
- [x] Implementar rascunho deterministico sem persistir envio nem chamar provedores.
- [x] Adicionar rotas aninhadas na demanda e validar contratos, erros e isolamento por conta.

### Task 4: Alertas e integracao com agenda

**Files:**
- Create: `server/services/demand-forwarding-automation.test.ts`
- Create: `server/services/demand-forwarding-automation.ts`
- Modify: `server/routes.ts`
- Modify: `server/services/demands.ts`

**Interfaces:**
- Produces: `processDemandForwardingAlerts(now)` e `startDemandForwardingScheduler(intervalMs)`.
- Reutiliza `POST /api/demands/:id/follow-up` com `forwardingId` opcional validado e registrado no historico.

- [x] Escrever testes falhando para um alerta `due_soon`, um `overdue`, repeticao sem duplicidade e exclusao de estados finais/rascunho.
- [x] Implementar reserva idempotente, notificacao e historico na mesma transacao.
- [x] Iniciar scheduler sem sobreposicao, com intervalo padrao de cinco minutos e minimo de trinta segundos.
- [x] Estender follow-up para aceitar `forwardingId`, validar conta/demanda e incluir o identificador nos metadados do historico.
- [x] Executar testes de automacao e agenda.

### Task 5: Componentes e experiencia operacional

**Files:**
- Create: `client/src/components/demands/demand-forwardings.test.tsx`
- Create: `client/src/components/demands/demand-forwardings.tsx`
- Create: `client/src/components/demands/demand-forwarding-form.test.tsx`
- Create: `client/src/components/demands/demand-forwarding-form.tsx`
- Create: `client/src/components/settings/demand-destinations-settings.test.tsx`
- Create: `client/src/components/settings/demand-destinations-settings.tsx`
- Modify: `client/src/pages/demands.tsx`
- Modify: `client/src/pages/settings.tsx`

**Interfaces:**
- Consumes: APIs de destinos, encaminhamentos, usuarios, historico e follow-up.
- Produces: aba **Encaminhamentos**, dialogo de criacao/edicao, dialogo de rascunho e secao **Orgaos e setores** em Configuracoes.

- [x] Escrever testes de componente falhando para vazio, carregamento, multiplos itens, prazo vencido, estados e acoes acessiveis.
- [x] Implementar lista compacta com resumo de ativos, atrasados e concluidos.
- [x] Escrever testes falhando para formulario, destino inativo, campos condicionais e validacao de prazo.
- [x] Implementar criacao, atualizacao, resposta, conclusao, cancelamento, follow-up e rascunho copiavel.
- [x] Integrar a quinta aba no painel da demanda com grade responsiva e invalidacao de queries/historico/notificacoes.
- [x] Implementar cadastro pesquisavel de destinos em Configuracoes com estados vazio, erro e confirmacao de inativacao.
- [x] Executar testes de componentes e TypeScript.

### Task 6: Integracao local, documentacao e gate final

**Files:**
- Modify: `docs/DEMANDAS.md`
- Create: `docs/ENCAMINHAMENTOS_DEMANDAS.md`
- Modify: `.gitignore` somente se o QA gerar novo diretorio local.

**Interfaces:**
- Produces: contratos de API, operacao local, migracao, backup, rollback e evidencia de validacao.

- [x] Aplicar migracao com `node --env-file=.env.local --import tsx scripts/setup-dev-db.ts` apos bloquear qualquer host diferente de `127.0.0.1`/`localhost`.
- [x] Executar integracao de banco com dados temporarios: dois destinos, dois encaminhamentos, transicoes, resposta, rascunho, follow-up e alertas idempotentes; limpar tudo ao final.
- [x] Executar `npm test`, `npm run check`, `npm run build`, `npm run security:secrets` e `git diff --check`.
- [x] Executar QA no Chrome local: login, cadastro de destino, dois encaminhamentos, mudanca de estado, resposta, rascunho e follow-up em desktop e 375 px.
- [x] Confirmar zero erros inesperados de console, zero `5xx`, zero overflow e `200` em health/readiness.
- [x] Atualizar documentacao e registrar apenas commits locais.

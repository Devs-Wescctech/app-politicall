# Ecossistema de Demandas - Especificacao de Design

## Objetivo

Transformar Demandas de um quadro isolado em um fluxo operacional conectado a eleitores, atendimentos, agenda, usuarios, dashboard e relatorios, preservando os registros existentes e o isolamento por conta.

## Escopo da primeira entrega

- protocolo sequencial legivel por conta e ano (`DEM-AAAA-NNNNNN`);
- tipo `external` ou `internal`;
- vinculo obrigatorio com eleitor em demandas externas;
- origem rastreavel (`manual`, `attendance`, `whatsapp`, `phone`, `email`, `petition`, `in_person`);
- categorias configuraveis por conta com SLA em horas;
- responsavel como usuario real da conta;
- etapas operacionais: `open`, `triage`, `in_progress`, `waiting_requester`, `waiting_third_party`, `completed`, `cancelled`;
- prazo de SLA, conclusao e indicador de atraso;
- comentarios internos e historico imutavel das alteracoes principais;
- criacao opcional de compromisso na agenda vinculado a demanda;
- indicadores de SLA no dashboard e relatorio operacional dentro do modulo;
- acao no atendimento para abrir uma demanda com contato e origem preenchidos quando houver contexto suficiente.

Ficam fora desta entrega: upload de anexos, mensagens automaticas ao solicitante, classificacao por IA e vinculacao automatica com assinaturas de peticoes. O modelo de origem permite incluir essas integracoes posteriormente sem alterar o contrato central.

## Regras funcionais

1. Demanda externa exige `contactId`; demanda interna pode omitir eleitor, mas exige categoria e responsavel.
2. Categoria, eleitor, responsavel, atendimento e evento vinculados devem pertencer ao mesmo `accountId`.
3. O protocolo e gerado no servidor em transacao e nunca e aceito do cliente.
4. O SLA e calculado da categoria no momento da criacao. Alterar a categoria recalcula o prazo apenas enquanto a demanda nao estiver concluida ou cancelada.
5. Concluir registra `completedAt`; reabrir limpa `completedAt`.
6. Toda criacao, mudanca de status, prioridade, categoria, responsavel, prazo ou vinculo cria evento de historico.
7. Exclusao continua permitida somente pela permissao existente de Demandas e registra o comportamento nos logs do servidor; o historico e removido por cascata junto com a demanda.
8. Dados legados sao migrados sem perda: `pending -> open`, `in_progress -> in_progress`, `completed -> completed`, `cancelled -> cancelled`.

## Modelo de dados

### `demand_categories`

`id`, `account_id`, `name`, `sla_hours`, `color`, `active`, `created_at`, com nome unico por conta. A migracao cria categorias padrao Atendimento (24h), Infraestrutura (72h), Saude (48h), Educacao (48h) e Interna (72h).

### Extensao de `demands`

Adicionar `protocol`, `kind`, `contact_id`, `origin`, `category_id`, `assignee_user_id`, `source_type`, `source_id`, `sla_due_at` e `completed_at`. Campos novos iniciam compativeis com registros legados; a migracao preenche protocolo, tipo interno, origem manual, categoria Interna e responsavel criador.

### `demand_history`

Registro append-only: `id`, `account_id`, `demand_id`, `user_id`, `event_type`, `from_value`, `to_value`, `metadata`, `created_at`.

### Extensao de `events`

Adicionar `demand_id` e `contact_id`, ambos opcionais e protegidos por validacao de conta no service.

## Arquitetura

- `server/services/demands.ts`: regras, validacao transversal, protocolo, SLA e historico.
- `server/routes/demand-routes.ts`: contratos HTTP e traducao de erros.
- `server/storage.ts`: persistencia simples e consultas com joins; regras permanecem no service.
- `shared/schema.ts`: tabelas, enums de dominio e schemas Zod compartilhados.
- `client/src/pages/demands.tsx`: quadro, filtros, formulario e painel de detalhe.
- `client/src/components/demands/`: componentes focados de formulario, metricas e historico.

## Contratos HTTP

Todos exigem sessao, `requirePermission("demands")` e escopo da conta autenticada.

- `GET /api/demands`: lista enriquecida; filtros opcionais `status`, `priority`, `categoryId`, `assigneeUserId`, `contactId`, `sla=overdue|due_soon|on_track`.
- `POST /api/demands`: cria demanda. Retorna `201` com demanda enriquecida; `400` para regra funcional; `404` para vinculo inexistente na conta.
- `PATCH /api/demands/:id`: altera campos permitidos e registra historico. Retorna `404` quando nao pertence a conta.
- `DELETE /api/demands/:id`: remove e retorna `204`.
- `GET /api/demands/:id/comments`: comentarios existentes.
- `POST /api/demands/:id/comments`: comentario interno, retorna `201`.
- `GET /api/demands/:id/history`: historico cronologico.
- `GET /api/demand-categories`: categorias ativas da conta.
- `POST /api/demand-categories`: cria categoria; nome e SLA obrigatorios.
- `PATCH /api/demand-categories/:id`: edita ou inativa categoria.
- `GET /api/demands/summary`: totais por status, prioridade, SLA e tempos medios.
- `POST /api/demands/:id/follow-up`: cria evento de agenda vinculado e retorna `201`.

Erros usam `{ "error": "mensagem", "code": "CODIGO_ESTAVEL" }`.

## UX

A tela mantem o quadro como visual principal e adiciona uma faixa compacta de indicadores. A barra de filtros permite busca por protocolo/titulo/eleitor, status, categoria, responsavel e SLA. O formulario mostra campos conforme o tipo; ao selecionar externa, o eleitor torna-se obrigatorio. O painel lateral exibe protocolo, SLA, eleitor, origem, responsavel, comentarios, historico e acao de agenda. Estados de carregamento, vazio, erro e permissao sao explicitos.

## Seguranca e integridade

- nenhuma rota aceita `accountId`, `userId` ou `protocol` do corpo;
- todos os IDs relacionados sao validados na conta autenticada;
- Zod restringe enums, tamanhos e datas;
- consultas e indices cobrem `account_id`, `status`, `contact_id`, `assignee_user_id`, `category_id` e `sla_due_at`;
- historico armazena apenas valores operacionais, sem segredos;
- a migracao e aditiva, idempotente e possui script de rollback documentado, sem executa-lo automaticamente.

## Migracao e rollback

A migracao SQL cria tabelas/colunas e faz backfill em transacao. O app continua lendo registros antigos durante a implantacao local. O rollback remove apenas estruturas novas depois de exportar `demand_history`; nao converte status para tras automaticamente sem backup.

## Validacao

- testes unitarios de protocolo, regras externa/interna, SLA, status e resumo;
- testes de integracao das rotas cobrindo autenticacao, isolamento entre contas e vinculos invalidos;
- testes de componente para campos condicionais e estados de SLA;
- fluxo E2E local: criar eleitor, criar demanda externa, mover etapas, comentar, criar follow-up, validar dashboard e historico;
- `npm run check`, `npm test`, `npm run build` e verificacao visual desktop/mobile.

## Execucao local

Nenhum push, publicacao no GHCR ou acesso ao servidor de producao faz parte desta entrega. A validacao usa apenas banco e servidor locais do worktree.

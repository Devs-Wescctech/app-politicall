# Demandas

## Visao geral

O modulo acompanha solicitacoes externas e atividades internas do gabinete. Cada demanda recebe protocolo anual, categoria, SLA, responsavel e historico. Demandas externas exigem eleitor vinculado; demandas internas exigem categoria e responsavel.

## Estados

- `open`: aberta;
- `triage`: em triagem;
- `in_progress`: em andamento;
- `waiting_requester`: aguardando solicitante;
- `waiting_third_party`: aguardando terceiro;
- `completed`: concluida;
- `cancelled`: cancelada.

## APIs

Todas as rotas exigem sessao de usuario, token CSRF em metodos de escrita e permissao `demands`.

### `GET /api/demands`

Lista demandas da conta autenticada com `category`, `contact` e `assigneeUser`. Retorna `200`.

### `POST /api/demands`

Cria demanda e retorna `201`. O servidor ignora qualquer tentativa de definir conta, criador ou protocolo.

```json
{
  "title": "Iluminacao da Rua das Acacias",
  "description": "Poste apagado proximo a escola",
  "kind": "external",
  "origin": "attendance",
  "status": "open",
  "priority": "high",
  "contactId": "contact-id",
  "categoryId": "category-id",
  "assigneeUserId": "user-id"
}
```

Erros: `400 VALIDATION_ERROR`, `404 CONTACT_NOT_FOUND`, `404 CATEGORY_NOT_FOUND`, `404 ASSIGNEE_NOT_FOUND`.

### `PATCH /api/demands/:id`

Atualiza campos permitidos, recalcula SLA quando a categoria muda e registra historico. Retorna `200` ou `404 DEMAND_NOT_FOUND`.

### `DELETE /api/demands/:id`

Remove uma demanda da conta e retorna `204`.

### `GET|POST /api/demands/:id/comments`

Lista ou cria comentarios internos. A criacao retorna `201`.

### `GET /api/demands/:id/history`

Retorna eventos em ordem cronologica. O historico registra criacao, alteracoes auditadas e follow-ups.

### `POST /api/demands/:id/follow-up`

Cria compromisso de agenda vinculado e retorna `201`. `forwardingId` e opcional; quando informado, deve identificar um encaminhamento da mesma conta e demanda e fica registrado nos metadados do historico.

```json
{
  "forwardingId": "forwarding-id",
  "title": "Retorno ao solicitante",
  "startDate": "2026-08-12T12:00:00.000Z",
  "endDate": "2026-08-12T12:30:00.000Z",
  "reminderMinutes": 60
}
```

Erros: `400 INVALID_EVENT_PERIOD`, `404 DEMAND_NOT_FOUND`, `404 FORWARDING_NOT_FOUND`.

### `GET /api/demands/summary`

Retorna `total`, `active`, `overdue`, `completed`, `urgent` e `averageResolutionHours`.

### Categorias e seletores

- `GET|POST /api/demand-categories`;
- `PATCH /api/demand-categories/:id`;
- `GET /api/demand-assignees` retorna somente identificador, nome e papel;
- `GET /api/demand-contacts` retorna somente dados necessarios para selecao.

## Migracao

`migrations/0011_demand_ecosystem.sql` e aditiva e idempotente. Ela cria categorias padrao por conta, converte status e prioridades legados, gera protocolos para registros existentes, preenche responsavel/categoria/SLA e adiciona os vinculos de agenda.

## Anexos e automacao do SLA

`migrations/0016_demand_lifecycle_automation.sql` adiciona metadados de anexos privados e o diario idempotente de alertas. A aba **Anexos** aceita PDF, JPEG, PNG e WebP de ate 10 MB. Os arquivos sao acessados exclusivamente pelas rotas autenticadas da demanda; `/uploads/demands` e bloqueado na rota estatica.

O responsavel recebe notificacoes internas quando outra pessoa altera o status ou atribui a demanda a ele. O verificador de SLA cria no maximo um alerta de vencimento proximo, nas quatro horas anteriores, e um alerta de SLA vencido. Demandas concluidas ou canceladas sao ignoradas. O intervalo padrao e cinco minutos e pode ser ajustado por `DEMAND_SLA_CHECK_INTERVAL_MS`, respeitando o minimo de 30 segundos.

- `GET /api/demands/:id/attachments`: lista metadados.
- `POST /api/demands/:id/attachments`: upload multipart no campo `file`.
- `GET /api/demands/:id/attachments/:attachmentId/download`: download autenticado.
- `DELETE /api/demands/:id/attachments/:attachmentId`: exclusao auditada.

Todas exigem sessao autenticada, token CSRF nas mutacoes e permissao `demands`. O upload retorna `201` com os metadados; a lista e o download retornam `200`; a exclusao retorna `204`. Entradas invalidas retornam `400 ATTACHMENT_INVALID`, demanda inexistente retorna `404 DEMAND_NOT_FOUND` e anexo inexistente ou pertencente a outra conta retorna `404 ATTACHMENT_NOT_FOUND`.

## Encaminhamentos

Cada demanda pode ter varios encaminhamentos simultaneos para orgaos externos ou setores internos. O cadastro reutilizavel dos destinos fica em **Configuracoes > Orgaos e setores**; a operacao fica na aba **Encaminhamentos** da demanda. Prazos, responsavel, resposta, protocolo externo, agenda, alertas e historico permanecem vinculados ao encaminhamento de origem.

O fluxo completo e os contratos das rotas estao em [ENCAMINHAMENTOS_DEMANDAS.md](ENCAMINHAMENTOS_DEMANDAS.md).

## Central operacional

A visao **Demandas > Central** consolida a fila unica de pendencias, filtros, rankings, indicadores e exportacoes Excel/PDF. O Dashboard apresenta os alertas principais e **Relatorios > Demandas** reutiliza as mesmas formulas e o mesmo isolamento por conta.

O contrato completo, as formulas e o roteiro de homologacao estao em [DEMAND_OPERATIONS.md](DEMAND_OPERATIONS.md).

Exemplo de metadado retornado:

```json
{
  "id": "uuid",
  "originalName": "foto-da-rua.png",
  "mimeType": "image/png",
  "sizeBytes": 2048,
  "createdAt": "2026-08-12T12:00:00.000Z"
}
```

Antes de aplicar a migracao fora do ambiente local, fazer backup do banco e do volume `uploads`. O rollback preserva os arquivos ate que os metadados sejam exportados; depois, remove `demand_automation_events`, `demand_attachments` e a pasta `uploads/demands` em uma janela controlada.

Antes de aplicar fora do ambiente local, fazer backup do banco. O rollback exige exportar `demand_history`, remover os indices e colunas novas e converter os status para o contrato anterior. Ele nao e automatico para evitar perda silenciosa do historico.

## Ambiente local desta entrega

- Aplicacao: `http://127.0.0.1:5001`
- PostgreSQL isolado: porta `55432`, pasta externa ao repositorio em `Documents/Politicall-local-db/demand-ecosystem`
- Credenciais de demonstracao: as definidas pelo script `scripts/setup-dev-db.ts`
- `.env.local` e ignorado pelo Git.

Nenhum push, imagem de container ou deploy e executado pela entrega local.

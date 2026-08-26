# Eleitores duplicados

## Objetivo

O modulo identifica possiveis cadastros duplicados dentro da mesma conta e oferece uma mesclagem manual, auditavel e reversivel. Nenhum contato e mesclado automaticamente e nenhum atendimento, mensagem ou cadastro e excluido.

## Regras de deteccao

- Alta confianca: mesmo e-mail normalizado ou mesmo telefone brasileiro normalizado.
- Revisao humana: mesmo nome normalizado e mesma cidade ou estado.
- Nome isolado nao e considerado duplicidade.
- Contatos arquivados por uma mesclagem anterior nao voltam para a fila.
- A deteccao e sempre limitada por `account_id`.

## Fluxo operacional

1. Abra **Eleitores** e selecione o icone **Revisar eleitores duplicados**.
2. Em um grupo pendente, selecione **Revisar grupo**.
3. Escolha o cadastro principal. Ele permanecera ativo.
4. Gere a comparacao e resolva os campos conflitantes.
5. Confira as quantidades de registros que serao transferidos.
6. Confirme a mesclagem. Os contatos de origem sao arquivados, nao apagados.
7. Quando necessario, use **Desfazer** no historico.

Interesses sao combinados por padrao. Demandas, agenda, atendimentos, mensagens, destinatarios de campanhas, assinaturas de peticoes, listas e etiquetas preservam seus IDs originais.

## Atendimento e WhatsApp

Conversas nao sao deduplicadas. Quando a mesma pessoa chama dois numeros conectados, permanecem dois atendimentos independentes. Cada conversa grava um snapshot com:

- `inbound_connection_name`: nome da conexao receptora;
- `inbound_number`: numero receptor;
- exibicao: `WhatsApp recebido em {conexao} - {numero}`.

O snapshot e definido na entrada da conversa e nao e sobrescrito por alteracoes posteriores na conexao.

## Contratos de API

Todas as rotas exigem sessao de usuario e permissao `contacts`. Requisicoes de escrita autenticadas por cookie tambem exigem o token CSRF do fluxo normal da aplicacao.

### Listar duplicidades

`GET /api/contacts/duplicates`

- Resposta `200`: `{ "groups": [...] }`.
- Cada grupo contem confianca, evidencias e contatos candidatos.

### Gerar previa

`POST /api/contacts/merge-preview`

```json
{
  "sourceContactIds": ["contact-b"],
  "targetContactId": "contact-a"
}
```

- Resposta `200`: token SHA-256, principal, origens, conflitos e contagens.
- O token representa os IDs, `updated_at` e estado de arquivamento dos contatos.
- Nenhuma escrita ocorre nesta etapa.

### Confirmar mesclagem

`POST /api/contacts/merge`

```json
{
  "sourceContactIds": ["contact-b"],
  "targetContactId": "contact-a",
  "previewToken": "token-de-64-caracteres-hexadecimais",
  "resolvedContact": { "name": "Maria Silva", "interests": ["Saude"] }
}
```

- Resposta `200`: `{ "events": [...] }`.
- Executa uma unica transacao com bloqueio dos contatos.
- Uma previa desatualizada retorna `409 CONTACT_MERGE_STALE`.

### Historico

`GET /api/contacts/merges`

- Resposta `200`: ate 100 eventos mais recentes da conta.

### Desfazer

`POST /api/contacts/merges/:id/revert`

- Resposta `200`: `{ "event": ... }`.
- Restaura somente os IDs transferidos pelo evento. Registros criados depois da mesclagem permanecem no principal.

### Erros

- `400 CONTACT_MERGE_INVALID`: selecao ou payload invalido.
- `404 CONTACT_MERGE_NOT_FOUND`: evento ausente ou fora da conta.
- `409 CONTACT_MERGE_STALE`: dados mudaram depois da previa.
- `409 CONTACT_MERGE_CONFLICT`: contato ja arquivado ou alterado durante a operacao.
- `409 CONTACT_MERGE_REVERT_FORBIDDEN`: evento ja desfeito ou seguido por estado incompativel.
- `500 CONTACT_MERGE_FAILED`: falha operacional inesperada.

## Banco e migracao

A migracao `0015_contact_deduplication.sql` e aditiva:

- adiciona estado de arquivamento e `updated_at` a `contacts`;
- cria `contact_merge_events` com snapshots, IDs movidos, resolucao, usuario, IP e user agent;
- adiciona o snapshot da conexao a `att_conversations`;
- faz backfill somente quando a conexao relacionada oferece nome ou numero.

Aplicacao local:

```bash
node --env-file=.env.local --import tsx scripts/setup-dev-db.ts
```

O banco configurado deve estar acessivel antes do comando.

## Rollback

O rollback funcional preferido e o comando **Desfazer**, pois ele usa o diario exato da operacao. Para rollback de aplicacao, retorne ao artefato anterior mantendo as colunas e a tabela: elas sao aditivas e nao interferem nos fluxos antigos.

Remover o schema exige primeiro desfazer ou auditar todas as mesclagens. Nao remova `contact_merge_events` enquanto existirem contatos com `merged_into_contact_id`, pois isso eliminaria a capacidade de reversao e a trilha de auditoria.

## Seguranca e limites

- Toda consulta e escrita usa `account_id`.
- Uma operacao aceita no maximo dez contatos de origem.
- Campos internos, conta e estado de arquivamento nao podem ser enviados em `resolvedContact`.
- A mesclagem usa transacao e rollback integral em caso de falha.
- Um cadastro principal de uma mesclagem ativa nao pode ser usado como origem de outra. A operacao anterior deve ser desfeita primeiro para manter todas as reversoes completas.
- CPF nao participa da deteccao neste ciclo.

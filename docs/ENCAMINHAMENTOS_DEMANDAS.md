# Encaminhamentos de demandas

## Objetivo

Permitir que uma demanda seja enviada a varios orgaos externos ou setores internos, em paralelo ou em momentos diferentes, sem perder responsavel, prazo, resposta, agenda, notificacoes e trilha de auditoria.

## Jornada

1. Cadastre destinos reutilizaveis em **Configuracoes > Orgaos e setores**.
2. Abra uma demanda e selecione **Encaminhamentos**.
3. Registre o destino, responsavel interno, situacao e observacoes.
4. Acompanhe `draft`, `forwarded`, `waiting`, `answered`, `completed` ou `cancelled`.
5. Registre a resposta, agende uma cobranca ou gere o rascunho de atualizacao ao eleitor.
6. Revise o rascunho antes do envio externo. O sistema nao envia essa mensagem automaticamente.

## Destinos

Campos: tipo (`internal` ou `external`), nome, descricao, contato responsavel, telefone, email, prazo padrao em horas e estado ativo. A combinacao conta, tipo e nome normalizado e unica.

- `GET /api/demand-destinations?kind=external&active=true`: lista destinos da conta.
- `POST /api/demand-destinations`: cria e retorna `201`.
- `PATCH /api/demand-destinations/:id`: atualiza e retorna `200`.

Erros: `400 VALIDATION_ERROR`, `404 DESTINATION_NOT_FOUND`, `409 DESTINATION_DUPLICATE`.

## Encaminhamentos

- `GET /api/demands/:id/forwardings`: lista com destino, responsavel e `deadlineState`.
- `POST /api/demands/:id/forwardings`: cria e retorna `201`.
- `PATCH /api/demands/:id/forwardings/:forwardingId`: altera dados ou estado.
- `POST /api/demands/:id/forwardings/:forwardingId/message-draft`: retorna texto para revisao e copia manual.

Exemplo de criacao:

```json
{
  "destinationId": "destination-id",
  "assigneeUserId": "user-id",
  "status": "forwarded",
  "priority": "medium",
  "externalProtocol": "OF-2026-104",
  "notes": "Solicitada vistoria no local"
}
```

Ao alterar para `answered`, `response` e obrigatorio. Transicoes terminais nao podem ser reabertas. Referencias de outra conta ou demanda retornam `404`, sem revelar o recurso externo.

Erros principais: `404 DEMAND_NOT_FOUND`, `404 DESTINATION_NOT_FOUND`, `404 ASSIGNEE_NOT_FOUND`, `404 FORWARDING_NOT_FOUND`, `400 DESTINATION_INACTIVE`, `400 FORWARDING_INVALID_TRANSITION`, `400 FORWARDING_RESPONSE_REQUIRED`, `400 FORWARDING_INVALID_DUE_AT`.

## Agenda e alertas

`POST /api/demands/:id/follow-up` aceita `forwardingId` opcional. O servidor valida conta e demanda e registra o identificador em `demand_history.metadata`.

O verificador interno cria alertas `due_soon` nas quatro horas anteriores ao prazo e `overdue` apos o vencimento. A restricao unica em `demand_forwarding_events` garante no maximo um alerta de cada tipo por encaminhamento. O intervalo padrao e cinco minutos; `DEMAND_FORWARDING_CHECK_INTERVAL_MS` pode altera-lo, com minimo de 30 segundos.

## Banco e implantacao

`migrations/0017_demand_forwarding_workflow.sql` cria `demand_destinations`, `demand_forwardings` e `demand_forwarding_events`, com chaves estrangeiras, indices de conta e prazo e restricoes de idempotencia. A migracao e aditiva e nao altera demandas existentes.

Antes de aplicar fora do ambiente local:

1. Fazer backup do PostgreSQL.
2. Confirmar que a imagem possui a migracao `0017` registrada.
3. Aplicar em homologacao e validar duas destinacoes, transicoes, follow-up e alertas.
4. Monitorar erros da aplicacao e tempo das consultas por prazo.

Rollback: interromper o agendador, exportar encaminhamentos e historico, remover primeiro `demand_forwarding_events`, depois `demand_forwardings` e por ultimo `demand_destinations`. Nao executar rollback automatico quando houver dados operacionais a preservar.

## Validacao local

- Testes unitarios e de contrato cobrem estados, prazos, rascunho, rotas, schema e migracao.
- Integracao local confirma alerta idempotente, follow-up vinculado e rejeicao entre demandas.
- QA no Chrome cobre dois destinos e encaminhamentos, resposta, conclusao, agenda e rascunho em desktop e 375 px.
- Esta entrega nao publica codigo, imagem ou migracao em producao.

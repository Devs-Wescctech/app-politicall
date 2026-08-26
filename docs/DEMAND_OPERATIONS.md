# Central Operacional de Demandas

## Objetivo

A Central transforma demandas, SLA, historico e encaminhamentos em uma fila operacional unica. Ela nao cria automacoes de envio nem altera dados: orienta a priorizacao e abre o painel existente da demanda para a execucao.

## Acesso

- Interface: `/demands?view=operations`.
- Resumo: card de demandas no `/dashboard`.
- Analise: area **Demandas** em `/reports`.
- Permissao obrigatoria: `demands`.
- Todos os dados sao limitados ao `accountId` da sessao autenticada.

## Contrato da API

### `GET /api/demand-operations`

Filtros opcionais:

| Parametro | Formato | Regra |
| --- | --- | --- |
| `from` | data ISO ou `YYYY-MM-DD` | inicio inclusivo; padrao: 30 dias antes |
| `to` | data ISO ou `YYYY-MM-DD` | fim inclusivo; padrao: fim do dia atual |
| `categoryId` | UUID | categoria da demanda |
| `destinationId` | UUID | destino de qualquer encaminhamento |
| `assigneeUserId` | UUID | responsavel da demanda ou encaminhamento |
| `demandStatus` | texto | status exato da demanda |
| `forwardingStatus` | texto | status exato de qualquer encaminhamento |
| `deadlineState` | enum | `forwarding_overdue`, `demand_overdue`, `due_soon`, `stale`, `active` |
| `search` | texto | protocolo, titulo, eleitor, categoria, responsavel ou destino |
| `page` | inteiro >= 1 | padrao 1 |
| `pageSize` | inteiro 10 a 100 | padrao 25 |

Exemplo:

```http
GET /api/demand-operations?from=2026-08-01&to=2026-08-12&deadlineState=demand_overdue&page=1&pageSize=25
```

Resposta `200`:

```json
{
  "generatedAt": "2026-08-12T12:00:00.000Z",
  "filters": { "from": "2026-08-01T00:00:00.000Z", "to": "2026-08-12T23:59:59.999Z", "page": 1, "pageSize": 25 },
  "summary": {
    "totalCreated": 20,
    "active": 8,
    "completed": 12,
    "overdue": 2,
    "forwardingOverdue": 1,
    "dueSoon": 1,
    "stale": 2,
    "completionRate": 0.6,
    "overdueRate": 0.25,
    "responseRate": 0.8,
    "averageFirstMovementHours": 1.5,
    "averageResponseHours": 12,
    "averageResolutionHours": 36
  },
  "breakdowns": { "categories": [], "destinations": [], "assignees": [] },
  "items": [],
  "pagination": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 0 }
}
```

Erros:

- `400 VALIDATION_ERROR`: periodo, pagina, tamanho ou estado de prazo invalido.
- `401`: sessao ausente ou expirada.
- `403`: usuario sem permissao `demands`.
- `500 DEMAND_OPERATIONS_INTERNAL_ERROR`: falha interna sem exposicao de detalhes do banco.

## Definicoes

- Demanda ativa: `open`, `triage`, `in_progress`, `waiting_requester` ou `waiting_third_party`.
- Encaminhamento ativo: `forwarded` ou `waiting`.
- SLA vencido: demanda ativa com `slaDueAt` anterior ao instante da consulta.
- Encaminhamento vencido: demanda ativa com ao menos um encaminhamento ativo cujo `dueAt` venceu.
- Vence em breve: demanda ativa cujo SLA vence entre agora e as proximas 4 horas.
- Sem atualizacao: demanda ativa com `updatedAt` anterior a 7 dias.
- Taxa de conclusao: demandas concluidas divididas pelas demandas criadas no periodo.
- Taxa de atraso: demandas ativas com SLA vencido divididas pelas demandas ativas.
- Taxa de resposta: encaminhamentos enviados com `answeredAt` divididos pelos encaminhamentos enviados.
- Primeiro movimento: criacao da demanda ate o primeiro evento de historico diferente de `created`.
- Tempo de resposta: `sentAt` ate `answeredAt` do encaminhamento.
- Tempo de resolucao: `createdAt` ate `completedAt` da demanda.

Uma demanda aparece apenas uma vez na fila. A prioridade do motivo e: encaminhamento vencido, SLA vencido, vencimento em ate 4 horas, sem atualizacao e acompanhamento normal. Os indicadores sao independentes dessa prioridade; por isso uma demanda pode contar simultaneamente em SLA vencido e encaminhamento vencido sem ser duplicada na fila.

## Exportacoes

Excel e PDF sao gerados no navegador somente quando solicitados. A Central percorre as paginas do mesmo endpoint, preserva os filtros e limita o arquivo a 5.000 demandas. Os motores ExcelJS e pdfmake continuam com carregamento tardio.

## Homologacao local

1. Abrir `http://127.0.0.1:5001/demands?view=operations`.
2. Validar periodo, pesquisa, categoria, destino, responsavel e estado do prazo.
3. Confirmar que uma demanda com dois problemas aparece uma unica vez, com o motivo mais prioritario.
4. Abrir uma linha e conferir o mesmo drawer de detalhes, historico e encaminhamentos.
5. Gerar Excel e PDF e conferir resumo, cabecalhos e quantidade.
6. Abrir Dashboard e Relatorios > Demandas e comparar os totais.
7. Repetir em viewport mobile e confirmar ausencia de overflow horizontal da pagina.

Esta entrega nao inclui migration, notificacao automatica nova, publicacao de imagem ou deploy.

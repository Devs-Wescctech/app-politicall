# Central operacional e indicadores de demandas

## Objetivo

Transformar os dados de demandas e encaminhamentos em uma fila diaria de trabalho e em indicadores gerenciais confiaveis. O usuario deve identificar rapidamente o que exige acao, filtrar a operacao, abrir a demanda correta e exportar o mesmo conjunto de dados visto na tela.

## Escopo

- Central operacional integrada ao modulo **Demandas**.
- Fila paginada de demandas e encaminhamentos que exigem acompanhamento.
- Indicadores de demandas ativas, SLA vencido, encaminhamentos vencidos, proximos do prazo, sem movimentacao e concluidos.
- Filtros por periodo, categoria, destino, responsavel, estado e situacao de prazo.
- Tempos medios de primeira movimentacao, resposta do encaminhamento e resolucao da demanda.
- Taxas de conclusao, atraso e resposta.
- Agrupamentos por categoria, destino e responsavel.
- Ranking operacional de orgaos e setores.
- Atalhos da fila e dos indicadores para a demanda correspondente.
- Resumo compacto no Dashboard.
- Secao de Demandas na pagina Relatorios.
- Exportacao do resultado filtrado em Excel e PDF.

Ficam fora desta entrega: previsao por IA, metas financeiras, comparacao entre contas, envio automatico de cobrancas, data warehouse, dashboards customizaveis e agendamento de relatorios por e-mail.

## Abordagem escolhida

A solucao usa uma unica camada de consulta e agregacao no backend. A Central, o Dashboard, Relatorios e as exportacoes consomem o mesmo contrato, evitando divergencia de numeros. A interface operacional fica dentro de Demandas para preservar o fluxo diario; Dashboard e Relatorios mostram recortes do mesmo dominio.

Nao sera criada nova tabela. Demandas, categorias, usuarios, destinos, encaminhamentos e historico existentes fornecem os dados necessarios. Consultas permanecem isoladas por `accountId` e usam paginacao para a fila.

## Definicoes das metricas

Todas as metricas respeitam o periodo selecionado. O periodo padrao sao os ultimos 30 dias, incluindo o inicio e excluindo o instante posterior ao fim.

- **Demandas ativas:** estados `open`, `triage`, `in_progress`, `waiting_requester` e `waiting_third_party`.
- **SLA vencido:** demanda ativa com `slaDueAt` anterior ao instante atual.
- **Encaminhamento ativo:** estado `forwarded` ou `waiting`.
- **Encaminhamento vencido:** encaminhamento ativo com `dueAt` anterior ao instante atual.
- **Proximo do prazo:** encaminhamento ativo cujo prazo esta entre agora e quatro horas futuras.
- **Sem movimentacao:** demanda ativa cujo `updatedAt` e anterior ao limite configurado. O limite inicial e sete dias e e fixo nesta entrega.
- **Taxa de conclusao:** demandas concluidas divididas por demandas criadas no periodo. Sem denominador, retorna zero.
- **Taxa de atraso:** demandas ativas com SLA vencido divididas por demandas ativas. Sem denominador, retorna zero.
- **Taxa de resposta:** encaminhamentos respondidos ou concluidos com `answeredAt` dividido pelos encaminhamentos enviados no periodo. Sem denominador, retorna zero.
- **Tempo de primeira movimentacao:** media entre `demands.createdAt` e o primeiro evento posterior a `created` em `demand_history`.
- **Tempo de resposta:** media entre `demand_forwardings.sentAt` e `answeredAt`.
- **Tempo de resolucao:** media entre `demands.createdAt` e `completedAt`.

Medias ignoram registros sem as duas datas necessarias e sao retornadas em horas com uma casa decimal. O backend usa o mesmo instante de referencia em toda a resposta para evitar classificacoes inconsistentes.

## Fila operacional

Cada item representa uma demanda com contexto suficiente para acao:

- demanda, protocolo, titulo, prioridade, estado e categoria;
- eleitor, quando existente;
- responsavel pela demanda;
- SLA e situacao da demanda;
- quantidade de encaminhamentos ativos e vencidos;
- proximo prazo de encaminhamento;
- ultima movimentacao;
- motivo da pendencia: `demand_overdue`, `forwarding_overdue`, `due_soon`, `stale` ou `active`.

Uma demanda aparece uma unica vez, mesmo com varios encaminhamentos. A prioridade da pendencia segue a ordem: encaminhamento vencido, SLA vencido, proximo do prazo, sem movimentacao e ativa. A ordenacao padrao coloca itens mais criticos primeiro e, dentro do mesmo grupo, o prazo mais antigo.

## Filtros e paginacao

Filtros aceitos:

- `from` e `to` em ISO 8601;
- `categoryId`;
- `destinationId`;
- `assigneeUserId`;
- `demandStatus`;
- `forwardingStatus`;
- `deadlineState`: `all`, `demand_overdue`, `forwarding_overdue`, `due_soon`, `stale` ou `active`;
- `search` por protocolo, titulo ou nome do eleitor;
- `page`, iniciando em 1;
- `pageSize`, entre 10 e 100, padrao 25.

Filtros por destino e estado de encaminhamento consideram demandas que possuam ao menos um encaminhamento correspondente, sem duplicar a demanda. Datas invalidas, intervalo invertido e identificadores invalidos retornam `400 VALIDATION_ERROR`.

## API

Todas as rotas exigem sessao autenticada e permissao `demands`. Como sao consultas, nao exigem CSRF.

### `GET /api/demand-operations`

Retorna:

```json
{
  "generatedAt": "2026-08-12T16:00:00.000Z",
  "filters": { "from": "2026-07-14T00:00:00.000Z", "to": "2026-08-13T00:00:00.000Z" },
  "summary": {
    "activeDemands": 0,
    "overdueDemands": 0,
    "overdueForwardings": 0,
    "dueSoonForwardings": 0,
    "staleDemands": 0,
    "completedDemands": 0,
    "completionRate": 0,
    "overdueRate": 0,
    "responseRate": 0,
    "averageFirstMovementHours": null,
    "averageResponseHours": null,
    "averageResolutionHours": null
  },
  "breakdowns": {
    "categories": [],
    "destinations": [],
    "assignees": []
  },
  "items": [],
  "pagination": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 0 }
}
```

Os agrupamentos retornam identificador, nome, total, concluidos, vencidos, taxa de resposta e tempo medio de resposta quando aplicavel. O ranking de destinos ordena primeiro os que possuem maior quantidade vencida e depois maior tempo medio de resposta.

### Exportacoes

Nao havera endpoint de arquivo nesta primeira versao. A interface solicita `pageSize=100` em paginas sucessivas, preserva os filtros e gera o Excel/PDF localmente com as bibliotecas ja instaladas. O limite total de exportacao e 5.000 itens; acima disso, a interface solicita que o usuario refine os filtros.

## Backend

- `server/services/demand-operations-domain.ts`: funcoes puras de classificacao, percentuais, medias, ordenacao e normalizacao de periodo.
- `server/services/demand-operations.ts`: consultas por conta, agregacao e paginacao.
- `server/routes/demand-operation-routes.ts`: schema de filtros, autenticacao, permissao e resposta HTTP.

O servico evita carregar dados de outras contas e seleciona apenas as colunas necessarias. Agregacoes simples e contagens devem ocorrer no PostgreSQL; classificacao final e composicao da resposta podem ocorrer no dominio TypeScript. Nenhuma consulta usa valores de conta recebidos do cliente.

## Interface

### Demandas

A pagina ganha um controle segmentado **Quadro | Central**. O Quadro atual e preservado. A Central apresenta:

- barra compacta de filtros;
- seis indicadores acionaveis;
- tabela responsiva com prioridade, protocolo, demanda, responsavel, pendencia, prazo e ultima movimentacao;
- estado vazio contextual;
- loading com dimensoes estaveis;
- erro com comando para tentar novamente;
- paginacao;
- botoes de exportacao;
- clique em linha abrindo o painel da demanda existente.

No mobile, cada linha vira um item vertical sem tabela horizontal. Filtros secundarios ficam em um popover, mantendo pesquisa e situacao visiveis.

### Dashboard

O cartao de Demandas passa a mostrar demandas ativas, SLA vencido e encaminhamentos vencidos. O cartao inteiro abre a Central com o filtro critico. Nao serao adicionados novos blocos decorativos.

### Relatorios

A pagina recebe a secao **Demandas**, com indicadores de taxa e tempo, ranking de destinos e distribuicao por categoria/responsavel. Ela reutiliza filtros e exportacao da Central, mas nao duplica a fila operacional completa.

## Exportacao

- Excel: planilha `Demandas`, cabecalho, filtros aplicados, data de geracao e colunas operacionais. Datas usam formato local e percentuais permanecem numericos.
- PDF: titulo, periodo, resumo de indicadores e tabela compacta dos itens filtrados. O documento usa orientacao paisagem quando necessario.
- Nomes: `demandas-operacionais-AAAA-MM-DD.xlsx` e `.pdf`.
- Valores ausentes aparecem como `Nao informado`; nenhum token, credencial ou campo tecnico interno e exportado.

## Seguranca e privacidade

- Isolamento por `accountId` em todas as consultas.
- Permissao `demands` em todas as rotas.
- Validacao Zod de filtros, limites e datas.
- Sem SQL construido por concatenacao de entrada.
- Exportacao inclui apenas dados exibidos ao usuario autenticado.
- Telefone e e-mail do eleitor nao entram na exportacao desta entrega.
- Erros internos nao retornam SQL ou detalhes de infraestrutura.

## Estados de erro

- Filtro invalido: `400 VALIDATION_ERROR`.
- Sem permissao: contrato atual de `requirePermission("demands")`.
- Falha de consulta: `500 DEMAND_OPERATIONS_INTERNAL_ERROR`, com mensagem neutra.
- Exportacao acima de 5.000 itens: bloqueio no cliente com orientacao para refinar filtros.
- Falha ao carregar uma pagina de exportacao: nenhum arquivo parcial e baixado.

## Testes e aceite

- Dominio: periodos, classificacao de pendencias, desempate, percentuais e medias sem denominador.
- Servico: isolamento por conta, filtros, demanda unica com varios encaminhamentos, ranking e paginacao.
- API: autenticacao, permissao, validacao e contrato da resposta.
- Componentes: loading, erro, vazio, filtros, indicadores, tabela/mobile, paginacao e abertura da demanda.
- Exportacao: cabecalhos, valores, limite de 5.000 e preservacao dos filtros.
- Integracao local: dados temporarios cobrindo SLA vencido, encaminhamento vencido, proximo prazo, sem movimentacao e concluida; limpeza ao final.
- Navegador: Dashboard, Central e Relatorios em desktop e 375 px, sem erros de console, `5xx`, overflow ou sobreposicao.
- Gates: `npm test`, `npm run check`, `npm run build`, `npm run security:secrets`, `git diff --check`, health e readiness em `200`.

Nenhum push, imagem ou deploy sera realizado. A entrega permanece no banco e servidor locais ate validacao do usuario.

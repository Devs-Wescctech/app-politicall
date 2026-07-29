# Estabilidade e fluidez do atendimento

## Contexto

O atendimento ja possui os principais recursos operacionais, mas alguns fluxos ainda permitem estados ambiguos: o envio ao provedor ocorre antes da persistencia local, falhas de rede nao ficam representadas como uma tentativa recuperavel, a interface pode repetir a requisicao, a reconexao nao e claramente comunicada e parte dos filtros exibidos nao executa uma consulta real.

Esta etapa trata o caminho critico do operador sem reescrever todo o modulo. O motor de automacoes, assistencia por IA e pesquisa de satisfacao ficam fora deste ciclo porque possuem regras, riscos e criterios de aceite proprios.

## Objetivos

- Garantir que repeticoes da mesma acao nao criem chamadas concorrentes ou replays indevidos no provedor.
- Exibir os estados `pending`, `sending`, `unknown`, `sent`, `failed`, `delivered` e `read` sem perder o texto digitado.
- Permitir retry seguro de mensagens com falha, reutilizando a mesma tentativa local.
- Evitar duplicacao entre resposta da API, eventos em tempo real e sincronizacao WHU.
- Bloquear acoes invalidas de atendimento tanto na interface quanto no servidor.
- Tornar indisponibilidade, reconexao e conflito de posse compreensiveis para o operador.
- Implementar filtros reais de responsavel, setor e etiqueta, removendo opcoes sem fonte de dados valida.
- Preservar os contratos atuais sempre que isso nao comprometer a consistencia.

## Alternativas consideradas

### 1. Correcao apenas visual

Adicionar loading, mensagens de erro e desabilitar botoes reduziria erros de interacao, mas nao impediria duplicacao em timeout, reconexao ou chamadas repetidas. Foi descartada como solucao isolada.

### 2. Reescrita completa do atendimento

Separar imediatamente todas as rotas, componentes e modelos produziria uma arquitetura mais uniforme, mas ampliaria muito o risco de regressao em um modulo que ja esta em uso. Foi descartada para esta etapa.

### 3. Fatia vertical de estabilidade

Corrigir o ciclo completo de envio, sincronizacao, estados, posse e filtros, extraindo apenas os servicos tocados. Esta e a abordagem escolhida: entrega ganho operacional direto, cria testes nas fronteiras de maior risco e permite decompor os arquivos grandes de forma incremental.

## Fluxo de envio

1. O cliente gera um UUID `clientMessageId` para cada acao intencional de envio.
2. O servidor valida permissao, posse, estado da conversa, janela do provedor e conteudo.
3. Antes de chamar o provedor, o servidor cria uma mensagem local com status `sending`.
4. Um indice unico por conta e `clientMessageId` transforma repeticoes da mesma requisicao em consulta da tentativa existente.
5. Se a tentativa ja estiver `sending`, `sent`, `delivered` ou `read`, o servidor devolve o registro existente e nao chama o provedor novamente.
6. Em sucesso, o mesmo registro recebe o ID externo e passa para `sent`.
7. Em rejeicao explicita do provedor ou falha comprovadamente anterior ao envio, o registro passa para `failed`, guarda uma mensagem sanitizada e informa se o erro e recuperavel.
8. Em timeout ou queda depois do inicio da chamada, quando nao e possivel saber se o provedor aceitou a mensagem, o registro passa para `unknown` e nao e reenviado automaticamente.
9. O retry usa endpoint proprio e uma transicao atomica `failed -> sending`. Repeticoes concorrentes retornam a tentativa em andamento. Mensagens `unknown` precisam primeiro ser reconciliadas; um reenvio manual forcado cria nova intencao e exige confirmacao sobre o risco de duplicidade externa.
10. Eventos em tempo real e sincronizacao reconciliam pelo ID externo e, quando presente, pelo `clientMessageId`; eles atualizam a mesma mensagem em vez de inserir uma copia.

O primeiro ciclo cobre mensagens de texto. Midia, localizacao, contatos e templates continuam funcionando pelo contrato atual e receberao a mesma infraestrutura em etapas posteriores, sem regressao do comportamento existente.

## Modelo de dados

`att_messages` recebera campos opcionais e retrocompativeis:

- `client_message_id`: identificador gerado pelo cliente.
- `send_attempts`: quantidade de tentativas efetivamente enviadas ao provedor.
- `last_attempt_at`: horario da ultima tentativa.
- `updated_at`: horario da ultima mudanca de estado.

Sera criado um indice unico parcial em `(account_id, client_message_id)` quando o identificador nao for nulo. Dados antigos nao precisam de backfill. A migracao deve ser reversivel e nao pode remover mensagens existentes.

## Contratos da API

### Enviar texto

`POST /api/attendance/conversations/:id/send`

Body:

```json
{
  "message": "Texto da mensagem",
  "clientMessageId": "uuid"
}
```

Respostas relevantes:

- `200`: tentativa existente ou envio concluido.
- `202`: tentativa aceita e ainda em processamento, caso o transporte precise ser desacoplado.
- `400` ou `422`: entrada invalida.
- `403`: operador sem permissao ou sem posse.
- `409`: conversa mudou de estado, janela do canal fechou ou outra tentativa esta em andamento.
- `502` ou `503`: falha recuperavel do provedor.

### Repetir envio

`POST /api/attendance/messages/:id/retry`

O endpoint aceita somente mensagens `outbound` com status `failed`, da mesma conta e de uma conversa em que o operador ainda possa responder.

### Erro padronizado

```json
{
  "error": "Mensagem segura para o operador",
  "code": "ATTENDANCE_PROVIDER_UNAVAILABLE",
  "retryable": true,
  "correlationId": "uuid"
}
```

Detalhes internos, tokens e corpo bruto do provedor nao devem chegar ao navegador.

## Regras de conversa e concorrencia

- O servidor continua sendo a fonte de verdade para estado e posse.
- Assumir, liberar, pausar, transferir, encerrar e reabrir devem validar a transicao atual no momento da escrita.
- Conflitos de estado ou de responsavel retornam `409`, nao `500`.
- Ao receber `409`, a interface atualiza a conversa e explica a mudanca sem descartar o rascunho.
- Os comandos ficam desabilitados quando o estado local ja demonstra que a acao e invalida, mas a verificacao de servidor permanece obrigatoria.
- O fechamento de conversa aguarda envios em andamento ou exige confirmacao explicita quando houver tentativa com falha.

## Experiencia do operador

- O rascunho e mantido por conversa durante navegacao, erro e reconexao.
- Um clique ou atalho cria imediatamente uma bolha local estavel; cliques repetidos nao criam novas tentativas.
- Mensagem em falha mostra estado, texto de erro curto e comando de retry.
- Mensagem com resultado incerto mostra `Confirmando envio` e nao oferece retry silencioso.
- Um indicador compacto informa `Conectado`, `Reconectando` ou `Sem conexao` sem bloquear a leitura do historico.
- Ao reconectar, a lista e a conversa aberta fazem uma reconciliacao incremental.
- Filtros de responsavel, setor e etiqueta usam dados reais e podem ser combinados.
- O filtro de empresa sera removido enquanto nao houver campo e fonte de dados confiaveis para ele.
- Estados vazio, carregando, sem resultado e erro devem ser distintos e acionaveis.

## Estrutura de codigo

A alteracao sera incremental e seguira os padroes existentes:

- Um servico de dominio no servidor concentra idempotencia, transicoes e retry de envio.
- Um helper puro concentra normalizacao e reconciliacao de identidade de mensagens.
- Um hook do frontend controla rascunhos, tentativas locais e conectividade.
- Um parser compartilhado valida os filtros da lista.
- As rotas permanecem como adaptadores HTTP e deixam de conter a regra completa do envio.
- Os componentes atuais serao divididos apenas onde a alteracao reduzir responsabilidade e permitir teste isolado.

## Observabilidade e seguranca

- Cada tentativa recebe `correlationId` nos logs e eventos de auditoria.
- Logs registram conta, conversa, mensagem, transicao e categoria do erro, sem conteudo sensivel, token ou credencial.
- Validacao com Zod cobre UUID, tamanho da mensagem e parametros de filtro.
- Toda leitura e escrita continua limitada por `accountId`.
- Retry exige a mesma permissao de resposta e repete as validacoes de posse e politica do canal.
- Erros do WHU sao classificados e sanitizados antes da resposta HTTP.
- Como o WHU nao oferece uma chave de idempotencia confirmada, a garantia local impede replays da mesma requisicao, mas nao afirma exatamente uma entrega em falhas externas ambiguas. Esses casos permanecem `unknown` ate reconciliacao ou decisao explicita do operador.

## Testes

O desenvolvimento seguira RED-GREEN-REFACTOR.

- Unitarios: transicoes de mensagem, decisao de retry, identidade/deduplicacao, parser de filtros e estados de acao.
- Integracao: envio duplicado com o mesmo `clientMessageId`, sucesso, timeout, falha recuperavel, retry concorrente, conflito de posse e isolamento entre contas.
- Regressao: sincronizacao nao duplica a mensagem confirmada pelo provedor.
- Frontend: preservacao de rascunho, bloqueio de duplo envio, falha com retry, conflito `409`, filtros combinados e indicador de conexao.
- Browser QA: conversa de teste em desktop e mobile, incluindo offline/reconexao simulados, sem envio para contatos reais.
- Gate final: suite existente e novos testes, TypeScript, build, auditoria de dependencias, smoke test da API e verificacao visual.

## Migracao e compatibilidade

- A migracao adiciona somente colunas opcionais e indice parcial.
- Clientes antigos sem `clientMessageId` continuam aceitos durante uma janela de compatibilidade, mas nao recebem a garantia forte de idempotencia.
- O novo cliente sempre envia `clientMessageId`.
- Em rollback, o codigo deixa de usar os novos campos antes de remover o indice e as colunas.
- Antes da migracao sera criado um backup local do projeto e sera confirmado o mecanismo de backup do banco disponivel no ambiente.

## Fora de escopo

- Motor de automacoes e agendamento.
- Construtor visual de fluxos.
- Assistente de IA, resumo e sentimento automaticos.
- Pesquisa de satisfacao.
- Reescrita integral de `attendance-routes.ts` e dos componentes grandes.
- Alteracao de provedores ou da integracao WHU alem do necessario para classificar erros.

## Criterios de aceite

- A mesma `clientMessageId` nao cria chamadas concorrentes nem repete automaticamente uma tentativa de resultado incerto.
- Uma falha fica visivel e pode ser repetida sem criar outra mensagem local.
- Rascunhos sobrevivem a erro, troca de conversa e reconexao durante a sessao.
- Eventos da API, tempo real e sincronizacao convergem para um unico registro.
- Acoes invalidas sao bloqueadas no cliente e rejeitadas com resposta coerente no servidor.
- Filtros de responsavel, setor e etiqueta alteram os resultados reais da lista.
- O operador consegue distinguir conexao normal, reconexao e indisponibilidade.
- Nenhum teste anterior regride e os novos cenarios criticos ficam automatizados.
- Build, verificacao de tipos, auditoria e smoke test terminam sem erro critico.

## Entrega em etapas

1. Testes de caracterizacao e migracao retrocompativel.
2. Servico idempotente de envio de texto e endpoint de retry.
3. Reconciliacao de sincronizacao e eventos em tempo real.
4. Estado local, rascunho, retry e conectividade na interface.
5. Filtros reais e validacao de acoes por estado/posse.
6. Refatoracao restrita aos trechos alterados, documentacao e gate final.

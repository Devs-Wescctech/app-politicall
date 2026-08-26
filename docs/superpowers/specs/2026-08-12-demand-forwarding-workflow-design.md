# Fluxo de encaminhamentos de demandas

## Objetivo

Transformar a demanda em um fluxo operacional de resolucao. O gabinete deve conseguir encaminhar uma solicitacao para varios orgaos externos ou setores internos, acompanhar prazos e respostas, cobrar providencias e manter eleitor, agenda, responsaveis, documentos, notificacoes e historico conectados.

## Escopo

- Cadastro reutilizavel de orgaos e setores por conta.
- Destinos classificados como internos ou externos.
- Nome, descricao, responsavel, telefone, e-mail e prazo padrao de resposta.
- Ativacao e inativacao sem apagar o historico.
- Varios encaminhamentos simultaneos ou sequenciais por demanda.
- Responsavel interno, protocolo externo, datas, prazo, prioridade, observacoes e resposta.
- Estados `draft`, `forwarded`, `waiting`, `answered`, `completed` e `cancelled`.
- Notificacoes internas e alertas de prazo idempotentes.
- Rascunho de atualizacao ao eleitor, sempre revisado antes do envio.
- Registro no historico geral da demanda.
- Indicadores operacionais por destino, responsavel, estado e prazo.

Nao fazem parte desta entrega: envio automatico sem confirmacao, motor generico de BPM, assinatura digital, integracao direta com sistemas de prefeituras, OCR, classificacao por IA ou armazenamento externo de arquivos.

## Decisoes de produto

### Cadastro de destinos

Cada conta possui seus proprios destinos. Um destino representa um setor interno ou um orgao externo e contem:

- `kind`: `internal` ou `external`;
- nome e descricao;
- nome do contato responsavel;
- telefone e e-mail;
- prazo padrao de resposta em horas;
- estado ativo/inativo;
- datas de criacao e atualizacao.

O nome deve ser unico por conta e tipo, sem diferenciar maiusculas e minusculas. Um destino usado em encaminhamentos nao e removido fisicamente; ele pode ser inativado.

### Encaminhamentos

Uma demanda pode possuir varios encaminhamentos. Cada encaminhamento registra:

- destino;
- usuario interno responsavel pelo acompanhamento;
- usuario que criou o encaminhamento;
- protocolo externo opcional;
- prioridade;
- estado atual;
- data efetiva de envio;
- prazo de resposta calculado ou informado;
- data de resposta e conclusao;
- observacoes de envio;
- resposta recebida;
- datas de criacao e atualizacao.

O prazo e sugerido a partir do destino, mas pode ser alterado no encaminhamento. Criar um rascunho nao dispara alerta. Ao marcar como encaminhado, a data de envio e preenchida e o prazo passa a ser monitorado.

### Estados e transicoes

- `draft`: preparacao ainda nao enviada;
- `forwarded`: encaminhado ao destino;
- `waiting`: aguardando providencia ou resposta;
- `answered`: resposta recebida e registrada;
- `completed`: providencia encerrada;
- `cancelled`: encaminhamento cancelado.

Transicoes impossiveis sao rejeitadas pelo dominio. Estados finais nao podem voltar ao fluxo ativo sem uma acao explicita de reabertura, que fica fora desta primeira entrega. A demanda principal nao e concluida automaticamente: o operador decide quando todos os encaminhamentos produziram uma solucao suficiente.

## Arquitetura de dados

### `demand_destinations`

Armazena os destinos por conta. A chave logica `(account_id, kind, lower(name))` impede duplicidade. Exclusao de conta remove seus destinos; usuarios vinculados usam `ON DELETE SET NULL` quando aplicavel.

### `demand_forwardings`

Armazena cada encaminhamento e referencia conta, demanda, destino, criador e responsavel interno. Indices cobrem conta/demanda, conta/destino, conta/responsavel, estado e prazo.

### `demand_forwarding_events`

Registra eventos automaticos idempotentes, inicialmente `due_soon` e `overdue`. A chave unica por encaminhamento e tipo evita notificacoes duplicadas entre execucoes ou instancias concorrentes.

Os eventos de negocio tambem entram em `demand_history` com metadados que identificam encaminhamento e destino. Nenhum dado existente da demanda e substituido.

## Backend

O dominio de encaminhamentos sera separado das rotas e do acesso a dados. Ele valida transicoes, calcula prazo, define estados ativos e produz notificacoes e rascunhos de atualizacao.

Os servicos sempre recebem `accountId` autenticado e validam que demanda, destino e responsavel pertencem a mesma conta. Criacao, alteracao, notificacao e historico relevante usam transacao.

O verificador de prazo reutiliza o padrao do SLA de demandas: execucao no inicio, intervalo configuravel, protecao contra sobreposicao e reserva idempotente antes de criar notificacao e historico. O alerta de proximidade usa quatro horas por padrao.

## API

Todas as rotas exigem autenticacao, permissao `demands` e CSRF nas mutacoes.

### Destinos

- `GET /api/demand-destinations`: listar, com filtro de tipo e estado.
- `POST /api/demand-destinations`: criar.
- `PATCH /api/demand-destinations/:id`: atualizar ou inativar.

Destinos usados nao possuem exclusao fisica pela API.

### Encaminhamentos

- `GET /api/demands/:id/forwardings`: listar com destino e responsavel.
- `POST /api/demands/:id/forwardings`: criar rascunho ou encaminhar.
- `PATCH /api/demands/:id/forwardings/:forwardingId`: alterar dados ou estado.
- `POST /api/demands/:id/forwardings/:forwardingId/message-draft`: gerar rascunho deterministico para o eleitor.

Erros usam codigos estaveis: `DESTINATION_NOT_FOUND`, `DESTINATION_DUPLICATE`, `FORWARDING_NOT_FOUND`, `FORWARDING_INVALID_TRANSITION`, `FORWARDING_INVALID_DUE_AT` e `DEMAND_NOT_FOUND`.

## Rascunho para o eleitor

O backend gera texto objetivo a partir do protocolo da demanda, destino e novo estado, sem usar IA. O rascunho nao e persistido como mensagem enviada e nunca chama provedores automaticamente.

Na interface, o operador pode copiar o texto ou abrir a composicao no atendimento vinculado. O envio continua sujeito a conexao disponivel, janela do canal, template e confirmacao ja existentes no modulo de Atendimentos.

## Interface

### Pagina Demandas

O painel lateral ganha a aba **Encaminhamentos**. Ela apresenta:

- resumo com ativos, atrasados e concluidos;
- lista cronologica de encaminhamentos;
- destino, responsavel, protocolo, prazo, estado e prioridade;
- acoes de criar, editar, registrar resposta, concluir e cancelar;
- comando **Preparar atualizacao ao eleitor**;
- estados vazio, carregando, erro e permissao.

O formulario usa seletores para destino e responsavel, calendario/data para prazo, menu para prioridade/estado e campos de texto para protocolo, observacao e resposta. O layout segue a densidade, bordas e controles atuais de Demandas e funciona em desktop e mobile sem criar cards aninhados.

### Cadastro de destinos

Uma secao em Configuracoes permite pesquisar, criar, editar e inativar destinos. Destinos inativos continuam visiveis nos encaminhamentos antigos, mas nao aparecem como opcao em novos registros.

### Indicadores

O resumo de Demandas passa a expor encaminhamentos ativos, vencidos e aguardando resposta. A primeira entrega mostra os indicadores na propria pagina; a expansao para Relatorios fica preparada pelo contrato da API.

## Notificacoes e agenda

- O responsavel interno e notificado quando outra pessoa cria ou transfere um encaminhamento para ele.
- Um alerta unico e criado quatro horas antes do prazo.
- Um alerta unico e criado quando o prazo vence.
- Registrar resposta ou concluir encerra alertas futuros.
- Acoes de cobranca usam o fluxo de follow-up da agenda, vinculadas a demanda e identificadas pelo encaminhamento nos metadados do historico.

## Seguranca e consistencia

- Isolamento por conta em todas as consultas e mutacoes.
- Validacao de entrada com Zod e lista fechada de estados/transicoes.
- Sem envio externo automatico.
- Contatos do destino nao sao expostos fora de rotas autenticadas.
- Indices para listas e jobs de prazo.
- Migracao aditiva e idempotente, sem alterar demandas existentes.
- Backup antes de aplicacao fora do ambiente local e rollback documentado.

## Tratamento de falhas

- Operacoes parciais sao revertidas por transacao.
- Concorrencia de alertas e controlada por chave unica.
- Destino inativo ou de outra conta e rejeitado em novos encaminhamentos.
- Falha ao gerar rascunho nao muda o estado do encaminhamento.
- Datas invalidas, prazo anterior ao envio e transicoes proibidas retornam `400` com mensagem utilizavel.

## Testes e criterios de aceite

- Unidade: calculo de prazo, transicoes, estados ativos, alertas e rascunho ao eleitor.
- Migracao: tabelas, chaves estrangeiras, indices, unicidade e idempotencia.
- Servicos: isolamento por conta, transacoes, destino inativo e notificacoes sem duplicidade.
- API: autenticacao, permissao, CSRF, validacao, codigos de erro e contratos de resposta.
- Componentes: estados da aba, formulario, lista, prazos e rascunho.
- Integracao local: criar destino, criar dois encaminhamentos, atualizar estados, registrar resposta, gerar rascunho, criar follow-up e validar alertas.
- Navegador: fluxo principal em desktop e 375 px, sem erros inesperados, respostas `5xx`, overflow ou sobreposicao.

A entrega sera considerada concluida quando a suite completa, TypeScript, build, scanner de segredos, migracao local, integracoes de banco e QA no navegador forem aprovados. Nenhum push ou deploy sera executado.

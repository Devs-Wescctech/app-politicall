# Gestao segura de eleitores duplicados

## Objetivo

Identificar e consolidar cadastros que representam a mesma pessoa sem apagar historico, sem juntar atendimentos distintos e sem perder o numero de WhatsApp do gabinete pelo qual cada conversa chegou.

## Decisao de arquitetura

Foram considerados tres caminhos:

1. Excluir o duplicado depois de mover seus vinculos. E simples, mas impede auditoria e desfazer com seguranca.
2. Arquivar o duplicado e registrar apenas um resumo da operacao. Preserva o cadastro, mas nao permite restaurar com precisao cada vinculo movido.
3. Arquivar o duplicado e manter um diario imutavel com os IDs de cada vinculo transferido. Exige uma tabela adicional, mas permite desfazer de forma deterministica e preserva integralmente as conversas.

Sera usada a terceira opcao. O contato escolhido pelo operador e o **principal**; os demais tornam-se **arquivados por mesclagem**. Nenhuma conversa, mensagem, demanda, agenda, campanha ou assinatura e excluida.

## Regras de identidade

A deteccao sempre ocorre dentro da conta autenticada e produz sugestoes, nunca mesclagem automatica.

- Correspondencia exata de e-mail normalizado: evidencia forte.
- Correspondencia exata de telefone normalizado: evidencia forte.
- Nome normalizado combinado com cidade ou estado: evidencia moderada e apenas sugestiva.
- Mesmo nome isolado nunca e suficiente, porque homonimos sao permitidos.
- Contatos ja arquivados nao participam de novas sugestoes.
- CPF nao sera introduzido neste ciclo: o cadastro atual nao possui esse dado e sua inclusao exige requisitos proprios de LGPD, mascaramento, permissao e retencao.

Cada grupo retornara os motivos da sugestao e um nivel `high` ou `review`. O operador compara os registros e escolhe explicitamente o principal.

## WhatsApp e historico do numero receptor

Uma pessoa pode chamar dois ou mais numeros de WhatsApp conectados ao gabinete. Isso representa um eleitor com atendimentos independentes, nao contatos distintos e nao uma unica conversa.

Cada `att_conversations` armazenara um snapshot do destino no momento da criacao:

- `inbound_connection_name`: nome exibido da conexao;
- `inbound_number`: numero do WhatsApp do gabinete;
- `connection_id`: referencia operacional existente.

O numero sera extraido dos metadados da conexao na ordem `phoneNumber`, `whatsappPhoneNumber`, `number` e `identifier`. O snapshot nao sera alterado se a conexao for renomeada, reconfigurada ou removida. Conversas antigas receberao backfill apenas quando a conexao atual fornecer uma identificacao confiavel.

A Ficha 360 e os detalhes do atendimento exibirao o canal no formato:

`WhatsApp recebido em <nome da conexao> - <numero>`

Quando o numero nao estiver disponivel, sera exibido o nome da conexao. Quando ambos estiverem ausentes, sera exibido apenas `WhatsApp`.

## Modelo de dados

### Contatos

Adicionar campos opcionais a `contacts`:

- `merged_into_contact_id`, autorreferencia com `ON DELETE RESTRICT`;
- `merged_at`;
- `merged_by_user_id`;
- `updated_at`.

Listagens normais, seletores, campanhas e busca retornarao somente contatos ativos. Acesso direto a um contato arquivado redirecionara para o principal e informara que houve mesclagem.

### Diario de mesclagem

Criar `contact_merge_events`:

- `id`, `account_id`, `source_contact_id`, `target_contact_id`, `user_id`;
- `status`: `completed` ou `reverted`;
- `source_snapshot` e `target_snapshot`, sem segredos;
- `moved_relations`, contendo arrays de IDs por dominio;
- `conflict_resolution`, registrando quais valores foram escolhidos;
- `created_at`, `reverted_at`, `reverted_by_user_id`.

O diario e imutavel, exceto pelos campos que marcam a reversao. Os IDs movidos permitem restaurar somente os registros pertencentes a operacao original.

## Dominios transferidos

Durante a mesclagem, uma unica transacao atualizara os vinculos do contato de origem para o principal em:

- `demands.contact_id`;
- `events.contact_id`;
- `att_conversations.contact_id`;
- `att_messages.contact_id`;
- `campaign_recipients.contact_id`;
- `petition_signatures.contact_id`;
- listas, etiquetas e demais tabelas de relacionamento encontradas no schema.

Conversas continuam sendo linhas independentes com seus protocolos, mensagens, `connection_id`, `inbound_connection_name` e `inbound_number`. A mesclagem altera somente `contact_id`.

Etiquetas e interesses serao unidos sem duplicacao. Campos escalares conflitantes, como nome, e-mail, telefone e localidade, exigirao escolha no comparador antes da confirmacao. A transacao falhara por completo se qualquer contato pertencer a outra conta ou ja tiver sido mesclado.

## Desfazer

A reversao usa `moved_relations` para devolver ao contato de origem apenas os registros que ainda apontam para o principal. Registros novos criados depois da mesclagem permanecem no principal. O contato de origem e reativado com seu snapshot anterior.

A reversao sera recusada quando:

- a mesclagem ja tiver sido revertida;
- origem ou destino pertencerem a outra conta;
- a origem tiver participado de outra mesclagem posterior incompativel.

## API

Todas as rotas exigem sessao, CSRF nos metodos de escrita, permissao `contacts` e escopo integral por `account_id`.

### `GET /api/contacts/duplicates`

Retorna grupos paginados com contatos ativos, evidencias e nivel de confianca. Aceita busca e filtros por nivel.

### `POST /api/contacts/merge-preview`

Body: `sourceContactIds`, `targetContactId`.

Retorna comparacao dos campos, contagens por dominio e conflitos que precisam de decisao. Nao grava dados.

### `POST /api/contacts/merge`

Body: `sourceContactIds`, `targetContactId`, `resolvedContact` e token de confirmacao produzido pelo preview.

Executa uma transacao, cria um evento para cada origem e retorna os totais transferidos. O token impede confirmar uma previsualizacao antiga depois de alteracoes concorrentes.

### `POST /api/contacts/merges/:id/revert`

Reverte uma operacao elegivel e retorna as quantidades restauradas.

### `GET /api/contacts/merges`

Retorna o historico paginado de mesclagens e reversoes da conta.

## Interface

A pagina **Eleitores** ganhara o comando `Revisar duplicados`, com contador de grupos pendentes. A tela dedicada tera:

- filtros por confianca e busca;
- grupos compactos com os motivos da sugestao;
- comparador lado a lado;
- selecao explicita do contato principal;
- escolha dos valores conflitantes;
- resumo dos registros que serao movidos;
- confirmacao final sem exclusao permanente;
- aba de historico com acao `Desfazer` quando elegivel.

A Ficha 360 mostrara em cada atendimento o nome e o numero receptor do WhatsApp. O layout seguira os componentes e a densidade visual atuais, com estados de carregamento, vazio, erro e permissao.

## Seguranca e concorrencia

- Nunca cruzar contas em deteccao, preview, mesclagem ou reversao.
- Bloquear os contatos envolvidos com `SELECT ... FOR UPDATE` durante escrita.
- Confirmar novamente que todos estao ativos antes da transferencia.
- Limitar o numero de origens por operacao.
- Nao registrar conteudo de mensagens, tokens ou credenciais no diario.
- Registrar usuario, horario, IP e user-agent no evento de auditoria.
- Manter mesclagem e reversao atomicas.

## Migracao

As alteracoes serao aditivas. O schema e o backfill do snapshot de conexoes serao separados. Indices serao criados para contatos ativos, destino de mesclagem e consultas do diario. Nenhum contato sera mesclado pela migracao.

O primeiro ciclo sera aplicado somente no PostgreSQL local. Nao havera push nem publicacao.

## Testes

- Unitarios: normalizacao, pontuacao, agrupamento, conflitos e formatacao da origem WhatsApp.
- Servico: transferencia atomica de cada dominio e preservacao das conversas.
- Reversao: restaura apenas os IDs do diario e preserva registros posteriores.
- API: autenticacao, CSRF, permissao, isolamento entre contas, concorrencia e erros.
- Componentes: lista, comparador, confirmacao, historico e estados vazios.
- E2E local: detectar grupo, mesclar, validar Ficha 360 com duas conversas em numeros receptores diferentes e desfazer.
- Gate final: TypeScript, suite completa, build, varredura de segredos e QA desktop/mobile.

## Criterios de aceite

1. Nenhuma mesclagem ocorre sem confirmacao humana.
2. Homonimos sem outra evidencia nao sao sugeridos como duplicados fortes.
3. Todos os vinculos existentes aparecem no contato principal depois da mesclagem.
4. Atendimentos e mensagens permanecem separados e completos.
5. Cada atendimento informa qual conexao e numero do gabinete o recebeu.
6. A reversao restaura os vinculos da operacao sem mover registros criados depois dela.
7. Nenhuma operacao acessa ou altera dados de outra conta.
8. O recurso funciona em desktop e mobile no ambiente local `127.0.0.1:5001`.

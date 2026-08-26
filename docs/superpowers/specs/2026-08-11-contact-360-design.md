# Ficha 360 do Eleitor

## Objetivo

Consolidar em uma pagina unica o cadastro e todo o relacionamento de um eleitor com o gabinete: demandas, atendimentos, agenda, campanhas e peticoes. A ficha deve permitir leitura rapida, navegacao para o registro de origem e isolamento integral por conta.

## Escopo

- Nova rota autenticada `/contacts/:id` acessivel a partir da lista de Eleitores.
- Cabecalho com nome, avatar, contatos, localidade, origem, tags e acao de edicao.
- Indicadores compactos de demandas abertas, atendimentos, compromissos, campanhas e peticoes.
- Linha do tempo unificada e ordenada do evento mais recente para o mais antigo.
- Abas por dominio para consultar detalhes sem sobrecarregar a tela.
- Atalhos contextuais para Demandas, Atendimentos, Agenda, Campanhas e Peticoes.
- Estados explicitos de carregamento, vazio, erro e registro inexistente.

Nao fazem parte desta entrega: mesclagem automatica de duplicados, campos personalizados, criacao de novos vinculos retroativos ou alteracao dos fluxos dos modulos de origem.

## Arquitetura

O backend oferecera `GET /api/contacts/:id/360`. Um service dedicado consultara o contato e os registros relacionados usando `accountId` e `contactId`, normalizara os itens de cada dominio e produzira um contrato agregado. Nenhum dado sera duplicado.

Uma migracao aditiva acrescentara `contact_id` a `petition_signatures`. Novas assinaturas publicas ou importadas resolverao um contato da mesma conta por e-mail ou telefone normalizado; quando nao houver correspondencia confiavel, criarao um contato e gravarao o identificador na assinatura. Assinaturas antigas permanecem validas e sem vinculo ate uma conciliacao explicita futura.

O frontend tera uma pagina dedicada e componentes pequenos em `client/src/components/contacts/`. A lista atual apenas ganhara uma acao para abrir a ficha. A pagina usara TanStack Query, os componentes do design system atual e links com filtros ou identificadores para os modulos de origem.

## Contrato da API

### `GET /api/contacts/:id/360`

- Autenticacao: token de sessao existente.
- Permissao: `contacts`.
- Parametro: `id` do contato.
- `200`: `{ contact, summary, timeline, demands, conversations, events, campaigns, petitions }`.
- `404 CONTACT_NOT_FOUND`: contato ausente ou pertencente a outra conta.
- `500`: erro interno padronizado sem detalhes sensiveis.

Cada item de `timeline` tera `id`, `type`, `title`, `description`, `occurredAt`, `status`, `sourceId` e `href`. O limite inicial sera de 100 itens recentes; as listas por dominio retornarao os 50 registros mais recentes para manter a tela previsivel.

## Dados e seguranca

- Toda consulta inclui `account_id = req.accountId`.
- O contato e validado antes das consultas agregadas.
- A resposta nao inclui credenciais, conteudo secreto de integracoes ou metadados brutos.
- Telefones e e-mails seguem as mesmas permissoes do modulo Eleitores.
- Registros antigos sem relacao confiavel por `contactId` nao serao inferidos apenas por nome.
- A vinculacao de novas assinaturas usa e-mail ou telefone normalizado dentro da mesma conta e nunca cruza contas.

## Experiencia

A pagina segue a linguagem visual operacional de Demandas: fundo neutro, bordas discretas, raio contido e densidade adequada para leitura. O topo fixa a identidade do eleitor e as acoes; abaixo, indicadores e abas. A linha do tempo e o elemento principal, com marcadores por dominio e textos objetivos. Em telas pequenas, indicadores quebram em duas colunas e as abas permitem rolagem horizontal.

## Erros e estados vazios

- Falha da API: mensagem com acao `Tentar novamente`.
- Contato inexistente: estado de pagina com retorno para Eleitores.
- Dominio sem registros: mensagem especifica e, quando aplicavel, atalho para criar ou consultar o modulo.
- Links de origem indisponiveis nao sao renderizados como acao.

## Testes

- Unitarios do agregador: normalizacao, ordenacao, contagens e limite da timeline.
- Integracao da rota: autenticacao, permissao, isolamento por conta, `404` e contrato de sucesso.
- Componente: carregamento, erro, vazio, dados agregados e navegacao.
- E2E local: abrir Eleitores, acessar uma ficha, validar abas e retornar para a lista.
- Gate final: testes focados, suite completa, TypeScript, build, seguranca e verificacao visual desktop/mobile.

## Criterios de aceite

1. Um usuario autorizado abre a ficha diretamente pela lista de Eleitores.
2. Nenhum registro de outra conta aparece na resposta.
3. Os totais correspondem as listas agregadas.
4. A linha do tempo aparece em ordem decrescente e identifica sua origem.
5. A pagina funciona em desktop e mobile e trata loading, erro e vazio.
6. O ambiente permanece somente local em `127.0.0.1:5001`; nao ha publicacao ou push.

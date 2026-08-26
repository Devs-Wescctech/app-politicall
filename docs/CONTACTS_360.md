# Ficha 360 do Eleitor

## Uso

1. Abra **Eleitores**.
2. No menu de acoes de um eleitor, selecione **Ver ficha 360**.
3. Consulte a linha do tempo ou alterne entre Demandas, Atendimentos, Agenda, Campanhas e Peticoes.
4. Selecione um registro para abrir o modulo de origem.
5. Use **Nova demanda**, **Novo atendimento** ou **Agendar retorno** para iniciar um fluxo com o eleitor ja vinculado.

## API

`GET /api/contacts/:id/360`

- Autenticacao: sessao de usuario.
- Permissao de entrada: `contacts`.
- Permissoes por dominio: cada colecao e cada indicador so sao consultados e retornados quando o usuario possui a permissao correspondente. Administradores visualizam todos os dominios.
- Sucesso: `200` com `visibility`, `contact`, `summary`, `timeline`, `demands`, `conversations`, `events`, `campaigns` e `petitions`.
- Ausente ou fora da conta: `404` com codigo `CONTACT_NOT_FOUND`.
- Falha: `500` com codigo `CONTACT_360_LOAD_FAILED`.

As colecoes sao limitadas aos 50 registros mais recentes por dominio e a timeline aos 100 eventos mais recentes. Os indicadores usam contagens independentes no banco, portanto nao ficam limitados a 50. Campanhas multicanal contam uma campanha uma unica vez.

## Identidade e integracoes

O eleitor e conciliado dentro da propria conta, primeiro pelo e-mail normalizado e depois pelo telefone brasileiro normalizado. Nome nao e identificador: pessoas homonimas podem coexistir e nenhum contato anterior e apagado ao cadastrar outro com o mesmo nome.

- Atendimento: novas conversas criadas pelo atalho recebem `contact_id`; sincronizacoes tambem associam a conversa ao contato encontrado ou criado.
- Origem do atendimento: cada conversa exibe o snapshot da conexao e do numero receptor. Contatos podem ter atendimentos separados em varios numeros de WhatsApp sem perda ou consolidacao do historico.
- Campanhas: cada destinatario recebe `contact_id` quando e-mail ou telefone corresponde a um eleitor.
- Peticoes: assinaturas publicas e importadas usam a mesma regra de identidade.
- Agenda e Demandas: os atalhos carregam `contactId` e persistem o relacionamento ao salvar.
- Links da timeline: `demandId`, `conversationId`, `eventId` e `petitionId` abrem diretamente o registro de origem.

## Peticoes e CRM

A migracao `0013_petition_signature_contact.sql` adiciona `contact_id` a `petition_signatures`. Novas assinaturas publicas e importadas procuram contato da mesma conta por e-mail ou telefone normalizado. Quando nao existe correspondencia e ha um identificador confiavel, o sistema cria um contato com origem `Peticao` sem substituir homonimos.

A migracao `0014_contact_identity_ecosystem.sql` remove a unicidade por nome normalizado, cria indices para consultas por contato e reconcilia atendimentos, destinatarios de campanhas e assinaturas antigas. O backfill so grava o vinculo quando existe exatamente uma correspondencia por e-mail ou telefone; casos ambiguos permanecem sem vinculo para evitar associacao incorreta.

A migracao `0015_contact_deduplication.sql` adiciona a mesclagem auditavel de eleitores e os campos `inboundConnectionName`, `inboundNumber` e `inboundLabel` aos atendimentos retornados pela Ficha 360. O label informa explicitamente em qual conexao e numero a mensagem foi recebida.

## Operacao

- Local: aplicar a migracao e iniciar o app normalmente.
- Producao: o executor `scripts/migrate-production.ts` aplica a migracao antes do processo web.
- Nao e necessario configurar nova variavel de ambiente.
- Rollback de schema: remover os tres indices criados por `0014`. A restricao unica por nome nao deve ser recriada sem antes tratar homonimos existentes. Os `contact_id` preenchidos pelo backfill podem permanecer porque sao chaves opcionais e nao alteram os registros de origem.

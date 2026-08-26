# Validação das migrations 0011–0024

> Relatório histórico, substituído após a correção pela validação 0011–0025 em `reports/migration-validation-0011-0025.md`.

Data: 2026-08-25

## Parecer

**NÃO APROVADO para aplicação em produção neste estado.**

As migrations 0011–0024 executam com sucesso e são idempotentes sobre uma cópia apenas da estrutura de produção. Entretanto, uma instalação criada pelo baseline atual não converge exatamente para a mesma estrutura: foram encontradas colunas residuais e uma diferença de índice. Recomenda-se reconciliar essas diferenças em uma migration 0025 e repetir esta validação antes do rollout.

Produção foi acessada somente em transação `READ ONLY`, finalizada com `ROLLBACK`. Nenhuma migration ou alteração de dados foi aplicada em produção.

## Método

1. Inventário das migrations e de suas condições de bloqueio.
2. Preflight somente leitura no banco de produção, usando apenas contagens agregadas.
3. Dump somente de schema e histórico de migrations de produção.
4. Restauração em PostgreSQL 18.1 descartável.
5. Aplicação das migrations 0011–0024 pelo runner da imagem de homologação.
6. Segunda execução para testar idempotência.
7. Comparação semântica dos catálogos PostgreSQL do clone migrado e da homologação.
8. Build, checagem de tipos, testes focados e smoke test de runtime.

## Preflight de produção

- PostgreSQL: 18.1.
- Histórico presente: 9 migrations, até 0010.
- Linhas nas tabelas afetadas: `demands` 13, `contacts` 154, `events` 41, `att_conversations` 296, `channel_connections` 2, `political_alliances` 38 e `petition_signatures` 1.
- Status de demandas a normalizar: 3.
- Prioridades de demandas a normalizar: 0.
- Grupos duplicados de telefone WHU normalizado ativo: 0.
- Conexões WHU ativas aguardando fingerprint: 0.
- Threads de atendimento duplicadas: 0.
- Relações obsoletas do baseline presentes em produção: 0.
- Maior tabela afetada: `att_conversations`, aproximadamente 7 MB.

As condições de bloqueio atuais não foram acionadas pelos dados de produção.

## Ensaio das migrations

Primeira execução no clone estrutural:

- 14 migrations aplicadas: 0011–0024.
- 9 migrations anteriores ignoradas por já constarem no histórico.
- Nenhum erro.

Segunda execução:

- 0 migrations aplicadas.
- 23 migrations ignoradas por já estarem registradas.
- Idempotência confirmada.

O container da aplicação iniciou conectado ao clone migrado, ficou saudável e respondeu `HTTP 200` em `/api/ready`.

## Comparação estrutural

Itens idênticos:

- 69 relações.
- 223 constraints.
- 150 índices em quantidade total.
- 37 funções.
- Sequências, views, triggers e enums.

Divergências que bloqueiam paridade exata:

1. Colunas presentes apenas na homologação criada pelo baseline:
   - `api_key_usage.message`
   - `google_calendar_integrations.is_active`
   - `google_calendar_integrations.scopes`
   - `google_calendar_integrations.token_expiry`
2. O índice `contacts(account_id, normalized_name)` é incondicional no clone de produção migrado, mas parcial na homologação: `WHERE normalized_name IS NOT NULL`.

Divergências não bloqueantes:

- Os defaults de `api_key_usage.id` e `api_keys.id` aparecem como `gen_random_uuid()` em um banco e `(gen_random_uuid())::text` no outro. Para essas colunas textuais, o efeito é semanticamente equivalente.

## Verificações de código e testes

- `npm run build`: passou.
- `npm run check`: passou.
- Testes unitários da estratégia de migrations: 3 passaram.
- Testes unitários do runner de produção: 15 passaram.
- Teste de integração de transação e rollback do runner: passou.
- Teste de integração da migration 0018: a regra de chave estrangeira funcionou, mas o teste esperava o SQLSTATE `23001`; PostgreSQL retorna corretamente `23503`. O teste deve ser corrigido.
- Teste de roteamento de atendimento: 1 falha reproduzível por divergência entre o erro esperado e o retornado. Não está relacionado à aplicação das migrations, mas deve ser tratado separadamente.
- Varredura de secrets e testes de configuração de release não puderam ser validados neste ambiente porque a imagem local não contém o executável `git` e a extração não contém `.env.example`. Isso não representa um achado de segredo.

## Próximo passo recomendado

Criar uma migration `0025` forward-only que:

1. reconcilie com segurança as quatro colunas residuais, falhando de modo explícito caso contenham dados que precisem ser preservados;
2. recrie o índice de `contacts.normalized_name` com a mesma definição em todos os caminhos de instalação;
3. opcionalmente normalize os defaults UUID se a paridade textual de catálogo for desejada;
4. ajuste a expectativa SQLSTATE do teste da migration 0018;
5. repita o preflight, o clone estrutural, duas execuções do runner e a comparação de catálogo.

## Rollback operacional futuro

As migrations são forward-only. Antes do rollout real, deve ser feito backup pareado do banco e dos artefatos da versão, com tráfego controlado durante a atualização. Em caso de falha após o início do rollout, o rollback seguro é restaurar o backup do banco e a imagem anterior, não executar uma migration reversa improvisada.

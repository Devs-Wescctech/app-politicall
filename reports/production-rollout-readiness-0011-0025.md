# Preparação do rollout de produção — migrations 0011–0025

Data: 2026-08-25

## Resultado

**Pacote de rollout preparado e ensaio técnico aprovado. Produção não foi migrada.**

O gate somente leitura foi executado em produção dentro de `REPEATABLE READ, READ ONLY` e terminou com `ROLLBACK`. Todos os bloqueadores retornaram `PASS` e `preflight_passed=1`.

## Preflight atual de produção

- PostgreSQL 18.1.
- Histórico: 9 registros, último `0010_auth_sessions.sql`.
- Telefones WHU ativos duplicados após normalização: 0 grupos.
- Threads de atendimento duplicadas: 0 grupos.
- Relações residuais inesperadas: nenhuma.
- Colunas residuais inesperadas: nenhuma.
- Conexões WHU com token a verificar no backfill: 0.
- Demandas com status a normalizar: 3.
- Demandas com prioridade a normalizar: 0.
- Maior tabela afetada: `att_conversations`, 7.323.648 bytes.

Somente contagens e metadados agregados foram lidos. Nenhuma linha de negócio, credencial, DDL ou DML foi emitida.

## Ensaio isolado

1. Schema e histórico de produção foram restaurados em PostgreSQL 18.1 descartável.
2. O novo preflight passou e encerrou com rollback.
3. A imagem candidata aplicou 15 migrations, de 0011 até 0025.
4. A aplicação ficou saudável e `/api/ready` retornou HTTP 200.
5. Após reinício, o runner aplicou 0 migrations e reconheceu 24 no histórico.
6. A comparação com homologação retornou diferença total de catálogo igual a 0.
7. O ambiente descartável foi removido ao final.

## Artefatos

- `scripts/preflight-production-migrations-0011-0025.sql`: preflight read-only e fail-closed.
- `docs/deployment/migrations-0011-0025-rollout.md`: gates de candidato, preflight, backup, ensaio, execução, smoke test e restauração.
- `tests/production-migration-rollout.test.ts`: contrato automatizado de segurança do pacote.
- `.codex-tmp/rollout-schema-comparison.json`: evidência de paridade sem dados de negócio.

## Verificações

- TypeScript: passou.
- Testes focados de rollout e migrations: 26/26 passaram.
- Build da imagem candidata: já aprovado no ciclo da migration 0025; não houve alteração em código de runtime ou Dockerfile neste passo.
- Readiness da candidata: HTTP 200 antes e depois do reinício.

## Autorização ainda necessária

Este trabalho não autoriza a execução do Gate 5 em produção. Antes da aplicação real ainda são necessários: janela aprovada, bloqueio de tráfego, backup pareado validado, digest imutável da imagem e confirmação explícita do operador.

Como 0024 e 0025 removem objetos residuais, rollback somente de imagem não está aprovado. Em caso de falha pós-migration, restaurar o banco, uploads e imagem anterior do mesmo par.

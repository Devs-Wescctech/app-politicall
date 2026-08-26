# Validação das migrations 0011–0025

Data: 2026-08-25

## Parecer

**APROVADO para rollout controlado, sujeito ao backup e ao preflight imediatamente anterior à aplicação em produção.**

Produção não foi alterada. A migration 0025 foi aplicada somente em um clone estrutural descartável e no ambiente local de homologação.

## Alteração implementada

A migration `0025_reconcile_remaining_baseline_drift.sql`:

- remove `api_key_usage.message` apenas quando não há valores;
- remove `google_calendar_integrations.scopes` apenas quando não há valores;
- remove `google_calendar_integrations.is_active` apenas quando não contradiz `sync_enabled`;
- transfere `token_expiry` para `token_expiry_date` e bloqueia valores conflitantes;
- normaliza os defaults UUID de `api_key_usage.id` e `api_keys.id`;
- substitui o índice parcial de `contacts(account_id, normalized_name)` pelo índice incondicional do contrato atual;
- executa dentro da transação do runner e é forward-only.

O teste da migration 0018 também foi corrigido para esperar o SQLSTATE PostgreSQL correto, `23503`, ao impedir a exclusão de uma linha referenciada.

## Ensaio em clone estrutural de produção

- PostgreSQL 18.1 descartável.
- Histórico de produção restaurado até 0010.
- Primeira execução: 15 migrations aplicadas, de 0011 até 0025.
- Segunda execução: 0 migrations aplicadas e 24 reconhecidas no histórico.
- Nenhuma condição fail-closed foi acionada pelos dados previamente verificados em produção.

## Paridade após a correção

Comparação entre o clone estrutural migrado e a homologação:

- diferença total de catálogo: **0**;
- relações: 69/69;
- colunas: 890/890;
- constraints: 223/223;
- índices: 150/150;
- funções: 37/37;
- sequências, views, triggers e enums: idênticos.

## Testes e runtime

- Build da imagem de produção: passou.
- TypeScript (`npm run check`): passou.
- Testes focados: 24/24 passaram.
- Incluídos testes da 0025 para caminho feliz, transferência de data, idempotência, índice, preservação em caso de valor residual e rollback em conflito.
- Runner transacional e rollback: passaram.
- Migration 0018: passou após corrigir a expectativa SQLSTATE.
- Homologação: container saudável e `/api/ready` respondeu HTTP 200.
- Histórico da homologação contém `0025_reconcile_remaining_baseline_drift.sql`.

## Rollout de produção

Antes de aplicar em produção:

1. repetir o preflight somente leitura;
2. gerar backup pareado do banco e da imagem atual;
3. controlar o tráfego durante a migration;
4. executar a nova imagem, observar o log do runner e validar `/api/ready`;
5. repetir a comparação estrutural pós-migration.

Como a estratégia é forward-only, uma falha após o início do rollout deve ser recuperada restaurando o backup do banco junto com a imagem anterior. Não usar uma reversão SQL improvisada.

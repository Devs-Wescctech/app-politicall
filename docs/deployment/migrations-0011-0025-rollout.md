# Rollout controlado das migrations 0011–0025

Este runbook prepara a atualização sem autorizar ou executar mudanças em produção. A aplicação das migrations exige uma janela aprovada, backup pareado validado e confirmação explícita do operador.

## Escopo e decisão de rollback

As migrations são forward-only. Como 0024 e 0025 removem objetos residuais, a compatibilidade da imagem anterior não deve ser presumida. Para este rollout, o rollback autorizado é restaurar juntos o dump do banco, o arquivo de uploads e a imagem capturados antes da atualização. Não usar rollback somente de imagem nem SQL reverso improvisado.

## Gate 1 — candidato imutável

1. Gerar a imagem pelo Dockerfile de produção.
2. Registrar a referência imutável e o digest resolvido.
3. Confirmar que a imagem contém migrations 0011–0025 e `dist/migrate-production.js`.
4. Exigir build, TypeScript e testes focados de migrations aprovados.

## Gate 2 — preflight somente leitura

Configure `PGSERVICE` e `PGPASSFILE` conforme [backup-restore.md](backup-restore.md). O arquivo de senha deve ter permissão `0600` no Unix ou ACL restritiva equivalente no Windows. Não coloque credenciais na linha de comando.

Execute:

```text
psql --dbname "service=<production-service-name>" --file scripts/preflight-production-migrations-0011-0025.sql
```

O comando deve terminar com código zero, todas as linhas `gate=PASS` e `preflight_passed=1`. Linhas `INFO` são apenas estimativas de volume. Qualquer `BLOCK`, erro SQL, histórico diferente de 9 registros até 0010 ou ausência do histórico interrompe o rollout para investigação.

O preflight usa `REPEATABLE READ, READ ONLY`, não executa DDL/DML e não imprime linhas de negócio ou credenciais.

## Gate 3 — backup consistente

1. Bloquear tráfego e novas escritas.
2. Parar a aplicação com encerramento gracioso.
3. Confirmar ausência de writers.
4. Executar integralmente **Consistent Backup** de [backup-restore.md](backup-restore.md).
5. Registrar no mesmo change record: dump, uploads, inventário de migrations, hashes SHA-256, referência e digest da imagem anterior.
6. Validar `pg_restore --list`, o arquivo de uploads e todos os hashes.
7. Restaurar o par em ambiente isolado e confirmar que a imagem anterior inicia antes de prosseguir.

## Gate 4 — ensaio isolado do candidato

1. Restaurar uma cópia do schema/histórico capturados em PostgreSQL 18.1 isolado.
2. Iniciar a imagem candidata somente contra o clone.
3. Exigir na primeira execução `applied_count=15`, cobrindo 0011–0025.
4. Reiniciar e exigir `applied_count=0` e `skipped_count=24`.
5. Exigir `/api/ready` HTTP 200.
6. Comparar o catálogo com a homologação aprovada e exigir diferença zero.
7. Destruir o ambiente descartável, mantendo somente o relatório sem credenciais.

## Gate 5 — execução em produção

Este gate requer aprovação explícita. Com tráfego ainda bloqueado e backup validado:

1. Selecionar a imagem candidata pelo digest aprovado.
2. Recriar somente o serviço da aplicação; não recriar nem remover o PostgreSQL.
3. Acompanhar o runner e exigir `baseline_applied=0`, `applied_count=15` e os IDs 0011–0025.
4. Interromper imediatamente se o container não ficar saudável ou se o runner retornar erro.
5. Não editar o histórico de migrations manualmente.

## Gate 6 — verificação antes de reabrir tráfego

1. Exigir `/api/ready` e `/api/health` HTTP 200.
2. Verificar login de tenant e administrador, dashboard, recurso estático e upload existente.
3. Validar uma leitura e uma escrita controlada em fluxo não destrutivo.
4. Confirmar `/api/attendance/realtime` com `101 Switching Protocols` e badge `Conectado`.
5. Revisar logs sem copiar secrets ou dados pessoais para o change record.
6. Confirmar no histórico exatamente 24 migrations do runner e 0025 com hash registrado.
7. Reabrir tráfego somente após todos os itens passarem.

## Falha e restauração

Se qualquer gate pós-migration falhar, manter o tráfego bloqueado, parar a candidata e seguir **Production Restore** de [backup-restore.md](backup-restore.md). O procedimento deve restaurar o banco, uploads e imagem anterior do mesmo par; validar `/api/ready`, `/api/health`, login, upload e atendimento antes de reabrir tráfego.

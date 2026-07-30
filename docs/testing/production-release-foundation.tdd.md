# Evidencia da Release Foundation

Data da evidencia: 2026-07-29.

Esta evidencia cobre as Tasks 1 a 8 do plano [Production Release Foundation](../superpowers/plans/2026-07-29-release-foundation.md). Ela registra resultados no worktree `codex/production-hardening`, sem declarar a aplicacao inteira pronta para producao.

## RED e GREEN das Tasks 1 a 7

| Task | RED observado | GREEN final registrado |
| --- | --- | --- |
| 1. Contexto seguro | Contratos de ignore falharam antes dos patterns e do scanner; revisoes reproduziram leitura indevida de binario/arquivo maior que 5 MB e falhas de I/O. | Contratos de deploy e scanner: 24 testes aprovados. Suite: 52 arquivos, 364 testes aprovados. Scanner sem achados. |
| 2. Dependencias | A regressao Excel passou no grafo antigo; audit de runtime falhou com 11 achados altos. Um override tambem reproduziu incompatibilidade de `WorkbookWriter`. | Regressao Excel/ZIP e `WorkbookWriter` aprovada; suite: 53 arquivos, 370 testes aprovados; audit de runtime sem vulnerabilidades. |
| 3. Runtime Node 24 | O teste rejeitou imports estaticos de Vite/config/nanoid e o Dockerfile ainda usava Node 20 e dependencias de desenvolvimento. | Contrato de runtime/deploy: 2 arquivos, 17 testes aprovados. Bundle emitiu `dist/index.js` sem imports estaticos de desenvolvimento. |
| 4. Migracoes | O runner inexistente falhou com modulo ausente; contratos de imagem/build falharam antes de copiar artefatos e emitir o CLI. | Runner/CLI/integracao opcional: 15 testes aprovados e 1 skipped; suite: 56 arquivos, 391 testes aprovados e 1 skipped. |
| 5. Ciclo de vida | Faltava lifecycle e readiness permanecia 200 durante shutdown; revisoes reproduziram drain HTTP, ordem do banco e sockets pendentes incorretos. | Testes focados finais: 15 aprovados. Suite: 58 arquivos, 403 testes aprovados e 1 skipped. |
| 6. Contrato Portainer | O Compose anterior falhou por imagem mutavel, bind publico, configuracoes/runbooks ausentes; a revisao final reproduziu oito falhas de rede externa e backup/restaure. | Contrato final: 33 testes aprovados; suite: 418 testes aprovados e 1 skipped. Validacao Compose usou referencias sinteticas imutaveis. |
| 7. Gate de publicacao | O workflow anterior falhou em contratos de Node/acoes/seguranca/publicacao; ajustes posteriores reproduziram porta PG16, isolamento de credenciais e artefato de rerun. | Contrato do workflow: 36 testes aprovados. Gate: 422 testes aprovados e 1 skipped, scanner sem achados e audit de runtime limpo. |

Os RED acima sao evidencias historicas das implementacoes e revisoes das Tasks 1 a 7. A verificacao final apos a Task 7 executou `npm run check`, `npm test`, `npm run build`, `npm run security:secrets`, `npm audit --omit=dev --audit-level=high` e `git diff --check`.

| Comando | Resultado |
| --- | --- |
| `npm run check` | Exit 0. |
| `npm test` | Exit 0: 58 arquivos aprovados, 1 skipped; 422 testes aprovados, 1 skipped. |
| `npm run build` | Exit 0: Vite transformou 3.706 modulos; emitiu `dist/index.js` e `dist/migrate-production.js`. |
| `npm run security:secrets` | Exit 0: nenhum achado no conjunto candidato. |
| `npm audit --omit=dev --audit-level=high` | Exit 0: `found 0 vulnerabilities`. |
| `git diff --check` | Exit 0. |

O unico teste skipped continua sendo a integracao de migracao PostgreSQL 16. Ela exige URL descartavel em `MIGRATION_TEST_DATABASE_URL`, esta configurada para GitHub Actions e nao foi tratada como sucesso local.

## Smoke em modo de producao com PostgreSQL 18

O harness ignorado `.superpowers/tmp/production-smoke.ps1` executou um teste isolado com os binarios locais do PostgreSQL 18.4. Criou cluster novo sob `.superpowers/tmp/production-smoke-*`, com autenticacao `trust`, usuario local `postgres`, portas PostgreSQL/HTTP dinamicas e database descartavel. Nenhum banco existente, container remoto ou app em `localhost:5000` foi usado.

1. Executou `dist/migrate-production.js` com `NODE_ENV=production` e URL local sem senha. A primeira execucao aplicou baseline e 8 migracoes aprovadas.
2. Executou o CLI uma segunda vez e confirmou `baseline_applied=0`, `applied_count=0` e `skipped_count=8`.
3. Inseriu somente conta e usuario descartaveis por script Node parametrizado. Email, senha, segredo de sessao e hash bcrypt foram aleatorios, ficaram apenas em memoria/ambiente e nao foram registrados.
4. Iniciou `dist/index.js` com `NODE_ENV=production`, banco isolado, segredo aleatorio e porta HTTP diferente de 5000.
5. Confirmou `200` para `/api/health`, `/api/ready`, `POST /api/auth/login`, `/` e um asset real referenciado pelo HTML; confirmou tambem o listener do processo na porta alternativa.
6. O `finally` encerrou a aplicacao, executou `pg_ctl stop` e removeu o diretorio temporario. A verificacao posterior confirmou ausencia de `production-smoke-*`.

Resultado: smoke aprovado. O harness e o helper de cleanup permanecem somente em `.superpowers/tmp`, ignorados pelo Git.

## Limites locais e handoff externo

- Docker Engine, build/execucao de imagem, Trivy em imagem e GHCR nao foram executados localmente. O workflow CI e a publicacao precisam executar no GitHub.
- A integracao PostgreSQL 16 fica para o GitHub Actions; localmente ela foi skipped por nao haver URL descartavel PG16 fornecida.
- Nao houve deploy em Portainer, alteracao de producao, uso de PostgreSQL existente ou acesso a container remoto.
- O backup pre-alteracao de codigo/uploads ja existe fora do conjunto candidato do Git. O dump adicional local nao foi criado no checkpoint porque o banco de desenvolvimento estava offline. Consulte [backup e restaure](../deployment/backup-restore.md).

Antes de qualquer release publica:

1. Revogar a credencial historica removida e expurgar o blob historico antes de tornar o repositorio publico.
2. Executar o CI no GitHub, incluindo PostgreSQL 16, build da imagem, Trivy e verificacao do artefato antes de publicar no GHCR.
3. Configurar GHCR e Portainer: permissao de pacote, referencia imutavel, rede externa compartilhada e secrets obrigatorios.
4. Executar preflight, backup pareado de banco/uploads/inventario de migracoes e validacao de restore antes do primeiro deploy.

Runbooks: [Portainer](../deployment/portainer-production.md), [backup e restaure](../deployment/backup-restore.md) e [Nginx WebSocket](../deployment/nginx-websocket.conf).

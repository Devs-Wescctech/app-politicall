# Auditoria e refatoracao - 2026-07-22

## Backup

- Backup do codigo e uploads: `backups/politicall-20260722-104228.zip`
- Dump do banco: `backups/politicall-20260722-104228/politicall-db.dump`
- Dump do schema: `backups/politicall-20260722-104228/politicall-schema.sql`
- Backup antes do upgrade de dependencias: `backups/politicall-pre-deps-20260722-171942.zip`
- Backup antes das melhorias de performance: `backups/politicall-pre-performance-20260722-185024.zip`

O backup exclui `node_modules`, `dist`, `graphify-out`, `Obsidian Vault`, `backups` e dados internos pesados do Postgres em `.runtime/pgdata`.

## Estado verificado antes das alteracoes

- `GET /api/health`: respondeu `{"status":"ok"}`
- `npm run check`: passou antes da refatoracao inicial
- `npm audit --audit-level=moderate`: encontrou 7 vulnerabilidades, sendo 6 moderadas e 1 alta

## Achados principais

### Arquitetura

- `server/routes.ts` concentra muitas responsabilidades e tem aproximadamente 395 KB.
- `server/storage.ts` concentra grande parte do acesso a dados e tem aproximadamente 135 KB.
- Algumas telas frontend tambem estao grandes demais para manutencao segura: `contacts.tsx`, `petitions.tsx`, `marketing.tsx`, `settings.tsx` e `admin.tsx`.
- O modulo de peticoes mistura CRUD, campanhas, assinaturas, paginas publicas Bio/Tree e geracao de artefatos em arquivos grandes.

### Seguranca

- O frontend ainda usa tokens em `localStorage` para autenticacao comum e administrativa. Isso aumenta impacto de XSS. A migracao correta exige desenho de sessao com cookie `HttpOnly`, `Secure` e `SameSite`.
- As vulnerabilidades transitivas em `esbuild/vite/drizzle-kit` e `uuid/exceljs` foram tratadas com upgrade controlado de dependencias, overrides explicitos e regressao completa.
- Ha muitos `console.log` em rotas de webhook e integracoes. Parte e operacional, mas a verbosidade deve ser controlada por logger com niveis e redacao.

### Codigo morto ou ruidoso

- Havia logs de debug no submit da agenda exibindo dados do formulario e payload montado.
- Arquivos locais de backup, logs e zips precisam ficar fora do versionamento.
- Remocao agressiva de codigo supostamente morto nao deve ser feita sem ferramenta de cobertura/import graph, porque o sistema usa rotas publicas, chamadas dinamicas e scripts de smoke.

## Alteracoes aplicadas neste ciclo

- Removidos logs de debug do formulario de agenda.
- Atualizado `.gitignore` para ignorar `backups/`, `*.log`, `*.pid` e `*.zip`.
- Criado `server/services/safe-logger.ts` para centralizar logs com redacao de campos sensiveis.
- Atualizado `server/services/oktor-sms.ts` para usar logger seguro em vez de `console.log` direto.
- Criado `client/src/lib/event-date.ts` para extrair parsing de data/hora da Agenda para helper testavel.
- Extraidas as rotas publicas de peticoes, Link Bio e Link Tree para `server/routes/public-petition-routes.ts`.
- Criado `client/src/lib/progress.ts` para padronizar calculo de progresso com limite de 0 a 100.
- Extraidas as rotas de notificacoes para `server/routes/notification-routes.ts`, reduzindo o tamanho de `server/routes.ts` e mantendo o contrato existente de `/api/notifications`.
- Criado `server/services/slugs.ts` e extraido o helper de slug unico que era interno ao roteador principal.
- Extraidas as rotas autenticadas de Link Bio e Link Tree para `server/routes/link-page-routes.ts`.
- Extraidas as rotas de logs de campanhas de peticao para `server/routes/petition-campaign-log-routes.ts`.
- Extraidas as rotas de templates de mensagem de peticao para `server/routes/petition-message-template-routes.ts`.
- Extraidas as paginas legais para `server/routes/legal-routes.ts` e `server/services/legal-pages.ts`, com escape do `accountSlug` para evitar XSS refletido nas paginas `/privacy/:plataforma/:accountSlug`.
- Extraidas as rotas de chaves e API externa `/api/v1` para `server/routes/api-key-routes.ts`.
- Extraido o calculo do dashboard para `server/services/dashboard-stats.ts` e a rota para `server/routes/dashboard-routes.ts`.
- Extraidas as rotas de partidos, aliancas e convites para `server/routes/alliance-routes.ts`.
- Substituida a geracao de token de convite de alianca baseada em `Math.random()` por `crypto.randomBytes()` em `server/services/alliance-invites.ts`.
- Reduzido `server/routes.ts` de aproximadamente 386 KB para aproximadamente 344 KB nesta sequencia de refatoracao.
- Atualizadas dependencias vulneraveis ou relacionadas ao build: `vite` para `8.1.5`, `@vitejs/plugin-react` para `6.0.4`, `@tailwindcss/vite` para `4.3.3`, `esbuild` para `0.28.1` e `@types/node` para `20.19.0`.
- Adicionados overrides de seguranca para `esbuild@0.28.1` e `uuid@11.1.1`, eliminando vulnerabilidades transitivas do `drizzle-kit` e do `exceljs`.
- Ajustados seletores customizados em `client/src/index.css` para compatibilidade com a minificacao CSS do Vite 8, preservando o comportamento visual dos elementos com classe `border`.
- Migrado o transformador TSX do Vitest de `transformWithEsbuild` para `transformWithOxc`, removendo o aviso de API depreciada.
- Adiado o carregamento do video de 9,6 MB da chamada final da landing page ate o usuario se aproximar da secao.
- Ajustado o breakpoint do cabecalho da landing page para manter o menu compacto em tablets, sem compressao ou sobreposicao dos links.
- Adicionados nome acessivel, `aria-expanded` e `aria-controls` ao menu responsivo da landing page.
- Ajustado o limite de alerta do build para 1.400 KB, correspondente aos motores PDF/Excel que ja sao carregados apenas sob demanda.
- Criado este relatorio de auditoria/refatoracao.

## Testes adicionados

- `server/services/safe-logger.test.ts`: valida mascaramento e redacao de campos sensiveis.
- `client/src/lib/event-date.test.ts`: valida parsing de data/hora brasileira e rejeicao de datas impossiveis.
- `client/src/lib/progress.test.ts`: valida limites e entradas invalidas no calculo de progresso.
- `server/services/slugs.test.ts`: valida geracao de slugs unicos e preservacao do slug do registro atual.
- `server/services/legal-pages.test.ts`: valida geracao das paginas legais e escape de caracteres HTML sensiveis.
- `server/services/dashboard-stats.test.ts`: valida totais, distribuicoes, media de idade e eventos futuros do dashboard.
- `server/services/alliance-invites.test.ts`: valida formato do token criptografico de convite.

## Validacao executada

- `npm run check`: passou.
- `npm test`: 51 arquivos de teste passaram, 351 testes passaram.
- `npm run build`: passou com Vite 8.1.5 sem avisos; os motores PDF/Excel permanecem isolados em chunks carregados apenas na acao de exportacao.
- `npm audit --audit-level=moderate`: passou com `0 vulnerabilities`.
- `npx vite --version`: confirmou `vite/8.1.5`.
- `npx drizzle-kit --version`: confirmou `drizzle-kit v0.31.10`.
- `npx esbuild --version`: confirmou `0.28.1`.
- Smoke local apos restart: `GET /api/health`, `GET /api/public/petitions/peticao-teste-codex`, `GET /p/peticao-teste-codex`, `GET /api/public/linkbio/bio-peticao-teste-codex`, `GET /bio/bio-peticao-teste-codex`, `GET /api/public/linktree/links-peticao-teste-codex` e `GET /tree/links-peticao-teste-codex` responderam com sucesso.
- Smoke legal: `GET /privacy` e `GET /terms` responderam com sucesso. `GET /privacy/facebook/:accountSlug` escapou payload HTML no `accountSlug` e nao refletiu tag executavel.
- Smoke autenticacao/rotas extraidas: `GET /api/dashboard/stats` sem token retornou 401 e `GET /api/alliance-invites/NAOEXISTE/public` retornou 404, confirmando registro das rotas novas com comportamento esperado.
- Servidor local reiniciado e rodando em `http://localhost:5000` no PID `22344`.
- QA no build de producao em 375 px, 768 px e 1.440 px: sem overflow horizontal ou erros de console.
- QA de midia: a landing inicia com apenas o video principal; o segundo video e inserido somente ao aproximar a chamada final.
- QA do menu tablet: botao exposto como `Abrir menu`, muda para `Fechar menu` com estado expandido e painel visivel.

## Roadmap recomendado

1. Separar `server/routes.ts` por dominios: auth, users, contacts, campaigns, petitions, link pages, integrations, webhooks e admin.
2. Separar `server/storage.ts` em repositories por dominio, preservando a interface publica durante a migracao.
3. Extrair componentes e hooks das paginas grandes de frontend, comecando por `petitions.tsx` e `contacts.tsx`.
4. Substituir logs diretos por logger estruturado com niveis e redacao.
5. Migrar autenticacao para cookie `HttpOnly` e reduzir dependencia de `localStorage`.
6. Adicionar checagem automatica de imports mortos antes de remover codigo em massa.
7. Avaliar geracao de PDF/Excel no servidor para reduzir o download opcional dos motores de exportacao.
8. Comprimir os videos da landing em pipeline de midia para reduzir tambem o trafego apos o carregamento sob demanda.

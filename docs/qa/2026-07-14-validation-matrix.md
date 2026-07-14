# Matriz de validação - 2026-07-14

## Automatizado

- `npx vitest run server/services/petitions.test.ts server/services/system-sync-security.test.ts client/src/lib/public-resource-state.test.ts tests/deployment-config.test.ts`
- `npx vitest run server/services/excel.test.ts client/src/lib/excel.test.ts`
- `npx vitest run server/services/webhook-security.test.ts server/services/ai-config-security.test.ts`
- `npx vitest run server/services/upload-security.test.ts server/security-headers.test.ts server/services/ai-config-secrets.test.ts server/html-escape.test.ts`
- `npm run check`
- `npm test`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`

## Resultado

- Testes completos: 41 arquivos, 329 testes aprovados.
- Testes focados mais recentes: aprovados.
- TypeScript: aprovado.
- Build: aprovado com aviso conhecido de PostCSS e chunks grandes lazy (`pdfmake`, `exceljs`).
- Audit alto: aprovado; restam vulnerabilidades moderadas em `exceljs` via `uuid`.
- Smoke do servidor: não executado nesta thread por ausência de `DATABASE_URL`, `PROD_DATABASE_URL` e `SESSION_SECRET` no ambiente local.

## Cobertura adicionada

- Normalização de campos de coleta/obrigatoriedade em petições.
- Estado de recurso público para loading/ready/error.
- Política de System Sync.
- Bootstrap de migração `0008`.
- CI com testes e audit alto.
- Helpers Excel sem `xlsx`.
- Sanitização de configuração de IA.
- Redação/sumarização de webhooks.
- Validação HMAC de webhooks Meta/WhatsApp/X.
- Validação de uploads por magic bytes.
- Headers HTTP de segurança.
- Criptografia/preservação de secrets sociais de IA.
- Escape HTML em SSR público.
- Code splitting por rota e import dinâmico de PDF/Excel.

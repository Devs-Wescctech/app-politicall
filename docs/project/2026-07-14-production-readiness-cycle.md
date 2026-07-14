# Ciclo de prontidão para produção - 2026-07-14

## Escopo executado

- Corrigido o fluxo de PetiçõesBR em que um campo podia ser marcado como obrigatório sem estar visível no formulário público.
- Adicionados estados de erro para páginas públicas de petição, Link Bio e Link Tree, removendo spinner infinito em 404/erro.
- Travado o System Sync administrativo por padrão via `ENABLE_SYSTEM_SYNC=true`, com exportação de variáveis apenas allowlisted e importação de secrets dependente de `ALLOW_SYSTEM_SYNC_SECRET_IMPORT=true`.
- Atualizado bootstrap local para aplicar a migração `0008_att_messages_external_id_unique.sql`.
- CI atualizado para rodar `npm test` e bloquear `npm audit --omit=dev --audit-level=high`.
- Substituído `xlsx` por `exceljs` nos fluxos de importação/exportação de Excel.
- Atualizado `drizzle-orm` para `0.45.2`.
- Sanitizadas respostas de configuração de IA para não devolver tokens/secrets de provedores.
- Reduzidos logs brutos de webhooks, trocando body/headers completos por resumo e headers redigidos.
- Validadas assinaturas HMAC de webhooks Meta/WhatsApp (`X-Hub-Signature-256`) e X/Twitter (`x-twitter-webhooks-signature`) antes do ACK/processamento.
- Endurecidos uploads de imagens/PDF com validação por magic bytes, incluindo fluxo chunked.
- Adicionados rate limits em login, login admin e validação de senha admin.
- Adicionados headers HTTP de hardening (`nosniff`, `SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS em produção).
- Novos secrets sociais de IA passam a ser criptografados no storage; campos sensíveis vazios não sobrescrevem credenciais existentes.
- Corrigido escape HTML nos SSRs públicos de Open Graph.
- Aplicado code splitting por rota e carregamento dinâmico de `pdfmake`/`exceljs` para exportações.

## Status

- TypeScript: aprovado.
- Testes automatizados: 41 arquivos, 329 testes aprovados.
- Build de produção: aprovado.
- Audit alto de produção: aprovado.
- Smoke do servidor: não executado nesta thread por ausência de variáveis locais de banco/JWT.

## Riscos remanescentes

- `exceljs` mantém duas vulnerabilidades moderadas via `uuid`; o `npm audit fix --force` sugere downgrade quebrante e não foi aplicado.
- Build ainda emite aviso de PostCSS (`from` ausente em plugin) e chunks grandes lazy para `pdfmake`/`exceljs`.
- Segredos sociais existentes em texto puro serão criptografados quando forem salvos novamente; novos valores já são persistidos criptografados.
- Autenticação ainda usa JWT longo/localStorage e precisa de revisão estrutural.

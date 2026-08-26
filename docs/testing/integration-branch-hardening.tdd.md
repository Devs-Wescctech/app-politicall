# Evidência TDD — endurecimento da branch de integração

Data: 2026-08-26

## Objetivo

Preparar o fluxo local para uma futura Pull Request sem enviar segredos,
temporários ou uma configuração de desenvolvimento capaz de atingir o banco de
produção por engano.

## Garantias verificadas

| Garantia | Evidência RED | Evidência GREEN |
|---|---|---|
| O seed exige confirmação explícita e recusa produção | `npx vitest run tests/development-database-safety.test.ts` falhou porque o módulo de proteção ainda não existia | 4 testes passaram no alvo e na suíte completa |
| O scanner ignora exclusões intencionais sem ignorar falhas reais de I/O | `tests/release-secret-scan.test.ts` falhou com `removed.txt:io-stat:0` | 13 testes do scanner passaram e `npm run security:secrets` retornou sucesso |
| Configurações local/homologação usam somente placeholders versionáveis | Scanner sinalizou quatro URLs com credenciais literais | Scanner passou e os testes de configuração passaram |
| Contratos de atendimento e manifesto de migração refletem a implementação atual | A suíte esperava código de erro antigo e acoplava o setup ao nome literal da migração | Os 67 testes direcionados passaram |

## Validação final

- Node usado nos gates: `24.19.0`.
- TypeScript: `tsc --noEmit` passou.
- Vitest: 161 arquivos passaram, 5 condicionais foram ignorados; 1.049 testes
  passaram e 7 condicionais foram ignorados.
- Build de produção: passou.
- Scanner de segredos: passou.
- Auditoria de dependências: zero vulnerabilidades reportadas.
- Git LFS: `git lfs fsck` passou.
- Playwright E2E: 10 cenários passaram em Chromium contra PostgreSQL 16
  descartável; 24 migrações incrementais e o baseline foram aplicados antes dos
  cenários.
- Estabilidade concorrente: os testes de limite de sessão e encaminhamento de
  upgrade WebSocket reproduziram falhas por pressupor ordem/temporização; após
  corrigir somente a sincronização das especificações, os dois arquivos passaram
  três vezes consecutivas e a suíte paralela completa voltou a passar.

## Lacunas conhecidas

- O projeto não possui script de cobertura configurado; portanto, não foi
  produzido percentual de cobertura nesta execução.
- Cinco arquivos Vitest e sete testes permanecem condicionais ao ambiente, como
  declarado pela própria suíte.

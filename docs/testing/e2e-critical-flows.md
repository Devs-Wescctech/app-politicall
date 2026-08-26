# Testes E2E críticos

A suíte Playwright valida as jornadas que não podem regredir antes de uma entrega:

- autenticação administrativa;
- abertura dos módulos principais sem erro HTTP 5xx;
- criação e pesquisa de eleitor;
- criação de demanda com categoria e responsável;
- criação e abertura pública de petição;
- atendimento assumido em tempo real e horário da mensagem recebido do provedor.
- criação e edição de linha política, vínculo com aliança, filtro e badge da linha;
- edição de alianças legadas sem linha política.

## Ecossistema de linhas políticas

O arquivo `tests/e2e/alliance-lines.spec.ts` cobre a jornada administrativa completa: cria uma linha personalizada, altera sua cor, vincula uma nova aliança, filtra a página pela linha e confirma o badge no aliado. O mesmo spec mantém uma fixture legada com `line_id` nulo para verificar a exibição de `Sem linha` e a edição sem migração forçada.

O setup e o teardown desse fluxo usam somente o gabinete de desenvolvimento e identificadores E2E fixos. A limpeza remove a aliança pelo nome `Aliado E2E Linha Politica`, o registro legado pelo id `e2e-legacy-alliance-line` e a linha pelo nome `Linha E2E Playwright`; nenhum `DELETE` usa condição ampla sobre registros reais.

O fluxo também verifica ausência de warnings do React e captura a página nas larguras de 375 px e 1440 px, rejeitando overflow horizontal do documento. O resumo por linha pode rolar horizontalmente dentro do próprio componente no viewport móvel.

## Execução local

O banco local deve estar preparado por `npm run dev`/`scripts/setup-dev-db.ts`, e o arquivo `.env.local` deve conter `DATABASE_URL` e `SESSION_SECRET`.

```powershell
npx playwright install chromium
npm run test:e2e -- --project=chromium
```

A aplicação de teste usa a porta `5010`, sem interferir na instância local da porta `5001`. As fixtures usam registros com prefixo `E2E Playwright`, são reinicializadas antes de cada execução e removidas ao final.

Em falhas, consulte `playwright-report/` e `test-results/`. Esses diretórios, assim como a sessão autenticada em `playwright/.auth/`, não são versionados.

## CI

O job `Critical Browser Flows` cria um PostgreSQL descartável, aplica o schema e as seeds, instala Chromium e executa a suíte. A construção da imagem Docker depende da aprovação desse job. Relatórios e traces ficam disponíveis como artefatos por sete dias.

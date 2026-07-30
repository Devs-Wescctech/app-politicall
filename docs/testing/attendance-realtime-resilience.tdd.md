# Evidencia do Atendimento Realtime

Data da evidencia: 2026-07-30.

Esta evidencia cobre a Task 6 do plano [Attendance Realtime Resilience](../superpowers/plans/2026-07-29-attendance-realtime-resilience.md). Ela valida o build local de producao com PostgreSQL 18 descartavel, sem tocar no container de producao, Portainer, Nginx externo, DNS ou banco existente.

## Escopo Validado

- Tela `Atendimentos` com conversa seeded e mensagem inicial.
- WebSocket autenticado por cookie em `/api/attendance/realtime`.
- Fallback HTTP quando o WebSocket e bloqueado.
- Recebimento de mensagem inbound via webhook interno `/api/webhooks/attendance/webchat/<connectionId>`.
- Viewports: desktop `1440x900`, tablet `768x1024`, mobile `375x812`.
- Check leve de acessibilidade: botoes sem nome, campos sem label/placeholder, IDs duplicados e regiao `role=status`.

Nao foi executado `axe-core`, porque o pacote nao estava disponivel no runtime local do browser QA. Em vez disso, foi usado um check automatizado leve e direcionado aos problemas observados.

## RED Observado

| Falha | Causa | Correcao |
| --- | --- | --- |
| Conversa retornava na API, contador do grupo subia, mas o item nao ficava clicavel quando a lane aberta estava vazia. | `ConversationList` iniciava sempre em `waiting`; quando a conversa mudava para outro grupo, o operador via contador sem item expandido. | Autoexpansao do primeiro grupo com itens antes da primeira escolha manual do operador. |
| Browser QA falhava em mobile com mensagem nova oculta. | O runner buscava o primeiro texto global e encontrava o preview oculto da lista, nao a area do chat. | Runner passou a validar o texto dentro de `area-messages`. |
| Check leve de acessibilidade acusou botoes sem nome. | Tres botoes icon-only nao tinham `aria-label`/`title`: manual, notificacoes e menu da conversa. | Labels adicionadas e teste fonte criado. |
| Tentativa inicial de seis logins separados bateu rate limit `429`. | O runner autenticava cada viewport separadamente. | Runner autentica uma vez e reutiliza a sessao nos cenarios. |

## GREEN Final

Build usado: `npm run build` aprovado antes do browser QA final.

Runtime local:

- Banco PostgreSQL 18 descartavel em `.superpowers/tmp/attendance-qa-*`.
- App iniciado via `node dist/index.js` em porta local dinamica.
- Seed sintetico de conta, usuario, conexao, conversa e mensagem inicial.
- Segredos, senha e URL do banco foram aleatorios e nao foram registrados nesta evidencia.

Resultado do browser QA final: todos os 6 cenarios aprovados.

| Cenario | Transporte | Viewport | Status da UI | WebSockets | A11y leve | Screenshot SHA256 |
| --- | --- | --- | --- | --- | --- | --- |
| `allowed-desktop` | WebSocket permitido | `1440x900` | `Conectado` | 1 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `29942d49c412e967488a2753d7b311a0c617ab4e864c0d43d4b221d25017ea6a` |
| `allowed-tablet` | WebSocket permitido | `768x1024` | `Conectado` | 1 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `65bb08c257e90dd185bd6aeea5951e95316c1875bcfb0cc30cf855a6aa6fa7d5` |
| `allowed-mobile` | WebSocket permitido | `375x812` | `Conectado` | 1 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `3a6123e4294d6281e1734a25c2eec57ff9a3daf6dc74e9bbfb260834c36113ca` |
| `blocked-desktop` | WebSocket bloqueado | `1440x900` | `Sincronizacao automatica` | 0 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `96277d57a50103982cde2f270e47b469e0e1e0d65585de3d3c883c39508422d1` |
| `blocked-tablet` | WebSocket bloqueado | `768x1024` | `Sincronizacao automatica` | 0 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `63a5a48dbce21930db25183dc85b1adbcf0dfadb2607f83a534a2ac47ed4e947` |
| `blocked-mobile` | WebSocket bloqueado | `375x812` | `Sincronizacao automatica` | 0 | 0 botoes sem nome, 0 campos sem label, 0 IDs duplicados | `0a98702119be5f9a61e51e409c2b68851062c52ec774467b1043c12a91a47091` |

Artefatos locais ignorados pelo Git:

- Resultado JSON: `.superpowers/artifacts/attendance-realtime-resilience-2026-07-30T15-09-05-132Z/result.json`
- Screenshots: `.superpowers/artifacts/attendance-realtime-resilience-2026-07-30T15-09-05-132Z/*.png`
- Runner temporario: `.superpowers/tmp/run-attendance-browser-qa.mjs`

## Testes Automatizados Focados

| Comando | Resultado |
| --- | --- |
| `npm test -- client/src/components/attendance/conversation-list-lanes.test.ts` | Exit 0: 1 arquivo, 2 testes aprovados. |
| `npm test -- client/src/components/icon-button-accessibility.test.ts client/src/components/attendance/conversation-list-lanes.test.ts` | Exit 0: 2 arquivos, 3 testes aprovados. |
| `npm run build` | Exit 0 antes do QA final. |

## Handoff De Deploy

O arquivo [nginx-websocket.conf](../deployment/nginx-websocket.conf) documenta a rota exata de WebSocket e os headers obrigatorios. O runbook [portainer-production.md](../deployment/portainer-production.md) agora exige validacao externa do status `Conectado` e HTTP 101 antes de liberar trafego.

O fallback `Sincronizacao automatica` foi validado como resiliencia, mas nao substitui a configuracao correta de WebSocket em producao.

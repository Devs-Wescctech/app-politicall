# Attendance Compact Layout and Message Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liberar a altura ocupada pela navegação superior e impedir duplicação de mensagens enviadas pelo WHU.

**Architecture:** O estado das visualizações continuará em `attendance.tsx`, mas será controlado e exposto por um componente compacto reutilizável. O backend usará o normalizador de ID remoto existente e uma restrição de banco para garantir idempotência.

**Tech Stack:** React, TypeScript, TanStack Query, Express, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Não enviar mensagens reais durante a validação.
- Preservar os registros sincronizados que possuem ID externo WHU.
- Manter acessibilidade por nome, foco e teclado no seletor de visualização.

---

### Task 1: Corrigir a identidade da mensagem enviada

**Files:**
- Modify: `server/attendance-routes.ts`
- Test: `server/services/attendance-message-identity.test.ts`
- Create: `server/services/attendance-message-identity.ts`

**Interfaces:**
- Produces: `extractAttendanceExternalMessageId(remote: unknown): string | null`.

- [ ] Escrever teste que cobre `messageSentId`, `messagesSentIds[0]`, `id` e resposta vazia.
- [ ] Executar `npm.cmd test -- server/services/attendance-message-identity.test.ts` e confirmar falha.
- [ ] Implementar o extrator e usá-lo no endpoint `POST /api/attendance/conversations/:id/send`.
- [ ] Reexecutar o teste e confirmar aprovação.

### Task 2: Impedir corrida de inserção

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0008_att_messages_external_id_unique.sql`

**Interfaces:**
- Produces: índice único parcial `(account_id, external_message_id)` quando o ID não é nulo.

- [ ] Adicionar o índice Drizzle à tabela `att_messages`.
- [ ] Criar SQL idempotente com `CREATE UNIQUE INDEX IF NOT EXISTS`.
- [ ] Aplicar a migration no banco local e verificar o índice no catálogo PostgreSQL.

### Task 3: Compactar a navegação do atendimento

**Files:**
- Create: `client/src/components/attendance/AttendanceViewSwitcher.tsx`
- Modify: `client/src/pages/attendance.tsx`
- Modify: `client/src/components/attendance/ConversationList.tsx`

**Interfaces:**
- Produces: `AttendanceViewSwitcher({ value, onValueChange, compact })`.

- [ ] Tornar as abas controladas pelo estado `activeView`.
- [ ] Remover a faixa superior e mover o acionamento de nova conversa para o botão `+` existente.
- [ ] Renderizar o seletor na coluna esquerda da Caixa e no topo das demais visualizações.
- [ ] Confirmar que a página mantém `h-full min-h-0` e o chat cresce no espaço liberado.

### Task 4: Limpar duplicatas comprovadas e verificar

**Files:**
- No source file changes.

- [ ] Confirmar que os registros locais sem ID correspondem por conversa, direção, corpo e segundo aos registros WHU.
- [ ] Excluir somente os IDs locais `3e28ed09-8623-4200-98c2-8ad7225366c6` e `8433f698-9a21-4073-afac-0f88ff6a9f26` em transação.
- [ ] Consultar novamente as mensagens recentes e confirmar uma linha para cada envio.
- [ ] Executar `npm.cmd test`, `npm.cmd run check` e `npm.cmd run build`.
- [ ] Validar visualmente o seletor e a altura do chat sem realizar envio.

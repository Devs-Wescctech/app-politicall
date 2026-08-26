# Atendimento Omnichannel

## Objetivo

O módulo de Atendimentos centraliza conversas, contatos, demandas e retornos de agenda. O status de tempo real do navegador é apresentado separadamente da disponibilidade dos provedores para evitar que uma conexão WebSocket ativa seja confundida com WhatsApp, SMS ou e-mail configurados.

O listener de tempo real processa exclusivamente upgrades destinados a `/api/attendance/realtime`. Upgrades de outras rotas permanecem disponíveis para o servidor de desenvolvimento ou outros serviços WebSocket, enquanto variações não literais da rota protegida continuam sendo rejeitadas.

## Saúde dos canais

### `GET /api/attendance/channels/health`

- Autenticação: sessão válida e uma permissão de leitura de atendimento.
- Retorno: estado sanitizado de WhatsApp, SMS e e-mail.
- Estados: `operational`, `warning`, `error` e `inactive`.
- Capacidades: `canSend` e `canReceive` por canal.
- Segurança: tokens, senhas e valores de credenciais nunca são retornados.

O SMS exige `account`, `code`, `client` e `endpoint`. O e-mail diferencia envio (SMTP, SendGrid ou Locaweb) de recebimento (IMAP). O WhatsApp considera conexões ativas e o último teste registrado.

## Retorno na agenda

### `POST /api/attendance/conversations/:id/follow-up`

- Autenticação: sessão válida e permissão `attendanceReply` ou `agenda`.
- Escopo: a conversa precisa pertencer à mesma conta do usuário.
- Body:

```json
{
  "title": "Retorno - Maria Silva",
  "startDate": "2026-08-12T13:00:00.000Z",
  "endDate": "2026-08-12T13:30:00.000Z",
  "reminderMinutes": 15
}
```

- Sucesso: `201` com o evento criado.
- Erros: `400` para datas ou campos inválidos; `404` para conversa inexistente; `401/403` para autenticação ou permissão.
- Persistência: o evento guarda `contactId` e `attendanceConversationId`.
- Auditoria: registra `conversation.follow_up.created` no histórico do atendimento.

Na Agenda, eventos vinculados exibem uma ação para reabrir diretamente a conversa de origem.

## Validação local

```powershell
npm run check
npx vitest run --testTimeout=60000
npm run build
```

A migração `0012_attendance_follow_up.sql` deve ser aplicada pelo executor de migrações antes de usar o agendamento de retorno.

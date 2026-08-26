# Conexões WHU do Atendimento

Todos os endpoints exigem uma sessão autenticada do tenant. A leitura e as mutações de gerenciamento exigem a permissão `attendanceSettings`. Nenhuma resposta expõe token, fingerprint, ciphertext ou segredo de webhook.

## GET `/api/attendance/connections`

Lista as conexões do tenant para o gerenciador de Atendimento.

### Resposta `200`

```json
[
  {
    "id": "<CONNECTION_ID>",
    "name": "Gabinete",
    "channel": "whatsapp",
    "provider": "wescctech",
    "phoneNumber": "5551999990000",
    "status": "connected",
    "hasToken": true,
    "lastTestedAt": "2026-08-17T12:00:00.000Z",
    "lastError": null,
    "webhookSetupUrl": "https://politicall.example/api/webhooks/attendance/whatsapp/<CONNECTION_ID>"
  }
]
```

`webhookSetupUrl` é construído no servidor a partir de `PUBLIC_APP_URL`. Quando a URL pública não é válida ou não está configurada, o campo é `null` e o cliente deve omitir a ação de copiar. O campo nunca contém segredo armazenado. `lastError` é uma mensagem operacional sanitizada e estável.

Erros: `401` para sessão inválida, `403` sem permissão e `500` para falha de leitura.

## POST `/api/attendance/connections`

Cria uma conexão. Para WHU, `name`, `phoneNumber` e `token` são obrigatórios. O telefone é normalizado para dígitos e o token é criptografado; ambos são validados contra duplicidade ativa.

Erros estáveis: `WHU_NAME_REQUIRED`, `WHU_PHONE_REQUIRED`, `WHU_TOKEN_REQUIRED`, `WHU_DUPLICATE_PHONE` e `WHU_DUPLICATE_TOKEN`.

## PATCH `/api/attendance/connections/:id`

Atualiza exatamente a conexão informada. Omitir `token`, enviá-lo vazio ou enviar a máscara `***` preserva o token atual. Um token real realiza rotação. `status: "disabled"` desativa sem apagar histórico; `status: "pending"` reativa para novo teste.

Erros: `404` quando o ID não pertence ao tenant e os mesmos códigos de validação/duplicidade da criação.

## POST `/api/attendance/connections/:id/test`

Testa somente a conexão identificada, atualiza `status`, `lastTestedAt` e `lastError`, e devolve a visão operacional sanitizada. Uma conexão desativada retorna `409` com `CHANNEL_CONNECTION_DISABLED` sem consultar o provedor.

## DELETE `/api/attendance/connections/:id`

Operação administrativa de remoção segura: conexões com histórico são desativadas atomicamente; somente conexões sem referências podem ser apagadas. A interface comum usa desativação por `PATCH` para preservar o registro.

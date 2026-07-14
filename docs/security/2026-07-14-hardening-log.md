# Hardening de segurança - 2026-07-14

## Alterações aplicadas

- `server/services/system-sync-security.ts`: política fail-closed para System Sync.
- `server/services/ai-config-security.ts`: sanitização de respostas de configuração de IA.
- `server/services/webhook-security.ts`: redator de headers e sumarizador de payloads de webhook.
- `server/services/webhook-security.ts`: validação HMAC de webhooks Meta/WhatsApp e X/Twitter.
- `server/services/upload-security.ts`: detecção de imagem/PDF por magic bytes.
- `server/services/ai-config-secrets.ts`: criptografia de secrets sociais e preservação de secrets existentes em saves vazios.
- `server/security-headers.ts`: headers HTTP de hardening.
- `server/html-escape.ts`: escape para HTML/atributos em SSR público.
- `.github/workflows/build.yml`: audit alto agora falha o pipeline.
- Dependências: `drizzle-orm` atualizado e `xlsx` removido.

## Controles adicionados

- System Sync desabilitado por padrão.
- Secrets de IA removidos das respostas API.
- Headers sensíveis de webhook redigidos em logs.
- Payload bruto de webhook não é mais registrado nos pontos públicos principais.
- Webhooks Meta/WhatsApp/X rejeitam assinatura ausente ou inválida antes do ACK.
- Uploads de avatar, background, imagens de petição, PDF e chunked upload validam bytes reais.
- Login, admin login e validação de senha admin têm rate limit por janela fixa.
- Headers `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS em produção.
- SSRs públicos de convite, apoio e petição escapam dados vindos do banco/URL antes de inserir em HTML.
- Gate CI com testes e audit alto.

## Pendências de segurança

- Migrar sessão/JWT para estratégia com refresh token curto e cookie httpOnly.
- Definir CSP completa após inventário de domínios externos e validação da SPA.
- Rotacionar/regravar secrets sociais já existentes para criptografá-los no banco; novos saves já criptografam.
- Avaliar rate limit distribuído (Redis/Postgres) para produção multi-instância; o limiter atual é em memória por processo.

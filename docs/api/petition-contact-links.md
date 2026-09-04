# Contatos pós-assinatura de petições

## Regra de negócio

Cada petição pode configurar destinos próprios de WhatsApp, Facebook, X/Twitter e Telegram. Os botões exibidos antes da assinatura continuam compartilhando o link da petição. Depois da confirmação, o diálogo mostra apenas os canais oficiais configurados, sob o título **Fale com o político**.

Petições sem canais configurados permanecem válidas e não exibem a seção de contato. Remover o conteúdo de um campo na edição grava `null` e remove o respectivo botão.

## Campos da API privada

Os endpoints autenticados `POST /api/petitions` e `PATCH /api/petitions/:id` aceitam:

| Campo | Formato |
| --- | --- |
| `contactWhatsapp` | Telefone internacional com país e DDD, entre 10 e 15 dígitos após normalização |
| `contactFacebookUrl` | URL HTTPS em `facebook.com` ou subdomínio oficial |
| `contactXUrl` | URL HTTPS em `x.com`, `twitter.com` ou subdomínio oficial |
| `contactTelegramUrl` | URL HTTPS em `t.me`, `telegram.me` ou subdomínio oficial |

Exemplo com identidades reservadas para teste:

```json
{
  "contactWhatsapp": "+55 (51) 99999-0000",
  "contactFacebookUrl": "https://facebook.com/politicall-e2e",
  "contactXUrl": "https://x.com/politicall_e2e",
  "contactTelegramUrl": "https://t.me/politicall_e2e"
}
```

O WhatsApp é persistido somente com dígitos. Campos vazios são convertidos para `null`. Valores não vazios inválidos retornam `400` com um dos erros:

- `Informe um WhatsApp com código do país e DDD`
- `Informe uma URL HTTPS válida do Facebook`
- `Informe uma URL HTTPS válida do X/Twitter`
- `Informe uma URL HTTPS válida do Telegram`

Os endpoints privados mantêm a permissão `petitions`, a proteção CSRF e o isolamento por `accountId`. O cliente não pode escolher `accountId` ou `userId`; esses valores vêm da sessão autenticada.

## Resposta pública

`GET /api/public/petitions/:slug` inclui os quatro campos como strings normalizadas ou `null`. A resposta é montada por uma lista explícita de campos e não expõe credenciais, tokens, `accountId` ou `userId`.

No diálogo pós-assinatura, o WhatsApp gera `https://wa.me/<numero>`. Os demais destinos usam as URLs validadas. Links externos abrem em nova aba com `noopener,noreferrer`.

## Banco e compatibilidade

A migration aditiva `0026_petition_contact_social_links.sql` cria quatro colunas opcionais com `ADD COLUMN IF NOT EXISTS`. Não há preenchimento retroativo nem alteração das petições existentes.

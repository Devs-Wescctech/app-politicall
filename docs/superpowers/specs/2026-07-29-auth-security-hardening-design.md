# Endurecimento de autenticacao e seguranca HTTP

## Contexto

O Politicall usa JWT com validade de 30 dias armazenado em `localStorage`, inclusive para administracao. Esse modelo amplia o impacto de XSS e nao fornece revogacao individual de sessao. O `SESSION_SECRET` tambem e usado como chave para criptografar configuracoes de integracao, impedindo rotacao independente.

Esta etapa sera executada depois da fundacao de release estar verde.

## Objetivos

- Remover tokens de autenticacao do `localStorage`.
- Adotar cookies `HttpOnly`, `Secure` em producao e `SameSite=Lax`.
- Ter sessao curta, renovacao rotativa e revogacao.
- Proteger operacoes autenticadas contra CSRF.
- Separar assinatura de sessao da criptografia de dados.
- Preservar login comum, administracao, impersonacao e WebSocket.
- Nao desconectar a producao antes de existir plano de migracao.

## Modelo de sessao

Sera criada a tabela `auth_sessions` com:

- `id`
- `account_id`
- `user_id`
- `kind` (`user` ou `admin`)
- `refresh_token_hash`
- `expires_at`
- `rotated_from_id`
- `revoked_at`
- `created_at`
- `last_used_at`
- metadados limitados de dispositivo e IP

O access token continuara sendo JWT, com validade de 15 minutos, enviado apenas em cookie HttpOnly. O refresh token sera aleatorio, armazenado somente como hash e rotacionado a cada uso.

- Sessao comum: refresh de ate 7 dias.
- Sessao administrativa: refresh de ate 4 horas.
- Logout revoga a sessao no banco e limpa cookies.
- Reutilizacao de refresh token antigo revoga a familia da sessao.
- Alteracao de senha revoga sessoes anteriores do usuario.

## Cookies

- `politicall_access`: access token comum.
- `politicall_refresh`: refresh token comum, restrito ao path de renovacao.
- `politicall_admin_access`: access token administrativo.
- `politicall_admin_refresh`: refresh administrativo.
- `politicall_csrf`: valor legivel pelo frontend para double-submit.

Todos usam `HttpOnly` quando contiverem credencial, `Secure` em producao, `SameSite=Lax` e dominio host-only. O cookie CSRF nao e HttpOnly.

## CSRF

- O servidor emitira token CSRF por endpoint dedicado.
- Requisicoes autenticadas que alteram estado exigirao `X-CSRF-Token`.
- O valor do header deve coincidir com o cookie e com a sessao.
- `Origin` sera validada para o dominio configurado em producao.
- Endpoints publicos sem autenticacao manterao validacao propria e rate limit.

## Compatibilidade e migracao

Durante uma janela curta:

- O servidor aceitara Authorization Bearer antigo, mas nao emitira novo token para `localStorage`.
- O frontend migrado usara `credentials: "include"` e removera tokens locais depois de confirmar a nova sessao.
- Um endpoint de troca convertera uma sessao Bearer valida em cookies uma unica vez.
- A compatibilidade antiga sera removida depois do smoke em producao.

Chamadas diretas espalhadas pelo frontend serao centralizadas no cliente HTTP compartilhado. Impersonacao usara as sessoes separadas, sem expor o token administrativo ao JavaScript.

## Criptografia de integracoes

`DATA_ENCRYPTION_KEY` sera uma chave obrigatoria e independente em producao.

- Novos valores criptografados carregarao versao e identificador da chave.
- O decrypt suportara temporariamente a chave legada por `LEGACY_DATA_ENCRYPTION_KEY`.
- Um comando de rotacao recriptografara os campos conhecidos para a nova chave.
- A rotacao registrara apenas IDs e contagens, nunca valores.
- Depois da verificacao, a chave legada sera removida do Portainer.

O `SESSION_SECRET` exposto no ambiente de teste sera rotacionado somente depois de esse fluxo estar disponivel.

## Proxy, headers e limites

- Configurar `trust proxy` de forma explicita para um proxy.
- Adicionar CSP compativel com os assets locais, Google Fonts, imagens HTTPS, `blob:` e conexoes HTTPS/WSS necessarias.
- Manter HSTS, `nosniff`, frame policy, referrer e permissions policy.
- Aplicar limite global por IP e limites mais estritos em login, refresh, administracao, importacao e endpoints caros.
- Limitar JSON global abaixo do atual 50 MB e manter limites maiores apenas nas rotas de upload que necessitam.
- Sanitizar erros de autenticacao e nunca registrar cookies, tokens ou headers completos.

## Testes

- Cookies de credencial sao HttpOnly e Secure em producao.
- Tokens nao sao gravados nem lidos do `localStorage`.
- Refresh rotaciona o token e revoga reutilizacao.
- Logout revoga a sessao.
- CSRF bloqueia mutacao sem header valido.
- Origin incorreta e rejeitada.
- Usuario nao consegue usar sessao administrativa.
- Impersonacao preserva isolamento.
- WebSocket autentica pelo cookie.
- Chave nova de dados descriptografa valores migrados.
- Chave legada funciona apenas durante a janela configurada.
- Nenhum segredo aparece em logs ou responses.

## Criterios de aceite

- Login, refresh, logout e expiracao funcionam em desktop e mobile.
- Nenhum token de autenticacao permanece no armazenamento do navegador.
- Sessoes podem ser revogadas individualmente.
- A troca de `SESSION_SECRET` nao torna integracoes ilegives.
- Testes de autenticacao, permissao, CSRF e criptografia passam.
- Smoke de administracao e usuario comum passa antes da remocao do Bearer legado.

## Fora de escopo

- Single sign-on corporativo.
- MFA.
- Alteracao do provedor de identidade.
- Rotacao efetiva das credenciais reais sem acesso ao ambiente.


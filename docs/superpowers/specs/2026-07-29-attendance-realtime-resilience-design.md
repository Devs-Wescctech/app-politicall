# Resiliencia do atendimento em tempo real

## Contexto

O atendimento usa WebSocket em `/api/attendance/realtime`. O dominio de producao responde normalmente a HTTP e readiness, mas o Nginx nao encaminha o upgrade WebSocket: uma tentativa de upgrade recebe o HTML da SPA. Nao ha acesso SSH para alterar o proxy.

Esta etapa garante funcionamento correto mesmo sem WebSocket e preserva a opcao de tempo real quando o Nginx for corrigido.

## Objetivos

- Detectar conexao, reconexao e indisponibilidade do WebSocket.
- Usar sincronizacao HTTP incremental como fallback.
- Evitar mensagens e conversas duplicadas quando os dois transportes funcionarem.
- Manter a interface utilizavel durante queda de rede.
- Documentar a configuracao Nginx sem depender dela para o funcionamento basico.

## Transporte primario

O WebSocket continua sendo o transporte de menor latencia.

- Autentica por cookie HttpOnly da mesma origem.
- Envia evento de conexao com identificador do servidor.
- Usa heartbeat com ping/pong.
- Reconecta com backoff exponencial e jitter.
- Interrompe tentativas agressivas quando a aba esta oculta ou o navegador esta offline.

## Fallback HTTP

Quando o WebSocket nao conectar ou cair:

- A conversa aberta atualiza a cada 5 segundos.
- A lista de conversas atualiza a cada 10 segundos.
- Em aba oculta, o intervalo sobe para 30 segundos.
- Ao voltar para primeiro plano ou recuperar rede, ocorre sincronizacao imediata.
- O polling usa cursor de atualizacao quando o endpoint oferecer suporte; enquanto isso, reutiliza os endpoints atuais com invalidacao seletiva.
- Depois de duas conexoes WebSocket estaveis, o polling retorna ao intervalo de seguranca de 60 segundos.

O fallback nao envia novamente mensagens. Ele somente busca e reconcilia o estado do servidor.

## Reconciliacao

- Mensagens remotas sao identificadas por `externalMessageId`.
- Mensagens locais usam ID persistido e, quando implementado, `clientMessageId`.
- Eventos repetidos atualizam o mesmo item.
- A conversa preserva ordem por timestamp normalizado e ID como desempate.
- Cache da lista e cache da conversa sao atualizados de forma atomica.

## Experiencia do operador

- Indicador discreto com estados `Conectado`, `Reconectando` e `Sincronizacao automatica`.
- Nenhum modal bloqueia o atendimento por falha do WebSocket.
- Rascunhos permanecem intactos durante reconexao.
- Falha HTTP mostra acao de tentar novamente sem limpar a conversa.
- Ao restabelecer conexao, a interface informa apenas quando houver atraso relevante.

## Nginx

O runbook entregara um bloco para o administrador do servidor aplicar futuramente:

```nginx
location /api/attendance/realtime {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

Esse arquivo e documentacao; o projeto nao tentara alterar o host.

## Testes

- WebSocket conectado desativa polling agressivo.
- Falha de upgrade ativa fallback.
- Offline pausa reconexao.
- Retorno online sincroniza imediatamente.
- Aba oculta reduz frequencia.
- Evento e polling duplicados nao duplicam mensagens.
- Troca de conversa cancela timers anteriores.
- Logout encerra WebSocket e polling autenticado.
- Browser QA simula bloqueio de WebSocket em desktop e mobile.

## Criterios de aceite

- O atendimento recebe atualizacoes pelo fallback no dominio atual.
- A interface comunica o estado sem impedir resposta.
- Nao ha crescimento de timers ao navegar entre conversas.
- WebSocket volta a ser primario automaticamente quando disponivel.
- Testes de reconciliacao e conectividade passam.
- A configuracao Nginx correta fica documentada para aplicacao externa.

## Fora de escopo

- Alterar Nginx, DNS ou certificado no servidor.
- Substituir o WebSocket por outro broker.
- Escalar WebSocket para multiplas replicas nesta primeira implantacao.


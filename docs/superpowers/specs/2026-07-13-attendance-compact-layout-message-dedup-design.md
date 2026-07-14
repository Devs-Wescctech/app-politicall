# Atendimento compacto e deduplicação de mensagens

## Objetivo

Ampliar a altura útil do chat removendo a faixa superior de navegação e impedir que mensagens enviadas pelo Politicall sejam importadas novamente pela sincronização WHU.

## Layout aprovado

- Remover a faixa superior com título, abas e botão “Nova conversa”.
- Manter “Nova conversa” no botão `+` existente no cabeçalho da lista.
- Controlar Caixa, Relatórios, Contatos, Arquivados, Histórico e Configurações por um seletor compacto.
- Na Caixa, o seletor fica no cabeçalho da coluna esquerda sem criar uma nova linha.
- Nas demais visualizações, o mesmo seletor aparece no topo do conteúdo.
- Preservar o comportamento responsivo e os estados atuais das abas.

## Deduplicação

A resposta WHU de envio fornece `messageSentId` ou `messagesSentIds`. O endpoint deve usar o normalizador `remoteMessageId` já compartilhado pela sincronização, persistindo o ID externo na primeira inserção. O banco deve possuir índice único parcial por conta e ID externo para impedir inserções concorrentes.

Os dois registros locais sem ID externo, comprovados como cópias de “Jorge” e “somente teste”, serão removidos após a correção e validação. Os registros sincronizados, que possuem o ID oficial do WHU, serão preservados.

## Verificação

- Teste unitário do extrator de ID e da reconciliação.
- Teste automatizado completo, TypeScript e build.
- Validação visual da altura e do seletor.
- Verificação no banco de que cada mensagem recente possui somente um registro.
- Nenhuma mensagem real será enviada durante a validação.

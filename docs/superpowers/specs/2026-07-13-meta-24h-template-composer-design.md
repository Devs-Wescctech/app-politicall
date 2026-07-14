# Janela Meta de 24 horas e seletor unificado do atendimento

## Objetivo

Impedir mensagens públicas comuns em atendimentos de canais oficiais quando a última mensagem recebida do cliente tiver mais de 24 horas, orientar o operador sobre a regra da Meta e permitir que ele retome a conversa enviando um template aprovado diretamente no chat.

## Escopo

- Aplicar a regra somente a conexões identificadas como WhatsApp Cloud/API Oficial.
- Calcular a janela com base em `lastCustomerActivityAt`, que representa a última mensagem recebida do cliente.
- Manter notas internas disponíveis mesmo com a janela encerrada.
- Oferecer templates aprovados e respostas rápidas em um seletor unificado acionado por `/`.
- Identificar visualmente cada opção como `Template` ou `Resposta rápida`.
- Fora da janela, manter respostas rápidas visíveis, porém desabilitadas, porque são mensagens livres.

## Comportamento da interface

Quando a janela estiver encerrada, o chat exibirá um aviso acima do compositor:

> A janela de atendimento de 24 horas da Meta foi encerrada. Para retomar a conversa, envie um template aprovado. A janela será reaberta quando o cliente responder.

O aviso terá o botão `Enviar template`. O campo de mensagem pública e o botão de envio ficarão bloqueados. A opção de nota interna continuará funcionando.

Ao digitar `/` no início do campo ou usar o botão de atalhos, será aberto um menu pesquisável com templates aprovados e respostas rápidas. Cada item terá um badge com seu tipo. Dentro da janela, selecionar uma resposta rápida preencherá o campo e selecionar um template abrirá sua confirmação de envio. Fora da janela, respostas rápidas estarão desabilitadas com uma indicação de indisponibilidade; templates permanecerão disponíveis.

Depois que uma nova mensagem de entrada for sincronizada, `lastCustomerActivityAt` será atualizado. O aviso e o bloqueio desaparecerão automaticamente na próxima atualização do atendimento.

## Arquitetura e fluxo de dados

1. O backend expõe no detalhe da conversa o estado normalizado da janela Meta, incluindo se o canal é oficial, instante da última atividade do cliente e se a janela está encerrada.
2. A criação e sincronização de mensagens inbound atualiza `lastCustomerActivityAt`; mensagens outbound não alteram a abertura da janela.
3. O compositor consulta templates usando o `connectionId` da conversa e combina o resultado com `/api/attendance/quick-replies` apenas para apresentação.
4. Respostas rápidas continuam usando o endpoint normal de envio de texto.
5. Templates usam `/api/attendance/conversations/:id/send-template` e o contrato oficial da Meta/WHU já existente.
6. O endpoint normal de envio rejeita mensagem pública fora da janela com HTTP 409 e código `META_WINDOW_EXPIRED`. Notas internas não são rejeitadas.

## Regras de identificação

- A conexão é oficial quando o provider ou os metadados técnicos indicarem API Oficial/WhatsApp Cloud, reutilizando a regra existente de identificação.
- A janela é considerada encerrada quando houver `lastCustomerActivityAt` válido e tiverem passado 24 horas completas.
- Se não houver atividade recebida conhecida em uma conversa oficial, o sistema adota o estado seguro: exige template para iniciar.
- Canais WHU não oficiais e demais canais não recebem esse bloqueio.

## Tratamento de erros

- Falha ao listar templates: manter o aviso e informar que nenhum template pôde ser carregado, com opção de tentar novamente.
- Nenhum template aprovado: explicar que é necessário aprovar ou sincronizar templates na Meta/WHU.
- Tentativa de envio comum fora da janela: retornar `META_WINDOW_EXPIRED` e atualizar o estado da tela, sem criar mensagem otimista definitiva.
- Falha no envio do template: manter o compositor bloqueado e mostrar o erro retornado pelo provedor.

## Testes

- Testes unitários para cálculo da janela: aberta, encerrada, exatamente no limite, sem atividade conhecida e canal não oficial.
- Teste de integração do endpoint de mensagem pública retornando 409 fora da janela e permitindo nota interna.
- Teste do endpoint de template confirmando que permanece permitido fora da janela.
- Testes do compositor para aviso, bloqueio e menu `/` com badges e estados desabilitados.
- Validação no navegador com um atendimento oficial cuja última mensagem inbound tenha mais de 24 horas.

## Critérios de aceite

- O atendimento oficial do cenário informado exibe o aviso quando a última mensagem do cliente tem mais de 24 horas.
- Não é possível enviar texto público comum nesse estado.
- O botão e o atalho `/` apresentam os templates aprovados da conexão atual.
- Templates e respostas rápidas são visualmente distinguíveis.
- O envio de template funciona fora da janela.
- Uma nova mensagem do cliente reabre a janela e libera mensagens comuns sem recarregamento manual prolongado.


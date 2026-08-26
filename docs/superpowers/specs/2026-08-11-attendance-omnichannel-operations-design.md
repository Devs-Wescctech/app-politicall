# Atendimento Omnichannel - Centro Operacional

## Objetivo

Transformar a tela de Atendimentos em um centro operacional confiavel, deixando explicito o estado de cada canal e conectando a conversa ao acompanhamento do gabinete.

## Escopo

- Diagnostico passivo e seguro de WhatsApp/WHU, SMS e e-mail.
- Distincao entre realtime do navegador e disponibilidade/configuracao dos provedores.
- Estado de erro recuperavel na lista de conversas.
- Agendamento de retorno a partir de uma conversa.
- Vinculo bidirecional entre o atendimento e o evento da Agenda.
- Preservacao do vinculo ja existente entre Atendimento, Eleitor e Demanda.

## Regras de canal

- WhatsApp e o canal conversacional atual, com conexoes WHU/Cloud configuradas em `channel_connections`.
- SMS e e-mail so devem ser apresentados como conversacionais quando houver suporte real. Nesta entrega, o painel informa honestamente capacidade de envio e recebimento.
- O diagnostico nunca devolve tokens, senhas ou credenciais.
- Uma configuracao incompleta deve informar os campos ausentes sem expor valores.

## Agendamento

- Um retorno pertence a uma conta, usuario e conversa.
- O evento pode herdar o eleitor vinculado a conversa.
- A data final precisa ser posterior a inicial.
- A Agenda deve permitir voltar ao atendimento de origem.
- Exclusao da conversa nao exclui o evento; o vinculo e apenas removido.

## Fora de escopo

- Simular caixa de entrada SMS sem webhook/provedor de recebimento.
- Simular caixa de entrada de e-mail sem IMAP configurado.
- Testar provedores externos automaticamente em cada abertura da tela.
- Alterar credenciais ou publicar configuracoes.

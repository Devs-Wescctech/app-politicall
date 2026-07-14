# Variáveis obrigatórias em templates do WhatsApp

## Objetivo

Impedir o envio de templates Meta/WHU contendo placeholders como `{{1}}` sem os valores reais. A mesma regra deve valer no chat, na criação de uma conversa e no módulo Campanhas.

## Experiência de uso

- Ao selecionar um template, o sistema identifica variáveis em cabeçalho, corpo e botões.
- Antes do envio, uma revisão mostra um campo vazio e obrigatório para cada variável.
- A prévia substitui os placeholders conforme os campos são preenchidos.
- O envio permanece bloqueado enquanto houver valor vazio ou placeholder não resolvido.
- Templates sem variáveis também exibem a revisão e a prévia, mas sem campos adicionais.
- Em Campanhas, cada campo aceita texto fixo ou tokens do Politicall, como `{nome}`, `{telefone}` e `{cidade}`. Os tokens são renderizados por destinatário.

## Arquitetura

Um módulo compartilhado e sem dependências de UI normaliza templates, extrai variáveis ordenadas, valida valores, monta componentes Meta/WHU e produz a prévia. Um componente React reutilizável apresenta os campos e a confirmação.

O chat e a criação de conversa deixam de enviar o template imediatamente após a seleção. Ambos abrem o editor compartilhado e enviam `templateComponents` somente após validação. Campanhas persistem o mapa de valores em `templateConfig.variables`, exibem prévia com contato de exemplo e montam os componentes para cada destinatário.

O backend é autoritativo: os endpoints de template validam se todas as variáveis exigidas pelo template foram preenchidas. Requisições incompletas retornam HTTP 400 com código `TEMPLATE_VARIABLES_REQUIRED`, sem chamar o provedor e sem registrar mensagem como enviada.

## Contratos

- Componentes de texto: `{ type: "body" | "header", parameters: [{ type: "text", text: "..." }] }`.
- Botões dinâmicos preservam `sub_type` e `index` quando informados pelo template.
- Variáveis numéricas são ordenadas numericamente.
- Variáveis nomeadas preservam a ordem em que aparecem nos componentes.
- Valores contendo apenas espaços são considerados ausentes.
- A mensagem armazenada e exibida no histórico usa a prévia já resolvida.

## Pontos cobertos

1. Chat de atendimento: menu `/` e botão de template.
2. Nova conversa: template inicial.
3. Campanhas de WhatsApp oficial: criação, revisão, persistência e disparo por contato.
4. Backend: criação de conversa, envio no chat e disparo de campanha.

## Testes

- Extração em cabeçalho, corpo e botão.
- Ordenação e deduplicação de placeholders.
- Validação de valores vazios.
- Montagem de componentes e prévia resolvida.
- Rejeição no backend antes de qualquer chamada externa.
- Fluxos de UI para abrir revisão e impedir confirmação incompleta.
- Campanha com valor fixo e com token personalizado por contato.

## Segurança operacional

Nenhum template real será enviado durante a validação automatizada ou manual. A verificação no navegador termina antes da confirmação externa.

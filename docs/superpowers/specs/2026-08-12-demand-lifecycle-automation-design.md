# Automacao do ciclo de demandas

## Objetivo

Conectar SLA, responsavel, historico e documentos em um fluxo operacional unico. A entrega deve avisar o responsavel sem duplicar alertas, preservar evidencias da demanda e manter todas as operacoes isoladas por conta.

## Escopo

- Anexos privados em PDF, JPEG, PNG ou WebP, com limite de 10 MB por arquivo.
- Lista, download e exclusao de anexos dentro da demanda.
- Notificacao interna do novo responsavel quando uma demanda for atribuida ou transferida por outra pessoa.
- Notificacao interna do responsavel quando o status mudar por outra pessoa.
- Alerta interno unico quando faltarem ate quatro horas para o SLA.
- Alerta interno unico quando o SLA vencer.
- Registro de upload, exclusao e alertas no historico da demanda.

Nao fazem parte desta entrega: envio externo por WhatsApp, SMS ou e-mail; classificacao por IA; armazenamento em nuvem; antivirus externo; ou alteracao do provedor de mensagens.

## Dados

### `demand_attachments`

Armazena metadados do arquivo: conta, demanda, autor, nome original, nome fisico aleatorio, MIME, tamanho e data. O arquivo fica em `uploads/demands/<account>/<demand>/`, mas nunca e servido pela rota estatica. Download e exclusao passam por autenticacao, permissao e verificacao da conta.

### `demand_automation_events`

Registra eventos automaticos idempotentes. A chave unica `(account_id, demand_id, event_type)` impede alertas repetidos para `sla_due_soon` e `sla_overdue`, inclusive com mais de uma instancia do processo concorrendo.

## Backend

O servico de anexos valida conta e demanda, tamanho, extensao e assinatura real do arquivo. Nomes enviados pelo usuario nunca sao usados como caminho fisico. Falhas depois da gravacao removem o arquivo parcial.

O servico de notificacoes grava notificacao e historico na mesma transacao da mudanca da demanda. Acoes feitas pelo proprio responsavel nao geram notificacao para ele mesmo.

O verificador de SLA roda no inicio e em intervalo configuravel, sem sobrepor execucoes. Demandas concluidas ou canceladas sao ignoradas. Para cada alerta, a reserva idempotente, a notificacao e o historico sao gravados em uma transacao.

## API

- `GET /api/demands/:id/attachments`: lista anexos da demanda.
- `POST /api/demands/:id/attachments`: recebe um arquivo multipart no campo `file`.
- `GET /api/demands/:id/attachments/:attachmentId/download`: baixa o arquivo apos validar a conta.
- `DELETE /api/demands/:id/attachments/:attachmentId`: remove metadado e arquivo e registra historico.

Todas as rotas exigem autenticacao e permissao `demands`.

## Interface

O painel lateral da demanda ganha a aba **Anexos**, com seletor de arquivo, progresso de envio, lista com nome/tamanho/data e comandos de baixar e excluir. Estados vazio, carregando, erro e sucesso devem ser claros e responsivos.

## Seguranca e falhas

- Caminhos sao construidos somente com IDs validados e nome aleatorio.
- Arquivos executaveis, tipos divergentes e arquivos acima do limite sao rejeitados.
- Respostas nao revelam caminhos internos.
- Exclusao de banco ocorre antes da limpeza do arquivo; falha de limpeza e registrada sem restaurar metadado inseguro.
- O job de SLA e idempotente e nao bloqueia a inicializacao do servidor.

## Testes

- Unidade: classificacao do SLA, validacao de arquivo e regras de notificacao.
- Integracao: isolamento por conta, upload/download/exclusao e idempotencia dos alertas.
- Frontend: aba, estados, envio e exclusao.
- Fluxo local: login, upload, download, exclusao, alerta SLA e historico, sem erros de console ou HTTP.


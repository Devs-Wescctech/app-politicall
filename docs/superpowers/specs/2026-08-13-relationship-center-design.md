# Central de Relacionamento - Especificação de Design

Data: 2026-08-13

Projeto: Politicall

Status: Aguardando revisão do patrocinador

## 1. Objetivo

Criar uma Central de Relacionamento que ajude a equipe política a manter contato útil, contínuo e consentido com cidadãos já cadastrados. O módulo deve identificar contatos sem interação recente, explicar objetivamente o motivo da priorização e sugerir ações multicanal para aprovação humana.

O sistema mede relacionamento e participação voluntária. Ele não calcula intenção de voto, persuasibilidade, orientação política, religião ou qualquer perfil sensível.

## 2. Resultado Esperado

- Reduzir contatos esquecidos e demandas sem retorno.
- Aumentar respostas, participação em eventos, pesquisas e ações públicas.
- Centralizar o contexto antes de qualquer comunicação.
- Evitar mensagens duplicadas, excesso de frequência e envio sem consentimento.
- Encaminhar ações aprovadas para o módulo Campanhas, sem criar um segundo motor de disparos.
- Produzir indicadores auditáveis de relacionamento, atendimento e participação.

## 3. Escopo da Primeira Versão

### Incluído

- Estados de relacionamento `active`, `attention`, `inactive` e `no_consent`.
- Janela padrão de atividade de 30 dias e atenção de 31 a 60 dias.
- Linha do tempo unificada por contato.
- Fila priorizada de relacionamento.
- Sugestões explicáveis para aprovação, rejeição ou adiamento.
- Canais WhatsApp, SMS e e-mail.
- Consentimento e descadastro por canal.
- Limite de frequência e deduplicação.
- Criação de rascunho no módulo Campanhas após aprovação.
- Dashboard e relatório de resultados.
- Auditoria de decisões humanas.

### Fora do Escopo

- Envio automático sem aprovação humana.
- Predição de voto, score ideológico ou segmentação por dado sensível.
- Compra, enriquecimento ou importação de bases de terceiros sem origem comprovada.
- Disparo diretamente pela Central de Relacionamento.
- Geração autônoma de propaganda eleitoral.
- Gamificação ou recompensa financeira por publicação política.

## 4. Princípios

1. **Aprovação humana:** nenhuma sugestão gera envio automaticamente.
2. **Explicabilidade:** toda recomendação informa eventos e regras que a originaram.
3. **Consentimento por canal:** permissão de WhatsApp não autoriza SMS ou e-mail.
4. **Minimização:** usar apenas dados necessários à operação de relacionamento.
5. **Isolamento:** toda consulta e gravação é restrita por `account_id`.
6. **Reutilização:** campanhas, contatos, usuários e integrações existentes continuam sendo as fontes oficiais.
7. **Auditabilidade:** criação, aprovação, alteração, rejeição e envio são rastreáveis.

## 5. Jornada do Usuário

1. A equipe abre a Central de Relacionamento.
2. O dashboard apresenta os estados e as pendências por responsável e território.
3. A equipe abre a fila e seleciona um contato ou grupo.
4. O sistema exibe a última interação, pendências, canais permitidos e motivo da recomendação.
5. A equipe escolhe uma sugestão, revisa destinatários, canal e mensagem.
6. A equipe aprova, rejeita ou adia.
7. Uma aprovação cria um rascunho no módulo Campanhas com audiência congelada e rastreável.
8. A campanha segue o fluxo existente de revisão, agendamento e disparo.
9. Entregas, respostas, descadastros e novas participações retornam à linha do tempo e aos indicadores.

## 6. Estados de Relacionamento

O estado é calculado por contato e gabinete:

| Estado | Regra padrão |
| --- | --- |
| `active` | Existe interação relevante nos últimos 30 dias. |
| `attention` | Última interação relevante ocorreu entre 31 e 60 dias. |
| `inactive` | Não há interação relevante há mais de 60 dias ou nunca houve. |
| `no_consent` | Nenhum canal elegível possui autorização válida. |

`no_consent` tem precedência na comunicação, mas não apaga o estado temporal. A API deve retornar `activityState` e `contactabilityState` separadamente, permitindo mostrar, por exemplo, “Inativo, sem canal autorizado”.

As janelas são configuráveis por gabinete, mantendo `30/60` como padrão. A alteração não modifica eventos históricos, apenas recalcula a classificação.

## 7. Interações Relevantes

Eventos que renovam atividade:

- mensagem recebida do contato;
- resposta humana enviada em atendimento;
- atendimento iniciado, retomado ou concluído;
- demanda criada pelo contato, atualizada com participação ou resolvida com retorno;
- resposta a pesquisa;
- assinatura de petição;
- confirmação ou presença em evento, quando houver vínculo explícito com contato;
- resposta, clique consentido ou outra conversão validada de campanha.

Eventos de entrega isolada, visualização interna pela equipe, importação de dados ou envio sem resposta não renovam atividade.

Cada evento contém `sourceType`, `sourceId`, `occurredAt`, `actorType`, `metadata` mínima e uma chave idempotente. O texto integral de mensagens permanece no módulo de origem; a central guarda referência e resumo operacional.

## 8. Modelo de Dados

### `relationship_events`

- `id` UUID.
- `account_id` UUID obrigatório.
- `contact_id` UUID obrigatório.
- `event_type` texto validado.
- `source_type` e `source_id`.
- `occurred_at` timestamp com fuso.
- `actor_type` (`contact`, `user`, `system`).
- `actor_user_id` opcional.
- `summary` texto curto e sanitizado.
- `metadata` JSONB limitado e sem segredos.
- `idempotency_key` texto.
- `created_at`.

Índices: `(account_id, contact_id, occurred_at desc)`, `(account_id, event_type, occurred_at desc)` e unicidade `(account_id, idempotency_key)`.

### `contact_channel_consents`

- `id`, `account_id`, `contact_id`.
- `channel` (`whatsapp`, `sms`, `email`).
- `status` (`granted`, `revoked`, `unknown`).
- `legal_basis` e `purpose`.
- `source`, `evidence_reference` e `captured_at`.
- `revoked_at`, `expires_at` opcionais.
- `created_by_user_id`, `updated_at`.

Unicidade por `(account_id, contact_id, channel, purpose)`. Não armazenar documento comprobatório bruto nessa tabela; usar referência controlada.

### `relationship_snapshots`

Projeção recalculável para leitura rápida:

- `account_id`, `contact_id`.
- `last_relevant_activity_at`.
- `activity_state`.
- `eligible_channels` JSONB com canais e razões de bloqueio.
- `open_demands_count`, `pending_attendances_count`.
- `next_recommended_at`.
- `computed_at`, `rule_version`.

Chave composta `(account_id, contact_id)`.

### `relationship_suggestions`

- `id`, `account_id`, `contact_id` opcional.
- `suggestion_type`.
- `reason_code` e `reason_details` sanitizado.
- `recommended_channel`.
- `status` (`pending`, `approved`, `rejected`, `snoozed`, `expired`, `converted`).
- `priority` numérica explicável.
- `recommended_at`, `expires_at`, `snoozed_until`.
- `reviewed_by_user_id`, `reviewed_at`, `review_note`.
- `campaign_id` após conversão.
- `rule_version`, `created_at`, `updated_at`.

### `relationship_audit_events`

Registro imutável de alterações administrativas, aprovações, rejeições, mudanças de audiência, exportações e criação de campanha.

## 9. Integração Entre Módulos

### Contatos

É a identidade oficial. A central usa `contact_id` e acompanha merges. Quando contatos forem mesclados, eventos e consentimentos devem migrar transacionalmente para o contato destino, preservando a origem na auditoria.

### Atendimentos

Publica eventos normalizados de mensagens recebidas, respostas humanas e mudanças relevantes. O número/canal de destino continua registrado no atendimento, inclusive quando a mesma pessoa conversa com mais de um número.

### Demandas

Publica criação, participação, atualização relevante, encaminhamento e resolução com retorno. Demandas abertas elevam prioridade, mas não autorizam comunicação promocional.

### Pesquisas, Petições e Eventos

Publicam participação voluntária. A finalidade do consentimento coletado em cada formulário deve ser respeitada; participar não concede automaticamente autorização irrestrita para campanhas.

### Campanhas

Recebe um rascunho com audiência congelada, canal, motivo, template e referência à sugestão. Antes do envio, o módulo Campanhas revalida consentimento, descadastro, frequência e integridade dos destinatários.

### Relatórios e Contato 360

Contato 360 exibe a linha do tempo e o estado. Relatórios recebem indicadores agregados, sem expor dados pessoais além da permissão do usuário.

## 10. Motor de Recomendações

A primeira versão utiliza regras determinísticas e versionadas, não aprendizado de máquina.

Exemplos:

- “Demanda resolvida há 45 dias e nenhuma nova interação”: sugerir retorno de acompanhamento.
- “Participou de evento e autorizou WhatsApp”: sugerir agradecimento ou convite relacionado.
- “Atendimento aguardando retorno interno”: sugerir ação ao responsável, sem criar campanha.
- “Contato ativo no período e com evento futuro relacionado”: sugerir convite para revisão humana.

A prioridade considera apenas fatores operacionais:

- tempo desde a última interação;
- existência e idade de pendências;
- sugestão anteriormente adiada;
- capacidade da equipe e limite diário;
- canal autorizado e frequência recente.

Toda sugestão mostra `reasonCode`, descrição legível e links para as fontes. Nenhuma regra usa atributo sensível ou probabilidade de apoio eleitoral.

## 11. Frequência e Deduplicação

- Limite padrão configurável por canal e propósito.
- Uma pessoa não recebe a mesma ação em vários canais simultaneamente.
- Identidade deduplicada pelo contato canônico; destino deduplicado por endereço normalizado e conexão de origem.
- Sugestões equivalentes usam chave idempotente.
- Aprovação em lote executa nova validação transacional antes de criar a campanha.
- Descadastro ou revogação invalida imediatamente sugestões pendentes e destinatários ainda não enviados.
- Falha em um canal não causa troca automática de canal; exige nova aprovação.

## 12. Permissões

Novas permissões granulares:

- `relationshipView`.
- `relationshipReview`.
- `relationshipApprove`.
- `relationshipSettings`.
- `relationshipExport`.

Usuários visualizam somente contatos e territórios permitidos pelas regras existentes do gabinete. Aprovação em lote e alteração de consentimento exigem auditoria reforçada.

## 13. APIs

### Leitura

- `GET /api/relationship/overview`
- `GET /api/relationship/queue`
- `GET /api/relationship/contacts/:contactId/timeline`
- `GET /api/relationship/suggestions`
- `GET /api/relationship/settings`
- `GET /api/relationship/reports`

### Escrita

- `PATCH /api/relationship/suggestions/:id/review`
- `POST /api/relationship/suggestions/bulk-review`
- `POST /api/relationship/suggestions/:id/convert-to-campaign`
- `PUT /api/relationship/contacts/:contactId/consents/:channel`
- `PATCH /api/relationship/settings`

Todos os contratos usam validação Zod, autenticação por sessão, CSRF nas mutações, autorização granular, `account_id` derivado da sessão, paginação limitada, rate limit e erros padronizados. IDs inválidos retornam `400`; objetos fora do gabinete retornam `404` sem revelar existência.

## 14. Interface

### Visão Geral

- Métricas compactas de ativos, atenção, inativos e sem consentimento.
- Evolução 30/60/90 dias.
- Pendências operacionais e sugestões aguardando revisão.
- Distribuição por território, responsável e canal autorizado.

### Fila de Relacionamento

- Tabela densa e responsiva.
- Busca e filtros por estado, território, responsável, canal, pendência e período.
- Última interação e motivo da prioridade visíveis.
- Seleção em lote apenas para itens compatíveis.

### Revisão de Sugestão

- Painel lateral com contexto, linha do tempo resumida e razão da recomendação.
- Canal permitido, audiência e frequência recente.
- Prévia editável da mensagem.
- Ações `Aprovar e criar rascunho`, `Rejeitar` e `Adiar`.
- Nunca apresentar botão de envio direto.

### Histórico e Resultados

- Campanha relacionada, aprovador, entregas, falhas, respostas, descadastros e interações posteriores.
- Indicadores agregados com filtros reproduzíveis.

### Contato 360

- Badge de estado.
- Última interação relevante.
- Consentimentos por canal.
- Sugestões e ações recentes.

## 15. Estados de Interface

Todas as áreas devem cobrir:

- carregamento com dimensões estáveis;
- vazio com ação útil;
- erro recuperável com tentar novamente;
- falta de permissão;
- dados desatualizados durante recálculo;
- conflito por revisão concorrente;
- consentimento revogado entre seleção e aprovação;
- campanha criada com sucesso e link direto.

## 16. Processamento

- Eventos são gravados no mesmo fluxo da operação de origem quando possível, com chave idempotente.
- Um worker incremental atualiza snapshots afetados.
- Uma reconciliação diária recalcula contatos alterados e corrige divergências.
- Reprocessamento é idempotente e usa cursor por `occurred_at` mais `id`.
- A fila de sugestões usa lotes limitados e bloqueio seguro para concorrência.
- Falha na projeção não deve impedir atendimento, demanda ou campanha; ela gera alerta operacional e reprocessamento.

## 17. Segurança, Privacidade e Conformidade

- Proibir no schema de recomendações campos como intenção de voto, religião, raça, saúde ou orientação sexual.
- Registrar finalidade, base legal e origem do consentimento.
- Disponibilizar revogação e descadastro centralizados.
- Aplicar retenção configurável a eventos e auditorias conforme obrigação legal.
- Criptografar segredos de integrações; não copiar credenciais para eventos ou metadata.
- Sanitizar mensagens, nomes de fontes e erros antes da auditoria.
- Limitar exportações, marcá-las na auditoria e evitar colunas desnecessárias.
- Conteúdo produzido ou significativamente alterado por IA deve seguir as exigências de transparência aplicáveis antes de uso eleitoral.
- A implantação deve passar por validação jurídica das regras eleitorais e da LGPD vigentes.

## 18. Observabilidade

Métricas técnicas:

- atraso do projetor;
- eventos processados, duplicados e rejeitados;
- snapshots desatualizados;
- sugestões geradas, expiradas e convertidas;
- conflitos de aprovação;
- bloqueios por consentimento ou frequência;
- falhas ao criar rascunho de campanha.

Logs usam IDs técnicos e não incluem texto integral de mensagens, tokens ou contatos completos.

## 19. Métricas de Produto

- contatos com retorno dentro do prazo;
- tempo médio desde pendência até ação humana;
- taxa de sugestões aprovadas, rejeitadas e adiadas;
- taxa de resposta após ação aprovada;
- participação voluntária após convite;
- demandas com retorno após resolução;
- descadastros e denúncias por canal;
- frequência média por contato;
- cobertura de consentimento documentado.

Não haverá indicador de “chance de voto”.

## 20. Migração e Compatibilidade

1. Criar tabelas e índices sem alterar tabelas existentes de forma destrutiva.
2. Popular eventos históricos somente de fontes com vínculo confiável a `contact_id`.
3. Marcar consentimento legado como `unknown`, nunca como `granted` por presunção.
4. Calcular snapshots em lotes, sem bloquear o deploy.
5. Liberar inicialmente por feature flag por gabinete.
6. Manter rollback desligando a flag; tabelas novas permanecem sem perda de dados.

## 21. Estratégia de Testes

### Unitários

- classificação 30/60 dias e precedência de consentimento;
- regras de relevância de eventos;
- prioridade e explicação;
- frequência, deduplicação e idempotência;
- normalização por canal.

### Integração PostgreSQL

- migração idempotente;
- isolamento por `account_id`;
- chaves compostas e merges de contato;
- aprovação concorrente;
- revogação entre seleção e conversão;
- reprocessamento de snapshots.

### APIs

- `401`, `403`, `404`, `409`, `422` e sucesso;
- paginação e filtros;
- CSRF e rate limit;
- não vazamento entre gabinetes;
- auditoria de mutações.

### Componentes

- estados de carregamento, vazio, erro e permissão;
- filtros e seleção em lote;
- explicação e prévia;
- acessibilidade por teclado e leitores de tela.

### E2E

- evento torna contato ativo;
- contato fica em atenção e inativo conforme relógio controlado;
- sugestão é aprovada e cria rascunho em Campanhas;
- contato sem consentimento é bloqueado;
- revogação invalida audiência;
- fluxo responsivo desktop e mobile;
- limpeza completa das fixtures.

## 22. Fases de Implementação

### Fase 1 - Fundação

Eventos, consentimentos, snapshots, permissões, migração e contratos.

### Fase 2 - Classificação e Fila

Projetor, regras 30/60, visão geral, fila e Contato 360.

### Fase 3 - Recomendações

Geração determinística, explicações, revisão individual e em lote.

### Fase 4 - Campanhas e Resultados

Conversão em rascunho, revalidação, auditoria e indicadores de resultado.

### Fase 5 - Hardening

Reconciliação, observabilidade, performance, acessibilidade, E2E e feature flag.

## 23. Critérios de Aceitação

- Nenhuma mensagem é enviada sem aprovação humana no módulo Campanhas.
- Estados 30/60 são determinísticos e testados.
- Toda recomendação possui justificativa verificável.
- Consentimento é independente por canal e revalidado antes da campanha.
- Deduplicação impede a mesma ação simultânea em múltiplos canais.
- Todos os dados são isolados por gabinete.
- Aprovações e alterações de consentimento são auditadas.
- Contato 360 e relatórios refletem os mesmos eventos.
- Fluxos críticos passam em desktop e mobile.
- Migração é idempotente e possui rollback operacional por feature flag.

## 24. Decisões Consolidadas

- Público inicial: contatos já existentes.
- Atividade: interação relevante nos últimos 30 dias.
- Atenção: 31 a 60 dias; inativo acima de 60 dias.
- Operação: sugestões com aprovação humana.
- Canais: WhatsApp, SMS e e-mail.
- Motor inicial: regras determinísticas e explicáveis.
- Disparo: exclusivamente pelo módulo Campanhas.
- Limite ético: relacionamento e participação, sem perfil eleitoral sensível.

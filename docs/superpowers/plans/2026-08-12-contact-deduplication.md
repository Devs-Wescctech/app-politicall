# Contact Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar e mesclar eleitores duplicados de forma reversivel, preservando cada atendimento e registrando o numero de WhatsApp receptor.

**Architecture:** Um dominio puro calcula evidencias de duplicidade e formata a origem das conversas. Um service transacional executa preview, mesclagem e reversao com diario imutavel de IDs transferidos. Rotas dedicadas expoem o fluxo para uma pagina operacional em Eleitores, enquanto a Ficha 360 passa a exibir o snapshot da conexao receptora.

**Tech Stack:** TypeScript, React 18, Express, Drizzle ORM, PostgreSQL, TanStack Query, Vitest e Playwright.

## Global Constraints

- Executar somente no ambiente local `127.0.0.1:5001`; nao fazer push ou deploy.
- Nenhuma mesclagem automatica; sempre exigir confirmacao humana.
- Nunca excluir conversas, mensagens ou contatos por mesclagem.
- Toda leitura e escrita deve incluir `account_id`.
- Preservar conversas separadas quando o eleitor falar com mais de um numero conectado.
- Usar migracoes aditivas e transacoes atomicas.
- Nao incluir CPF neste ciclo.

---

### Task 1: Dominio de deteccao e origem WhatsApp

**Files:**
- Create: `server/services/contact-deduplication-domain.ts`
- Test: `server/services/contact-deduplication-domain.test.ts`

**Interfaces:**
- Produces: `buildDuplicateEvidence(left, right)`, `groupDuplicateContacts(contacts)` e `formatInboundConnection(conversation)`.

- [ ] **Step 1: Escrever testes falhando para evidencias fortes e moderadas**

Cobrir e-mail normalizado, telefone normalizado, nome com cidade, homonimo isolado e exclusao de contatos arquivados.

- [ ] **Step 2: Executar o teste e confirmar falha por modulo ausente**

Run: `npm test -- --run server/services/contact-deduplication-domain.test.ts`

- [ ] **Step 3: Implementar tipos e funcoes puras minimas**

```ts
export type DuplicateConfidence = "high" | "review";
export function buildDuplicateEvidence(left: ContactCandidate, right: ContactCandidate): DuplicateEvidence[];
export function groupDuplicateContacts(contacts: ContactCandidate[]): DuplicateGroup[];
export function formatInboundConnection(input: InboundConnectionSnapshot): string;
```

- [ ] **Step 4: Confirmar testes verdes e fazer commit**

Run: `npm test -- --run server/services/contact-deduplication-domain.test.ts`

---

### Task 2: Schema aditivo e snapshot da conexao receptora

**Files:**
- Create: `migrations/0015_contact_deduplication.sql`
- Modify: `shared/schema.ts`
- Modify: `scripts/full_schema.sql`
- Modify: `scripts/setup-dev-db.ts`
- Modify: `server/services/production-migrations.ts`
- Modify: `server/services/production-migrations.test.ts`
- Test: `server/services/production-migrations.test.ts`

**Interfaces:**
- Produces: campos `contacts.mergedIntoContactId`, `mergedAt`, `mergedByUserId`, `updatedAt`; tabela `contactMergeEvents`; campos `attConversations.inboundConnectionName` e `inboundNumber`.

- [ ] **Step 1: Atualizar o teste do registro de migracoes e confirmar falha**

Run: `npm test -- --run server/services/production-migrations.test.ts`

- [ ] **Step 2: Declarar schema e migracao aditiva**

Criar FKs com `ON DELETE RESTRICT`, indices por conta/estado de mesclagem e tabela de diario. O backfill de conversas deve copiar nome e numero apenas quando a conexao atual tiver valor confiavel.

- [ ] **Step 3: Registrar a migracao nos executores local e de producao**

- [ ] **Step 4: Aplicar apenas no banco local e validar indices**

Run: `node --env-file=.env.local --import tsx scripts/setup-dev-db.ts`

- [ ] **Step 5: Rodar teste, TypeScript e fazer commit**

Run: `npm test -- --run server/services/production-migrations.test.ts && npm run check`

---

### Task 3: Snapshot em todas as entradas de atendimento

**Files:**
- Create: `server/services/attendance-connection-snapshot.ts`
- Test: `server/services/attendance-connection-snapshot.test.ts`
- Modify: `server/attendance-routes.ts`

**Interfaces:**
- Consumes: metadados de `channelConnections`.
- Produces: `snapshotAttendanceConnection(connection)` com `{ inboundConnectionName, inboundNumber }`.

- [ ] **Step 1: Escrever testes falhando para as chaves alternativas do numero**

Testar `phoneNumber`, `whatsappPhoneNumber`, `number`, `identifier`, nome sem numero e conexao ausente.

- [ ] **Step 2: Confirmar RED**

Run: `npm test -- --run server/services/attendance-connection-snapshot.test.ts`

- [ ] **Step 3: Implementar helper e usa-lo em criacao manual, sincronizacao e webhook**

O snapshot so e definido ao criar a conversa. Atualizacoes posteriores nao sobrescrevem valores ja gravados.

- [ ] **Step 4: Confirmar testes verdes e fazer commit**

---

### Task 4: Service transacional de preview, mesclagem e reversao

**Files:**
- Create: `server/services/contact-merge.ts`
- Test: `server/services/contact-merge.test.ts`
- Modify: `server/storage.ts`

**Interfaces:**
- Produces: `listDuplicateGroups(accountId)`, `previewContactMerge(input)`, `mergeContacts(input)` e `revertContactMerge(input)`.
- O diario usa `movedRelations: Record<ContactRelationName, string[]>`.

- [ ] **Step 1: Escrever testes falhando para preview e conflitos**

Validar outra conta, origem igual ao destino, contato arquivado e campos conflitantes.

- [ ] **Step 2: Implementar listagem e preview sem escrita**

O preview retorna token SHA-256 derivado dos IDs, `updatedAt` e conflitos; nenhuma credencial entra no token.

- [ ] **Step 3: Escrever testes falhando para transferencia atomica**

Cobrir demandas, eventos, conversas, mensagens, destinatarios, assinaturas, etiquetas e listas.

- [ ] **Step 4: Implementar mesclagem em uma transacao com bloqueio de linhas**

Atualizar somente `contact_id`, unir interesses/etiquetas e arquivar a origem. Registrar arrays exatos de IDs transferidos.

- [ ] **Step 5: Escrever testes falhando para reversao seletiva**

Comprovar que registros criados depois da mesclagem permanecem no principal.

- [ ] **Step 6: Implementar reversao e confirmar toda a suite do service**

Run: `npm test -- --run server/services/contact-merge.test.ts`

---

### Task 5: APIs seguras de duplicidade

**Files:**
- Create: `server/routes/contact-duplicates-route.ts`
- Test: `server/routes/contact-duplicates-route.test.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- Produces: `GET /api/contacts/duplicates`, `POST /api/contacts/merge-preview`, `POST /api/contacts/merge`, `GET /api/contacts/merges` e `POST /api/contacts/merges/:id/revert`.

- [ ] **Step 1: Escrever testes falhando para auth, permissao, CSRF e respostas**

- [ ] **Step 2: Implementar validacao Zod e handlers finos**

Erros: `CONTACT_MERGE_INVALID`, `CONTACT_MERGE_STALE`, `CONTACT_MERGE_CONFLICT`, `CONTACT_MERGE_NOT_FOUND` e `CONTACT_MERGE_REVERT_FORBIDDEN`.

- [ ] **Step 3: Confirmar isolamento por conta e testes verdes**

Run: `npm test -- --run server/routes/contact-duplicates-route.test.ts`

---

### Task 6: Ficha 360 com origem da conversa

**Files:**
- Modify: `shared/contact-360.ts`
- Modify: `server/services/contact-360.ts`
- Modify: `client/src/pages/contact-360.tsx`
- Modify: `client/src/components/contacts/contact-360-timeline.tsx`
- Modify: `client/src/pages/contact-360.test.tsx`

**Interfaces:**
- Cada conversa retorna `inboundConnectionName`, `inboundNumber` e `inboundLabel`.

- [ ] **Step 1: Escrever teste de componente falhando para dois numeros receptores**

- [ ] **Step 2: Atualizar contrato e agregador**

- [ ] **Step 3: Exibir o label sem misturar ou deduplicar conversas**

- [ ] **Step 4: Confirmar testes verdes**

Run: `npm test -- --run client/src/pages/contact-360.test.tsx server/services/contact-360.test.ts`

---

### Task 7: Interface de revisao e historico

**Files:**
- Create: `client/src/pages/contact-duplicates.tsx`
- Create: `client/src/components/contacts/contact-merge-comparison.tsx`
- Create: `client/src/pages/contact-duplicates.test.tsx`
- Modify: `client/src/pages/contacts.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes as APIs da Task 5.
- Produces rota `/contacts/duplicates` e comando `Revisar duplicados`.

- [ ] **Step 1: Escrever testes falhando para vazio, grupos, comparador e historico**

- [ ] **Step 2: Implementar pagina com filtros e estados operacionais**

- [ ] **Step 3: Implementar comparador, selecao do principal e conflitos**

- [ ] **Step 4: Implementar confirmacao, invalidacao de cache e reversao**

- [ ] **Step 5: Confirmar testes verdes e responsividade**

---

### Task 8: Documentacao e verificacao final

**Files:**
- Create: `docs/CONTACT_DUPLICATES.md`
- Modify: `docs/CONTACTS_360.md`

**Interfaces:**
- Documenta API, migracao, rollback, operacao local e riscos.

- [ ] **Step 1: Documentar contratos e fluxo operacional**

- [ ] **Step 2: Rodar gates completos**

Run: `npm test -- --run`

Run: `npm run check`

Run: `npm run build`

Run: `npm run security:secrets`

- [ ] **Step 3: Reiniciar somente a porta local 5001 e validar healthcheck**

- [ ] **Step 4: Executar Playwright desktop e mobile**

Validar deteccao, preview, mesclagem, duas conversas com numeros receptores diferentes, reversao, console, respostas HTTP e overflow.

- [ ] **Step 5: Revisar diff, confirmar arvore limpa e criar commit local final**


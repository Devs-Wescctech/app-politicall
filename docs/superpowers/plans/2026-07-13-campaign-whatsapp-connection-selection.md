# Seleção de conexão WhatsApp em Campanhas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listar números WhatsApp reais no assistente de campanhas, derivar Oficial/Normal da conexão escolhida e usar exatamente essa conexão em templates e disparos.

**Architecture:** Uma função pura transforma `channel_connections` em opções seguras de campanha e centraliza validação/classificação. O backend expõe opções sem segredos, filtra templates por conexão e valida o `connectionId`; o frontend persiste `waConnectionId` em `sendConfig` e deriva o tipo automaticamente.

**Tech Stack:** TypeScript, React, React Hook Form, TanStack Query, Express, Drizzle ORM, PostgreSQL, Vitest e Obsidian MCP.

## Global Constraints

- Reutilizar `isOfficialAttendanceChannel`; não criar classificação paralela.
- Nunca retornar nem documentar tokens, senhas, cookies, headers de autorização ou strings de conexão.
- Não disparar campanhas reais durante a validação.
- Campanhas WhatsApp novas exigem seleção explícita de uma conexão real.
- Conexões removidas ou desabilitadas falham sem fallback silencioso.
- Não criar migração: `sendConfig` e `templateConfig` já são JSON.

---

### Task 1: Modelo seguro e validação de conexão

**Files:**
- Create: `server/services/campaign-whatsapp-connections.ts`
- Create: `server/services/campaign-whatsapp-connections.test.ts`
- Modify: `shared/schema.ts`

**Interfaces:**
- Consumes: `isOfficialAttendanceChannel({ connection })`.
- Produces: `CampaignWhatsappConnectionOption`, `toCampaignWhatsappConnectionOption(connection)` e `requireCampaignWhatsappConnection(connections, connectionId, expectedType)`.

- [ ] **Step 1: Escrever teste falhando para conexão normal e oficial**

```ts
expect(toCampaignWhatsappConnectionOption(normal)).toMatchObject({
  id: "normal-1", phoneNumber: "5551999990000", official: false, campaignType: "whatsapp",
});
expect(toCampaignWhatsappConnectionOption(official)).toMatchObject({
  id: "official-1", official: true, campaignType: "whatsapp_oficial",
});
```

- [ ] **Step 2: Executar RED**

Run: `npx vitest run server/services/campaign-whatsapp-connections.test.ts`
Expected: FAIL porque o módulo/funções ainda não existem.

- [ ] **Step 3: Implementar mapeamento e validação mínimos**

```ts
export type CampaignWhatsappConnectionOption = {
  id: string; name: string; phoneNumber: string | null; provider: string;
  status: string; official: boolean;
  campaignType: "whatsapp" | "whatsapp_oficial"; label: string;
};

export function toCampaignWhatsappConnectionOption(connection: ConnectionLike) {
  const official = isOfficialAttendanceChannel({ connection });
  const metadata = record(connection.metadata);
  const phoneNumber = normalizeOptionalPhone(metadata.phoneNumber ?? metadata.number ?? metadata.identifier);
  return {
    id: connection.id, name: connection.name, phoneNumber,
    provider: String(connection.provider ?? ""), status: String(connection.status ?? ""), official,
    campaignType: official ? "whatsapp_oficial" : "whatsapp",
    label: `${phoneNumber || connection.name} — ${official ? "Oficial (Cloud API)" : "Normal (WHU)"}`,
  };
}
```

- [ ] **Step 4: Adicionar `waConnectionId?: string` a `CampaignSendConfig` e validar conexão/conta/tipo/status**

- [ ] **Step 5: Executar GREEN**

Run: `npx vitest run server/services/campaign-whatsapp-connections.test.ts`
Expected: PASS para mapeamento, número ausente, desabilitada, ID inválido e tipo incompatível.

### Task 2: Endpoints e envio por conexão exata

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/services/campaigns.ts`
- Modify: `server/services/campaigns.test.ts`
- Modify: `server/services/campaign-template-variables.ts`
- Modify: `server/services/campaign-template-variables.test.ts`

**Interfaces:**
- Consumes: helpers da Task 1 e `sendConfig.waConnectionId`.
- Produces: `GET /api/campaigns/whatsapp/connections`; filtro `connectionId` em templates; seleção exata no disparo.

- [ ] **Step 1: Escrever testes falhando para preservação de `waConnectionId` e seleção sem fallback**

```ts
expect(normalizeSendConfig({ waConnectionId: "conn-1" })).toEqual({ waConnectionId: "conn-1" });
expect(selectCampaignOfficialConnection(connections, "missing")).toBeUndefined();
```

- [ ] **Step 2: Executar RED**

Run: `npx vitest run server/services/campaigns.test.ts server/services/campaign-template-variables.test.ts`
Expected: FAIL porque `waConnectionId` é descartado e a seleção ainda usa a primeira oficial como fallback.

- [ ] **Step 3: Implementar endpoint seguro de conexões**

```ts
app.get("/api/campaigns/whatsapp/connections", authenticateToken, requireAnyPermission("marketing", "whatsappBroadcast"), async (req, res) => {
  const connections = await storage.getChannelConnections(req.accountId!);
  res.json({ connections: connections
    .filter(c => c.channel === "whatsapp" && c.status !== "disabled")
    .map(toCampaignWhatsappConnectionOption) });
});
```

- [ ] **Step 4: Filtrar `/api/campaigns/whatsapp/templates?connectionId=...` pela conexão oficial selecionada**

- [ ] **Step 5: Preservar `waConnectionId` em `normalizeSendConfig` e validar antes de criar/agendar/enviar**

- [ ] **Step 6: Alterar disparo normal e oficial para usar token/provedor da conexão exata**

- [ ] **Step 7: Executar GREEN**

Run: `npx vitest run server/services/campaigns.test.ts server/services/campaign-template-variables.test.ts server/services/campaign-whatsapp-connections.test.ts`
Expected: PASS.

### Task 3: Dropdown por número no assistente

**Files:**
- Modify: `client/src/components/campaign-wizard.tsx`
- Create: `client/src/components/campaign-whatsapp-connection-picker.tsx`
- Create: `client/src/components/campaign-whatsapp-connection-picker.test.tsx`

**Interfaces:**
- Consumes: `GET /api/campaigns/whatsapp/connections` e `CampaignWhatsappConnectionOption`.
- Produces: campo `waConnectionId`, tipo derivado e limpeza de template incompatível.

- [ ] **Step 1: Escrever teste falhando do seletor**

```tsx
render(<CampaignWhatsappConnectionPicker connections={[normal, official]} value="" onChange={onChange} />);
expect(screen.getByText("+55 51 99999-0000 — Normal (WHU)")).toBeInTheDocument();
expect(screen.getByText("+55 51 98888-0000 — Oficial (Cloud API)")).toBeInTheDocument();
```

- [ ] **Step 2: Executar RED**

Run: `npx vitest run client/src/components/campaign-whatsapp-connection-picker.test.tsx`
Expected: FAIL porque o componente não existe.

- [ ] **Step 3: Implementar componente com loading, erro, vazio, seleção e conexão indisponível**

- [ ] **Step 4: Adicionar `waConnectionId` ao schema/formulário, restaurar edição e salvar em `sendConfig`**

- [ ] **Step 5: Derivar `type` da opção; limpar template ao trocar para normal; consultar templates com `connectionId`**

- [ ] **Step 6: Executar GREEN e TypeScript**

Run: `npx vitest run client/src/components/campaign-whatsapp-connection-picker.test.tsx && npm run check`
Expected: PASS e zero erros TypeScript.

### Task 4: Documentação completa no Obsidian

**Files:**
- Create via Obsidian MCP: `Projetos/Politicall/00 - Visao geral.md`
- Create via Obsidian MCP: `Projetos/Politicall/01 - Arquitetura.md`
- Create via Obsidian MCP: `Projetos/Politicall/02 - Decisoes.md`
- Create via Obsidian MCP: `Projetos/Politicall/03 - Alteracoes.md`
- Create via Obsidian MCP: `Projetos/Politicall/04 - Pendencias.md`
- Create via Obsidian MCP: `Projetos/Politicall/05 - Comandos.md`
- Create via Obsidian MCP: `Projetos/Politicall/06 - APIs e integracoes.md`
- Create via Obsidian MCP: `Projetos/Politicall/07 - Banco de dados.md`
- Create via Obsidian MCP: `Projetos/Politicall/08 - Modulos funcionais.md`
- Create via Obsidian MCP: `Projetos/Politicall/09 - Testes e operacao.md`

**Interfaces:**
- Consumes: código, schemas, scripts, testes, Graphify e resultados reais de validação.
- Produces: base navegável do projeto sem segredos.

- [ ] **Step 1: Levantar fatos verificados de stack, comandos, módulos, rotas, tabelas, integrações e operação**

- [ ] **Step 2: Criar as dez notas com links cruzados e data de atualização**

- [ ] **Step 3: Buscar padrões proibidos**

Verificar que nenhuma nota contém valores de `DATABASE_URL`, `Authorization`, `access-token`, tokens Bearer, senhas, cookies ou chaves privadas.

- [ ] **Step 4: Ler de volta as notas e confirmar existência, estrutura e ausência de segredos**

### Task 5: Validação final

**Files:**
- Verify only.

**Interfaces:**
- Consumes: implementação e documentação das Tasks 1–4.
- Produces: evidência de entrega.

- [ ] **Step 1: Executar suíte completa**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 2: Executar TypeScript e build**

Run: `npm run check && npm run build`
Expected: exit code 0.

- [ ] **Step 3: Reiniciar servidor e verificar HTTP 200**

- [ ] **Step 4: Validar no navegador sem disparar campanha**

Confirmar que o dropdown não contém opções genéricas e lista o número conectado com indicador Oficial/Normal; selecionar opções e avançar até Mensagem/Revisão sem enviar.

- [ ] **Step 5: Registrar resultados reais em `03 - Alteracoes.md`, `04 - Pendencias.md` e `09 - Testes e operacao.md`**

## Execution choice

Inline Execution nesta tarefa, conforme a solicitação do usuário para corrigir imediatamente a tela ainda exibida.

# Seleção de conexão WhatsApp em Campanhas — Design

## Objetivo

Fazer o assistente de campanhas listar cada número de WhatsApp realmente conectado à conta, identificar automaticamente se ele é uma conexão comum via WHU ou uma conexão oficial via WhatsApp Cloud API e garantir que criação, templates e envio utilizem exatamente a conexão escolhida.

Também documentar o projeto Politicall no Obsidian em `Projetos/Politicall/`, cobrindo arquitetura, operação, módulos, integrações, banco, decisões, alterações e pendências sem registrar segredos.

## Problema atual

O passo “Canal” do assistente mostra apenas duas opções genéricas:

- `WhatsApp normal (número conectado)`;
- `WhatsApp API Oficial (templates)`.

Essas opções alteram somente o tipo lógico da campanha. Elas não representam os registros reais de `channel_connections`, não mostram o número conectado e não garantem que templates e disparos usem a mesma conexão.

## Decisão

O seletor será baseado em conexões reais. Cada opção terá:

- `id` da conexão;
- nome configurado;
- número conectado quando disponível;
- provedor;
- estado;
- classificação `official` calculada pela regra compartilhada `isOfficialAttendanceChannel`;
- rótulo amigável, como `+55 (51) 99999-0000 — Oficial (Cloud API)` ou `+55 (51) 98888-0000 — Normal (WHU)`.

A seleção armazenará o `connectionId` e derivará automaticamente o tipo da campanha:

- conexão oficial → `whatsapp_oficial`;
- conexão normal → `whatsapp`.

## Arquitetura

### Contrato seguro de conexões para campanhas

O backend exporá uma lista de conexões de WhatsApp disponíveis para campanhas sem retornar token, credenciais ou metadados sensíveis. O contrato terá apenas os campos necessários ao assistente.

```ts
type CampaignWhatsappConnection = {
  id: string;
  name: string;
  phoneNumber: string | null;
  provider: string;
  status: string;
  official: boolean;
  campaignType: "whatsapp" | "whatsapp_oficial";
  label: string;
};
```

Somente conexões da conta autenticada, de canal WhatsApp e que não estejam desabilitadas serão retornadas.

### Classificação

A classificação reutilizará `isOfficialAttendanceChannel({ connection })`, evitando uma segunda regra divergente. Ela considera provedor, canal, metadados oficiais e IDs da Meta.

O número será obtido dos metadados normalizados da conexão. Quando não houver número disponível, o rótulo usará o nome da conexão sem inventar um telefone.

### Estado do assistente

O assistente terá um campo explícito `waConnectionId`. A escolha da conexão atualizará simultaneamente:

- `waConnectionId`;
- `type` derivado da conexão;
- configuração de template incompatível, que será limpa ao trocar entre oficial e normal.

Na edição de uma campanha existente, o assistente restaurará `waConnectionId` de `templateConfig` ou `sendConfig`. Campanhas antigas sem esse valor continuarão abrindo, mas exigirão seleção antes de novo envio ou agendamento por WhatsApp.

### Templates

Para conexão oficial, a consulta de templates receberá `connectionId` e retornará apenas templates daquela conexão. Templates aprovados continuarão obrigatórios e suas variáveis continuarão sendo validadas.

Para conexão normal, o compositor permitirá mensagem livre. Templates oficiais e configuração de variáveis serão removidos ao trocar para uma conexão normal.

### Persistência

O identificador será salvo em:

- `templateConfig.waConnectionId`, quando houver template;
- `sendConfig.waConnectionId`, para todos os disparos WhatsApp.

Não será necessária migração porque ambos os campos são JSON. O tipo `CampaignTemplateConfig` será mantido compatível com o campo já existente.

### Envio e validação no backend

Antes de salvar, agendar ou enviar uma campanha WhatsApp, o backend validará:

1. a conexão existe;
2. pertence à conta autenticada;
3. é WhatsApp;
4. não está desabilitada;
5. sua classificação corresponde ao `campaign.type` derivado;
6. campanhas oficiais possuem template aprovado e variáveis válidas.

O serviço de disparo usará o token e o provedor da conexão selecionada, e não uma integração genérica ou a primeira conexão disponível.

Erros serão explícitos, por exemplo:

- `Selecione um número de WhatsApp conectado`;
- `A conexão selecionada não está mais disponível`;
- `Esta conexão exige um template oficial aprovado`.

## Interface

O card principal continuará chamado “WhatsApp”. Abaixo dele, “Número de envio” exibirá cada conexão real.

O texto auxiliar será derivado da seleção:

- oficial: `Envio pela Cloud API com templates aprovados da Meta.`;
- normal: `Envio de mensagem livre pela conexão WHU.`

Estados obrigatórios:

- carregando conexões;
- lista vazia com orientação para configurar um número;
- erro de carregamento;
- seleção válida;
- conexão anteriormente salva, mas indisponível.

## Testes

### Unitários

- mapeamento de conexão normal;
- mapeamento de conexão oficial por provedor/metadados;
- rótulo com e sem número;
- derivação de `campaignType`;
- validação de conexão pertencente à conta;
- rejeição de conexão desabilitada ou incompatível;
- preservação do `connectionId` no envio;
- filtro de templates pela conexão selecionada.

### Componente/fluxo

- dropdown lista números reais e indicadores;
- selecionar oficial muda o tipo e habilita templates;
- selecionar normal permite mensagem livre;
- trocar de oficial para normal limpa template incompatível;
- edição restaura a conexão salva.

### Verificação manual

- validar o assistente com conexão normal e oficial;
- confirmar o número e indicador exibidos;
- avançar até a revisão sem disparar campanha real;
- confirmar ausência de erros no console e respostas HTTP adequadas.

## Documentação no Obsidian

Será criada a pasta `Projetos/Politicall/` com as notas:

- `00 - Visao geral.md` — objetivo, público, stack, estado e entrada de navegação;
- `01 - Arquitetura.md` — frontend, backend, dados, autenticação e fluxos;
- `02 - Decisoes.md` — decisões técnicas e trade-offs verificados;
- `03 - Alteracoes.md` — histórico das mudanças realizadas nesta sequência de trabalho;
- `04 - Pendencias.md` — riscos, limitações e próximos passos confirmados;
- `05 - Comandos.md` — instalação, desenvolvimento, testes, build, banco e execução;
- `06 - APIs e integracoes.md` — contratos internos e integrações externas sem credenciais;
- `07 - Banco de dados.md` — Drizzle/PostgreSQL, domínios, migrações e cuidados;
- `08 - Modulos funcionais.md` — inventário dos módulos visíveis do produto;
- `09 - Testes e operacao.md` — estratégia de testes, observabilidade, troubleshooting e checklist.

As notas serão produzidas a partir do código, schemas, scripts, testes e documentação real. Nenhum token, segredo, senha, cookie, header de autorização ou string de conexão será incluído.

## Compatibilidade e riscos

- Campanhas antigas sem `waConnectionId` não serão associadas silenciosamente a uma conexão; o usuário deverá escolher o número antes de reenviar.
- Uma conexão removida depois do agendamento fará o envio falhar com erro claro, sem fallback para outro número.
- A classificação permanece centralizada; mudanças futuras na detecção oficial devem ocorrer em `isOfficialAttendanceChannel`.
- Nenhuma campanha real será disparada durante os testes manuais.

## Critérios de aceite

1. O dropdown mostra cada conexão WhatsApp ativa da conta separadamente.
2. Cada opção identifica número/nome e se é Oficial ou Normal.
3. O tipo da campanha é derivado da conexão, sem escolha manual divergente.
4. Templates são carregados somente para a conexão oficial selecionada.
5. O backend envia usando exatamente o `connectionId` salvo.
6. Conexões inválidas ou incompatíveis são rejeitadas antes do disparo.
7. Testes automatizados novos e existentes passam.
8. A documentação completa existe em `Projetos/Politicall/` no Obsidian e não contém segredos.

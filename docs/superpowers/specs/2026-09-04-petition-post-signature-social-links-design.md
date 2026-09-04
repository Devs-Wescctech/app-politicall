# Redes de contato apos assinatura de peticao

**Data:** 04/09/2026  
**Base:** `origin/main` no commit `b5aa829`  
**Escopo:** configuracao por peticao e pagina publica  
**Estado:** desenho aprovado pelo usuario, aguardando revisao escrita

## Objetivo

Permitir que cada peticao configure os canais oficiais do politico. Depois de uma assinatura confirmada, os quatro icones exibidos no dialogo devem abrir os canais configurados para que o signatario fale com o politico.

As redes contempladas sao:

- WhatsApp;
- Facebook;
- X/Twitter;
- Telegram.

## Comportamento atual

A pagina publica monta um unico array `socialShares` com URLs de compartilhamento da peticao. Esse array e reutilizado em dois locais:

1. secao `Compartilhe esta peticao`, antes da assinatura;
2. dialogo `Assinatura confirmada`, depois da assinatura.

O WhatsApp atual usa `https://wa.me/?text=...`, sem numero de destino. Facebook, X e Telegram tambem abrem compositores de compartilhamento, nao perfis do politico.

## Decisao de produto

Os dois contextos terao responsabilidades diferentes:

- **Antes da assinatura:** manter os controles atuais de compartilhamento da peticao.
- **Depois da assinatura:** substituir os compartilhamentos por links de contato oficiais configurados na peticao.

O dialogo de sucesso exibira o titulo `Fale com o politico` e apenas as redes que possuam configuracao valida. Se nenhuma rede estiver configurada, o dialogo confirmara a assinatura sem renderizar uma area vazia de redes.

## Alternativas consideradas

### 1. Campos explicitos por peticao - escolhida

Adicionar um campo para cada rede diretamente em `petitions`.

Vantagens:

- corresponde ao pedido de configuracao dentro da peticao;
- contrato tipado e simples;
- validacao especifica por rede;
- leitura direta na pagina publica;
- facil manutencao e teste.

Desvantagem: adicionar uma quinta rede no futuro exige nova migration.

### 2. Objeto JSON generico por peticao

Armazenar todas as redes em uma coluna JSONB.

Foi rejeitada porque reduz a seguranca de schema, dificulta validacao e permite formatos inconsistentes para um conjunto fixo de quatro redes.

### 3. Redes globais da conta com heranca

Configurar os canais uma vez no perfil do politico e herdar em todas as peticoes.

Foi adiada porque o usuario pediu configuracao na peticao. Heranca e sobrescrita podem ser adicionadas em outro ciclo sem bloquear este escopo.

## Modelo de dados

Adicionar colunas opcionais a `petitions`:

| Campo TypeScript | Coluna PostgreSQL | Formato |
| --- | --- | --- |
| `contactWhatsapp` | `contact_whatsapp` | telefone internacional normalizado, somente digitos |
| `contactFacebookUrl` | `contact_facebook_url` | URL HTTPS de Facebook |
| `contactXUrl` | `contact_x_url` | URL HTTPS de X ou Twitter |
| `contactTelegramUrl` | `contact_telegram_url` | URL HTTPS de Telegram |

Todos os campos sao opcionais e `NULL` para peticoes existentes. A migration sera aditiva e nao alterara o comportamento de persistencia de assinaturas.

### Migration

Criar a proxima migration numerada, sem modificar migrations ja publicadas. Ela deve usar `ADD COLUMN IF NOT EXISTS` para permitir aplicacao idempotente pelo migration runner.

## Validacao e normalizacao

Criar helpers puros compartilhados pelo schema/backend:

- `normalizePetitionWhatsapp(value)`: remove caracteres nao numericos e retorna `null` quando vazio;
- `normalizePetitionSocialUrl(network, value)`: aceita somente URL HTTPS e host aprovado para a rede;
- `buildPetitionContactLinks(petition)`: produz somente links configurados e seguros para a pagina publica.

### WhatsApp

- aceitar entrada com espacos, parenteses, tracos e `+`;
- persistir apenas digitos;
- exigir codigo do pais, DDD e numero;
- aceitar de 10 a 15 digitos para compatibilidade internacional;
- gerar `https://wa.me/{numero}`;
- nao incluir automaticamente o texto de compartilhamento, pois o objetivo e iniciar contato, nao compartilhar a peticao.

### Facebook

- exigir HTTPS;
- aceitar `facebook.com` e subdominios oficiais;
- rejeitar protocolos executaveis, URLs relativas e hosts semelhantes.

### X/Twitter

- exigir HTTPS;
- aceitar `x.com`, `twitter.com` e subdominios oficiais.

### Telegram

- exigir HTTPS;
- aceitar `t.me`, `telegram.me` e subdominios oficiais.

Campos vazios ou compostos apenas por espacos devem ser persistidos como `null`.

## Formulario administrativo

Na tela `Peticoes > Criar/Editar`, adicionar uma secao sem card aninhado chamada `Redes para contato apos a assinatura`.

Controles:

- telefone do WhatsApp;
- URL do Facebook;
- URL do X/Twitter;
- URL do Telegram.

Cada campo tera:

- icone da rede;
- label explicita;
- placeholder de formato;
- descricao curta informando que o link aparece depois da assinatura;
- mensagem de validacao especifica;
- `data-testid` estavel.

O formulario de edicao deve carregar os valores existentes. Salvar sem preencher redes continua permitido.

## Pagina publica

### Antes da assinatura

Manter `socialShares` e o texto `Compartilhe esta peticao` como hoje. Esses botoes continuam abrindo os compositores de compartilhamento com texto/link da peticao.

### Depois da assinatura

Criar uma colecao separada, `contactLinks`, derivada exclusivamente dos campos de contato.

No dialogo de sucesso:

- manter `Assinatura confirmada!`;
- trocar o texto de compartilhamento por uma orientacao de contato quando houver rede configurada;
- exibir `Fale com o politico`;
- renderizar somente redes configuradas;
- abrir o destino em nova aba com protecoes `noopener,noreferrer`;
- fornecer `aria-label` e tooltip com o nome da rede;
- nao reutilizar os `data-testid` de compartilhamento.

Test IDs previstos:

- `section-petition-contact-links`;
- `button-contact-whatsapp`;
- `button-contact-facebook`;
- `button-contact-x`;
- `button-contact-telegram`.

Quando nenhuma rede estiver configurada, a confirmacao nao exibe titulo, descricao ou icones de contato. Os controles de compartilhamento anteriores permanecem disponiveis fora do dialogo.

## API e isolamento

As rotas existentes de peticao continuam sendo usadas:

- `POST /api/petitions`;
- `PATCH /api/petitions/:id`;
- `GET /api/petitions/:id`;
- endpoint publico por slug.

O schema de insercao passa a validar os novos campos. Criacao e atualizacao privadas continuam exigindo sessao, permissao `petitions`, CSRF e `accountId` da sessao.

O endpoint publico pode retornar os links de contato porque sao dados deliberadamente publicados com a peticao. Ele nao deve retornar tokens, configuracoes de provider, IDs internos de conexoes ou qualquer outra credencial.

Erros de validacao retornam `400` pelo contrato atual da rota. A pagina publica nunca deve construir link com valor invalido recebido do servidor; o helper de construcao e uma segunda barreira.

## Compatibilidade

- peticoes antigas continuam validas com todos os novos campos nulos;
- nenhum dado existente e reescrito;
- o compartilhamento antes da assinatura permanece igual;
- o dialogo antigo deixa de mostrar compartilhamento somente quando o frontend atualizado for ativado;
- rollback de aplicacao pode manter as colunas opcionais sem impacto;
- rollback de schema nao e necessario e nao deve ser executado apenas para voltar o codigo.

## Arquivos previstos

- `migrations/0026_petition_contact_social_links.sql` ou proximo numero livre confirmado no momento da implementacao;
- `shared/schema.ts`;
- novo helper de dominio para validacao/construcao dos links;
- `client/src/pages/petitions.tsx`;
- `client/src/pages/petition-public.tsx`;
- testes unitarios do helper;
- testes de contrato/schema da peticao;
- testes de componente ou fonte para os dois contextos;
- `tests/e2e/critical-flows.spec.ts` para jornada principal, se o fixture do ambiente suportar os campos.

## Estrategia de testes

### Unidade

- normaliza telefone brasileiro e internacional;
- rejeita telefone curto/longo;
- aceita hosts oficiais de cada rede;
- rejeita HTTP, `javascript:`, URL relativa e host parecido;
- omite redes vazias;
- constroi links na ordem WhatsApp, Facebook, X e Telegram.

### Backend/contrato

- cria peticao com quatro redes;
- atualiza uma rede sem afetar as demais;
- limpa campo com string vazia;
- rejeita URL de host nao permitido;
- retorna os campos na leitura privada e publica;
- preserva isolamento de tenant na atualizacao.

### Frontend

- formulario carrega e envia os quatro campos;
- erros aparecem junto ao campo;
- antes da assinatura os botoes ainda compartilham;
- depois da assinatura os botoes abrem os contatos configurados;
- rede ausente nao gera botao;
- nenhuma rede nao gera secao vazia;
- nomes acessiveis identificam cada destino.

### E2E

1. autenticar usuario com permissao de peticoes;
2. criar peticao com quatro redes de teste;
3. publicar e abrir o link publico;
4. confirmar que os botoes anteriores sao de compartilhamento;
5. assinar;
6. confirmar os quatro links de contato no dialogo;
7. editar removendo uma rede;
8. repetir e confirmar que a rede removida nao aparece;
9. limpar fixtures criadas pelo teste.

## Criterios de aceite

- configuracao fica dentro de Criar/Editar peticao;
- cada peticao pode ter valores diferentes;
- os quatro icones pos-assinatura abrem os canais oficiais configurados;
- o WhatsApp abre conversa com o numero configurado;
- os botoes anteriores continuam compartilhando a peticao;
- redes sem configuracao ficam ocultas;
- entradas maliciosas ou invalidas sao rejeitadas;
- peticoes antigas continuam funcionando;
- typecheck, testes focados, suite e build passam, descontada apenas uma falha de baseline comprovadamente anterior e nao relacionada;
- nenhuma publicacao ou deploy faz parte desta entrega.

## Risco de baseline identificado

No checkout Windows limpo de `origin/main`, `npm run check` passou. A suite executou 1.048 testes com sucesso, 7 ignorados e uma falha preexistente em `tests/deployment-config.test.ts`: o teste exige LF literal no workflow, enquanto o checkout converteu o arquivo para CRLF. A implementacao nao deve alterar o workflow para mascarar essa falha; a validacao focada desta feature deve permanecer independente, e a correcao multiplataforma do teste pode ser tratada separadamente.

# Linhas políticas personalizáveis

## Objetivo

Permitir que cada gabinete crie e administre suas próprias linhas políticas, com identidade visual e organização independentes dos partidos. Cada aliança pertence a no máximo uma linha política e continua vinculada ao partido correspondente.

## Situação atual

A página de Alianças Políticas usa a ideologia global do partido (`Esquerda`, `Centro-Esquerda`, `Centro`, `Centro-Direita` e `Direita`) e um mapa de cores fixo no frontend. Não existe entidade por gabinete, API de gerenciamento, ordenação nem possibilidade de personalização.

## Modelo de dados

Criar a tabela `alliance_lines` com:

- `id`: UUID;
- `account_id`: gabinete proprietário, com exclusão em cascata;
- `created_by_user_id`: usuário criador;
- `name`: nome obrigatório, entre 2 e 60 caracteres;
- `description`: descrição opcional, até 500 caracteres;
- `color`: cor hexadecimal no formato `#RRGGBB`;
- `icon`: identificador de uma lista permitida de ícones Lucide;
- `display_order`: posição inteira não negativa;
- `active`: status ativo/inativo;
- `created_at` e `updated_at`.

O nome será único sem diferenciar maiúsculas e minúsculas dentro do mesmo gabinete. A tabela `political_alliances` receberá `line_id`, chave estrangeira anulável com exclusão restrita. A nulabilidade preserva registros legados e representa “Sem linha”. Novas alianças criadas pela interface exigirão uma linha ativa.

## Migração

Para cada gabinete com alianças existentes:

1. Criar linhas iniciais a partir das ideologias efetivamente usadas pelos partidos das alianças.
2. Aplicar as cores atualmente usadas pela interface para preservar a apresentação.
3. Associar cada aliança à linha correspondente à ideologia do seu partido.
4. Manter como “Sem linha” qualquer registro que não possa ser classificado.

A migration será idempotente, terá índices por gabinete, status e ordenação, e não removerá dados existentes. O rollback documentado remove primeiro a coluna `line_id` e depois a tabela de linhas.

## API

Todas as rotas exigem autenticação, permissão `alliances` e isolamento por `account_id`.

### `GET /api/alliance-lines`

Lista as linhas do gabinete ordenadas por `display_order` e nome. Aceita `includeInactive=true` para a tela de gerenciamento.

### `POST /api/alliance-lines`

Cria uma linha. Body: `name`, `description?`, `color`, `icon`, `displayOrder?`, `active?`. Retorna `201` com a linha criada. Nome duplicado retorna `409`; payload inválido retorna `400`.

### `PATCH /api/alliance-lines/:id`

Edita somente uma linha do gabinete autenticado. Aceita os mesmos campos de criação de forma parcial. Retorna `404` para linha inexistente ou de outro gabinete.

### `PUT /api/alliance-lines/reorder`

Recebe `{ ids: string[] }`, valida que todos os IDs pertencem ao gabinete e atualiza a ordem em transação. IDs ausentes, repetidos ou externos retornam `400`.

### `DELETE /api/alliance-lines/:id`

Exclui somente linhas sem alianças vinculadas. Linha em uso retorna `409` com orientação para reclassificar os registros. Para preservar histórico, a interface oferecerá inativação como ação principal.

### Alterações em alianças

`GET /api/alliances` passa a incluir `line`. `POST /api/alliances` e `PATCH /api/alliances/:id` aceitam `lineId`; o backend valida existência, gabinete e status ativo. Convites aceitos criam alianças sem linha quando não houver classificação escolhida e ficam visíveis em “Sem linha” para revisão.

## Interface

### Gerenciamento de linhas

Adicionar o botão `Gerenciar linhas` no cabeçalho de Alianças Políticas. Um diálogo amplo exibirá uma lista ordenável com amostra da cor, ícone, nome, descrição, quantidade de alianças e status.

O formulário de criação e edição terá:

- nome e descrição;
- seletor visual de cor e entrada hexadecimal sincronizados;
- seletor de ícone com opções permitidas;
- controle de ordem;
- chave ativo/inativo;
- pré-visualização do badge.

As ações usarão ícones com tooltips. A exclusão pedirá confirmação e mostrará claramente quando a linha estiver em uso.

### Página de alianças

- Substituir “Ideologia dominante” por “Linha predominante”.
- Adicionar filtro por linha, incluindo “Sem linha”.
- Mostrar badge da linha nos aliados, usando cor com contraste calculado.
- Aplicar a cor da linha no destaque visual do aliado sem alterar a identidade do partido.
- Incluir `lineId` nos formulários de criação e edição.
- Preservar o agrupamento principal por partido para não quebrar convites e operações existentes.
- Exibir um resumo horizontal ordenado das linhas com contagem de aliados; clicar no resumo ativa o filtro.
- Incluir nome da linha nos relatórios PDF e Excel.

## Estados e acessibilidade

A interface terá estados de carregamento, vazio, erro e ausência de linhas ativas. Cores nunca serão o único indicador: nome e ícone sempre acompanham o destaque. O contraste do texto será calculado entre preto e branco, e controles terão rótulo acessível e navegação por teclado.

## Segurança e integridade

- Validar todos os payloads com Zod.
- Nunca aceitar `accountId` ou `createdByUserId` enviados pelo cliente.
- Verificar o gabinete em leitura, edição, reordenação e exclusão.
- Restringir ícones a uma allowlist para impedir conteúdo arbitrário.
- Usar transação para reordenação e migration.
- Não permitir associação a linha inativa ou de outro gabinete.

## Testes

- Schema: nome, cor, ícone, ordem e limites de texto.
- Storage/API: CRUD, duplicidade, isolamento entre gabinetes, reordenação e exclusão protegida.
- Alianças: associação válida, rejeição de linha externa/inativa e retorno enriquecido.
- Migração: criação, backfill por ideologia, repetição idempotente e preservação de registros.
- Frontend: filtro, contraste, formulário e estado “Sem linha”.
- E2E: criar linha, alterar cor, criar aliança vinculada, filtrar e editar a linha.

## Critérios de aceite

1. Administrador cria, edita, reordena, ativa e inativa linhas sem recarregar a página.
2. Cor, ícone, nome e descrição aparecem de forma consistente nos aliados e resumos.
3. Uma aliança possui no máximo uma linha e não pode usar linha externa ou inativa.
4. Registros atuais permanecem disponíveis e são classificados quando possível.
5. Linha em uso não pode ser excluída.
6. Filtros, PDF e Excel refletem a linha escolhida.
7. Testes unitários, integração, E2E, TypeScript e build passam.

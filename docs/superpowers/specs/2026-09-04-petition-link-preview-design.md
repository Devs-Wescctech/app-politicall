# Prévia de compartilhamento de petições

## Objetivo

Fazer links públicos de petições exibirem uma prévia específica da petição no WhatsApp e em outras redes compatíveis com Open Graph. A prévia deve apresentar foto, título, resumo, quantidade atual de assinaturas e meta.

## Causa do problema atual

O manipulador de `/p/:slug` já tenta injetar metadados Open Graph, mas lê `client/index.html`. A imagem final de produção copia apenas os artefatos de `dist`, portanto esse arquivo não existe no contêiner. A leitura falha, o manipulador continua para o fallback da SPA e o robô do WhatsApp recebe o título, a descrição e o ícone genéricos do Politicall.

## Conteúdo da prévia

Para uma petição pública válida, o HTML entregue aos robôs deve conter:

- `og:title`: título da petição.
- `og:description`: resumo da descrição, seguido de uma frase com assinaturas, meta e chamada para ação.
- `og:image`: banner da petição; na ausência dele, logo da petição; na ausência de ambos, imagem padrão pública do Politicall.
- `og:url`: URL canônica no domínio público configurado.
- `og:type`: `website`.
- `og:site_name`: `Politicall`.
- `og:locale`: `pt_BR`.
- `og:image:alt`: texto alternativo ligado ao título da petição.
- `twitter:card`: `summary_large_image`, além dos equivalentes de título, descrição e imagem.
- `<title>`, descrição HTML e link canônico coerentes com a prévia.

O resumo deve remover marcação HTML e espaços repetidos, preservar texto legível e respeitar um limite adequado a cartões sociais. A parte dinâmica deve usar números em português, por exemplo: `128 assinaturas de uma meta de 500. Assine e compartilhe esta petição.`

## Visibilidade

Somente petições com visibilidade pública podem gerar prévia individual. Petições inexistentes, em rascunho ou pausadas devem usar a prévia genérica e não expor seus dados. Petições publicadas e concluídas permanecem publicamente visíveis, conforme a regra já usada pela página pública.

## URLs e imagens

URLs absolutas `http` ou `https` serão preservadas. Caminhos relativos, como `/uploads/petitions/imagem.jpg`, serão convertidos para URL absoluta usando a origem pública da requisição. Imagens em `data:` não serão publicadas em metadados sociais e cairão para a imagem padrão.

A origem pública respeitará os cabeçalhos encaminhados pelo proxy e a configuração da aplicação, sem produzir host duplicado ou protocolo incorreto. A URL canônica removerá parâmetros de rastreamento e será formada apenas por `/p/:slug`.

## Arquitetura

A montagem dos dados da prévia e a injeção no HTML ficarão em funções pequenas e testáveis, separadas do bootstrap do servidor. O manipulador HTTP será responsável apenas por:

1. reconhecer um robô social;
2. buscar a petição pelo slug;
3. aplicar a regra de visibilidade;
4. gerar os metadados;
5. carregar o template correto para desenvolvimento ou produção;
6. devolver o HTML resultante.

Em produção, o template será resolvido a partir de `dist/public/index.html`, compatível com o conteúdo copiado pelo Dockerfile. Em desenvolvimento, será usado `client/index.html`.

## Cache

A resposta da prévia permitirá cache curto e revalidação para reduzir consultas repetidas sem manter título, foto ou contagem desatualizados por muito tempo. Não será criado armazenamento permanente de cartões.

## Tratamento de falhas

- Falha ao buscar uma petição ou montar sua prévia: registrar erro sem dados sensíveis e continuar para a SPA genérica.
- Imagem ausente ou inválida: usar imagem padrão.
- Descrição vazia após limpeza: usar chamada para assinatura.
- Template ausente: tentar o caminho compatível com o ambiente; se nenhum existir, seguir para o fallback existente.

## Testes

Os testes cobrirão:

- detecção dos robôs sociais relevantes;
- template correto em desenvolvimento e produção;
- título, resumo, assinaturas e meta;
- banner, fallback para logo e fallback para imagem padrão;
- conversão de imagem relativa em URL absoluta;
- remoção de HTML e truncamento seguro da descrição;
- escape de valores nos metadados;
- URL canônica sem parâmetros;
- não exposição de petições privadas;
- resposta integrada da rota `/p/:slug` para um User-Agent do WhatsApp.

## Fora de escopo

- Geração de imagem social personalizada em tempo real.
- Upload de um arquivo exclusivo para Open Graph.
- Limpeza do cache controlado pelo próprio WhatsApp.
- Alteração da tela administrativa de edição da petição.

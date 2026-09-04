# Compartilhamento apos assinatura de peticao

## Objetivo

Transformar o modal de confirmacao da assinatura em um proximo passo claro para o apoiador, separando o contato direto com o responsavel pela iniciativa da divulgacao publica da peticao.

## Experiencia

Depois de assinar, o usuario ve a confirmacao e duas areas independentes:

1. **Fale com o proponente da peticao**: aparece somente quando a peticao possui ao menos uma rede de contato configurada. Reutiliza WhatsApp, Facebook, X/Twitter e Telegram cadastrados na peticao. O WhatsApp continua usando a mensagem personalizada e as variaveis preenchidas pelo assinante.
2. **Compartilhe esta peticao**: aparece sempre e oferece WhatsApp, Facebook, X/Twitter, Telegram e copia do link publico. O texto usa `shareText`, quando configurado, ou a mensagem padrao existente.

As duas areas usam titulos, rotulos acessiveis e tooltips que deixam explicito se a acao abre o perfil do proponente ou compartilha a peticao.

## Arquitetura

- Reutilizar a lista `socialShares` ja calculada pela pagina publica.
- Reutilizar `buildPetitionContactLinks` para os canais do proponente.
- Manter a construcao dos links em funcoes existentes, evitando duplicar regras de URL ou formatacao.
- Alterar apenas o componente publico da peticao e seus testes de interface.
- Nao criar coluna, endpoint ou migracao.

## Regras

- O titulo anterior `Fale com o politico` passa a ser `Fale com o proponente da peticao`.
- Textos de acessibilidade usam `proponente da peticao`, nunca `politico`.
- O compartilhamento continua disponivel mesmo sem redes do proponente configuradas.
- A copia do link deve fornecer retorno visual de sucesso ou falha ao usuario.
- Links externos abrem em uma nova aba com protecao contra acesso ao contexto da pagina de origem.
- O modal deve funcionar sem sobreposicao em telas moveis e desktop.

## Tratamento de falhas

- Falha ao copiar o link mostra uma mensagem objetiva e nao fecha o modal.
- Bloqueio de popup nao altera o estado da assinatura.
- Redes de contato invalidas continuam sendo descartadas pela validacao existente.

## Validacao

- Testes unitarios verificam os textos, a presenca das cinco acoes de compartilhamento e a condicao da secao de contato.
- Typecheck, suite completa, verificacao de seguranca e build de producao devem passar.
- A pagina publica sera validada em desktop e mobile antes da publicacao.
- A publicacao usara imagem imutavel e preservara um ponto de rollback no servidor.

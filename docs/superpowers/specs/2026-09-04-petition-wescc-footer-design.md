# Rodape WESCC Tech na peticao publica

## Objetivo

Exibir, ao final de toda pagina publica de peticao, a identificacao clicavel
"Plataforma desenvolvida por WESCC Tech".

## Comportamento

- O rodape aparece depois do conteudo e dos controles de compartilhamento.
- Todo o texto funciona como link para `https://wescctech.com.br/`.
- O site externo abre em uma nova aba.
- O link usa `rel="noopener noreferrer"` para impedir acesso da pagina externa a aba de origem.

## Apresentacao

- Texto centralizado, discreto e legivel sobre o fundo da peticao.
- Separacao visual leve em relacao ao conteudo principal.
- Estado de foco visivel para navegacao por teclado.
- Layout responsivo sem alterar o formulario, o compartilhamento ou o modal de confirmacao.

## Validacao

- Teste automatizado verifica texto, URL, nova aba, atributos de seguranca e identificador de teste.
- A verificacao inclui TypeScript e build da aplicacao.
- A pagina sera conferida em viewport desktop e movel antes da entrega.

## Fora de escopo

- Inclusao de logotipo ou imagem da WESCC Tech.
- Alteracao do rodape de outras paginas.
- Mudancas no fluxo de assinatura da peticao.

# Mensagem inicial de WhatsApp da peticao

## Objetivo

Permitir que cada peticao configure uma mensagem inicial para o botao de
contato do WhatsApp exibido depois da assinatura. A mensagem deve aceitar
variaveis do contexto da assinatura e o telefone brasileiro deve ser
normalizado antes da montagem do link `wa.me`.

O texto de contato continua independente do campo existente "Texto de
compartilhamento", pois os dois recursos atendem fluxos diferentes.

## Experiencia administrativa

O formulario de criacao e edicao da peticao exibira o campo opcional
"Mensagem inicial do WhatsApp" logo abaixo do telefone de contato. O campo
sera uma area de texto com limite de 1.000 caracteres e apresentara as
variaveis permitidas:

- `{nome}`: nome informado pelo apoiador.
- `{cidade}`: cidade informada pelo apoiador; resulta em texto vazio quando
  nao preenchida.
- `{peticao}`: titulo da peticao.
- `{link}`: URL publica canonica da peticao.

Variaveis desconhecidas serao recusadas no formulario e no backend. A
mensagem e opcional; quando estiver vazia, o botao continuara abrindo apenas
a conversa com o numero configurado.

## Normalizacao do telefone

O valor administrativo pode conter espacos, parenteses, hifens e o prefixo
`+`. A representacao persistida e usada no link contera somente digitos.

- Telefones brasileiros com 10 ou 11 digitos receberao automaticamente o
  DDI `55`.
- Telefones com `55` e 12 ou 13 digitos serao preservados.
- Outros numeros internacionais entre 12 e 15 digitos serao preservados.
- Valores curtos, longos ou ambiguos serao rejeitados.

Exemplo: `(51) 99999-0000` resulta em `5551999990000` e gera
`https://wa.me/5551999990000`.

## Persistencia e API

A tabela `petitions` recebera a coluna nullable
`contact_whatsapp_message`. A migration sera aditiva e idempotente para
manter compatibilidade com rollback de imagem.

O campo `contactWhatsappMessage` participara dos contratos de criacao,
edicao e leitura administrativa. A resposta publica da peticao podera
expor o modelo de mensagem, pois ele e conteudo destinado ao apoiador e nao
um segredo.

## Montagem do link

A substituicao das variaveis ocorrera no navegador somente depois da
assinatura confirmada, usando os dados enviados pelo apoiador e a peticao
carregada. O texto final sera codificado com `encodeURIComponent` e anexado
ao link como parametro `text`:

```text
https://wa.me/5551999990000?text=<mensagem-codificada>
```

O construtor compartilhado de links recebera explicitamente o contexto de
interpolacao. Ele nao interpretara HTML e nao executara conteudo da
mensagem. Os demais links sociais permanecerao inalterados.

## Tratamento de erros

- Telefone invalido impede o salvamento e informa que DDI e DDD sao
  obrigatorios ou inferidos para numeros brasileiros.
- Mensagem acima do limite impede o salvamento.
- Variavel desconhecida indica quais variaveis sao aceitas.
- Ausencia de telefone torna a mensagem inativa, sem criar um link parcial.
- Ausencia de um valor opcional, como cidade, produz texto vazio e nunca a
  palavra `undefined`.

## Testes

Os testes automatizados cobrirao:

- adicao de `55` a telefones brasileiros de 10 e 11 digitos;
- preservacao de numeros brasileiros e internacionais ja completos;
- rejeicao de telefones invalidos;
- validacao das variaveis e do limite da mensagem;
- interpolacao e codificacao segura de todas as variaveis;
- link sem parametro `text` quando a mensagem estiver vazia;
- contratos de API, migration PostgreSQL e presenca dos controles no
  formulario administrativo;
- fluxo publico mantendo compartilhamento e contato como acoes distintas.

## Publicacao e rollback

A entrega seguira a pipeline do repositorio e usara imagem imutavel. Antes
de uma futura publicacao sera registrado o digest vigente e criado backup
do banco, uploads, Compose e ambiente. Como a migration apenas adiciona uma
coluna nullable, o rollback da imagem permanece compativel sem remover a
coluna.

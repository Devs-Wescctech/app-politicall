# Fundacao de release GitHub e Portainer

## Contexto

O Politicall esta em producao como um projeto Docker Compose em Docker Standalone. A aplicacao usa uma imagem privada no GHCR, publica a porta 5000 e acessa um PostgreSQL que roda em outro container no mesmo servidor. O Nginx e o TLS sao externos ao container e nao ha acesso SSH disponivel.

O container atual deve permanecer funcionando ate o gate final. O novo fluxo substituira referencias mutaveis por releases reproduziveis, auditaveis e reversiveis.

## Decisoes aprovadas

- O PostgreSQL continuara fora da stack do Politicall.
- A stack nao criara, removera ou recriara o banco.
- O ambiente alvo e Docker Standalone administrado pelo Portainer.
- O repositorio de origem e `Devs-Wescctech/app-politicall`.
- O GitHub Actions construira e publicara a imagem no GHCR.
- A stack consumira `IMAGE_REFERENCE` completa, por tag SHA ou digest.
- Decisao atualizada: o contrato passou a aceitar `ghcr.io/<org>/<app>:sha-<commit>` e `ghcr.io/<org>/<app>@sha256:<64-hex-digest>` em uma unica variavel, evitando concatenacao invalida e permitindo pin por digest.
- O volume de `uploads` continuara persistente no host.
- O Nginx existente continuara atendendo o dominio e a porta 5000.
- Credenciais de teste nao serao copiadas para arquivos, logs, commits ou documentacao.
- Segredos reais serao rotacionados antes da liberacao definitiva.

## Alternativas consideradas

### Imagem imutavel produzida no GitHub Actions

E a abordagem escolhida. TypeScript, testes, auditoria, build e scan de imagem executam antes da publicacao. O Portainer recebe apenas uma imagem aprovada e uma tag conhecida, permitindo rollback direto.

### Build do codigo dentro do Portainer

Foi descartado como fluxo principal porque mistura compilacao e operacao, aumenta o tempo de indisponibilidade e reduz a qualidade do gate.

### Atualizacao manual usando referencia mutavel

Foi descartada porque nao identifica exatamente qual codigo esta em execucao e dificulta rollback.

## Higiene do repositorio e contexto Docker

Antes do primeiro commit completo:

- Ignorar `.runtime/`, `backups/`, `dist/`, `node_modules/`, `uploads/*`, `graphify-out/`, o Vault local do Obsidian, arquivos compactados, logs, PIDs e configuracoes administrativas locais.
- Preservar apenas `uploads/.gitkeep`.
- Aplicar as mesmas exclusoes no `.dockerignore`, incluindo dados locais do PostgreSQL, backups e o Vault.
- Executar varredura de segredos sobre todos os arquivos candidatos ao commit.
- Bloquear o commit quando houver private key, token conhecido, URL de banco com credencial ou arquivo `.env`.
- Manter o repositorio privado ate que licenca e direitos dos assets sejam formalmente definidos.

A chave privada detectada no Vault nao sera lida, movida ou alterada pelo projeto. O Vault e seus arquivos compactados ficarao fora do Git e do build. A chave devera ser rotacionada pelo responsavel pelo Obsidian antes da publicacao final.

## Dependencias e runtime

- Atualizar o runtime e o CI para Node.js 24 LTS.
- Separar dependencias de build/teste das dependencias realmente usadas em producao.
- Eliminar vulnerabilidades altas do `npm audit --omit=dev`.
- Preservar importacao e exportacao Excel com testes de regressao.
- Usar imagem multi-stage e instalar somente dependencias de producao no stage final.
- Executar como usuario sem privilegio.
- Nao copiar codigo-fonte, configuracao Vite, testes ou artefatos locais para a imagem final quando nao forem necessarios.

## Banco e migracoes

Sera criado um runner de migracoes de producao em Node.js:

1. Le `PROD_DATABASE_URL` somente do ambiente.
2. Abre conexao com timeout.
3. Adquire advisory lock exclusivo no PostgreSQL.
4. Cria uma tabela de controle de migracoes quando ausente.
5. Aplica apenas scripts ainda nao registrados, em ordem deterministica.
6. Executa cada migracao em transacao quando o SQL permitir.
7. Registra hash, nome e horario da migracao.
8. Libera a trava e encerra a conexao.
9. Falha o deploy antes de iniciar a aplicacao se qualquer migracao falhar.

O runner nao cria usuario administrador, nao carrega dados de exemplo e nao usa o bootstrap de desenvolvimento.

O deploy exige backup do banco antes da migracao. O runbook tera comandos de `pg_dump`, validacao do arquivo e restauracao. A aplicacao somente inicia depois do runner terminar com sucesso.

## Compose para Portainer

O Compose tera um unico servico de aplicacao e nao incluira PostgreSQL.

- Imagem: `${IMAGE_REFERENCE}` completa e imutavel.
- Rede: `production` externa, com nome obrigatorio em `${APP_NETWORK_NAME}`, compartilhada com o container PostgreSQL existente.
- Porta publica: configuravel, com valor padrao 5000.
- `PROD_DATABASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` e `ADMIN_MASTER_PASSWORD_HASH` obrigatorios.
- Volume persistente configuravel para `/app/uploads`.
- Health check em `/api/ready`, que valida banco.
- Politica `unless-stopped`.
- Limites de memoria e PIDs.
- `no-new-privileges` e capabilities removidas quando compativeis.
- Logs Docker com `max-size` e `max-file`.
- Periodo de parada suficiente para graceful shutdown.

A conexao preferencial ao PostgreSQL usa a rede Docker externa estavel e o nome DNS do container. O endpoint publicado no host permanece opcao legada, com firewall restritivo, enquanto a aplicacao continua conectada a rede externa. O Compose nao cria nem altera o servico PostgreSQL.

## Pipeline GitHub

O workflow sera reorganizado para que a publicacao dependa de todos os gates:

1. Instalar com `npm ci`.
2. Verificar TypeScript.
3. Executar todos os testes.
4. Executar `npm audit --omit=dev --audit-level=high`.
5. Construir a aplicacao.
6. Construir a imagem para `linux/amd64`.
7. Fazer scan Trivy com falha para vulnerabilidade alta ou critica.
8. Publicar tags por SHA e release somente depois dos gates.

O workflow nao instalara a ultima versao do npm de forma implicita. Actions de terceiros terao versao fixa e permissoes minimas.

## Deploy e rollback

1. Gerar backup do banco e confirmar restaurabilidade.
2. Registrar o digest atualmente em producao.
3. Publicar a nova imagem imutavel.
4. Atualizar `IMAGE_REFERENCE` no Portainer com a tag SHA ou digest aprovado.
5. Recriar o container mantendo o volume de uploads.
6. Aguardar `/api/ready`.
7. Executar smoke de login, dashboard e atendimento.
8. Em falha, restaurar a tag/digest anterior.

Como nao ha controle do Nginx, a troca reutilizara a porta 5000 e podera causar uma janela curta. O container atual nao sera removido antes de o rollback estar documentado.

## Observabilidade

- Logs vao para stdout/stderr sem segredos.
- Cada inicializacao registra versao, commit e status das migracoes.
- Liveness e readiness permanecem separados.
- O container deve encerrar novas requisicoes em `SIGTERM`, fechar servidor HTTP, WebSocket e pool PostgreSQL, e sair dentro do timeout.

## Testes e criterios de aceite

- `.gitignore` e `.dockerignore` bloqueiam todos os artefatos locais identificados.
- A varredura de segredos nao encontra credenciais reais no conjunto versionado.
- TypeScript, 351 testes existentes e novos testes passam.
- `npm audit --omit=dev --audit-level=high` termina com codigo zero.
- O runner aplica migracoes uma unica vez e lida com duas instancias concorrentes.
- Uma falha de migracao impede a aplicacao de iniciar.
- A imagem final usa Node.js 24, usuario sem privilegio e dependencias de producao.
- `/api/health` responde sem consultar dependencias.
- `/api/ready` retorna 503 quando o banco esta indisponivel.
- O Compose aceita configuracao do Portainer sem conter segredos.
- A imagem pode ser revertida para o digest anterior sem perda de uploads.

## Fora de escopo

- Administrar o container PostgreSQL.
- Alterar DNS, certificado ou configuracao do Nginx no servidor.
- Criar credenciais reais no GitHub ou Portainer.
- Publicar o repositorio sem autorizacao e credenciais do proprietario.

# Politicall local com Docker

## Pré-requisito

- Docker Desktop aberto e com o engine Linux em execução.

Não é necessário instalar Node.js nem PostgreSQL no Windows.

## Iniciar

Na pasta do projeto, execute:

```powershell
docker compose --env-file .env.local.example -f docker-compose.local.yml up --build
```

Na primeira execução, o sistema cria o banco, aplica o schema e as migrations e
insere dados de demonstração. Isso pode levar alguns minutos. Quando o serviço
`app` estiver saudável, acesse <http://localhost:5000/login>.

Em todas as inicializações seguintes, o servidor verifica o histórico de
migrations por nome e hash antes de abrir a aplicação. Migrations pendentes são
aplicadas dentro de transação; arquivos já registrados não podem ser alterados.

Credenciais locais de demonstração:

- E-mail: `adm@politicall.com.br`
- Senha: `admin123`

Essas credenciais e as chaves do Compose são apenas para desenvolvimento local.
O arquivo de produção (`docker-compose.yml`) permanece separado.

## Comandos úteis

```powershell
# Executar os testes unitários no container
docker compose -f docker-compose.local.yml exec app npm test

# Verificar/aplicar migrations e o seed local manualmente
docker compose -f docker-compose.local.yml exec app npx tsx scripts/setup-dev-db.ts

# Ver os logs
docker compose -f docker-compose.local.yml logs -f app

# Parar sem apagar o banco
docker compose -f docker-compose.local.yml down

# Recriar somente a aplicação após mudar dependências
docker compose -f docker-compose.local.yml up --build app
```

Para trocar portas, copie `.env.local.example` para `.env.local`, altere os
valores e use `--env-file .env.local` no comando de inicialização.

Fora do container, o seed exige a confirmação explícita
`ALLOW_DEVELOPMENT_SEED=seed-development-data` e recusa execução quando
`NODE_ENV=production` ou quando `DATABASE_URL` coincide com
`PROD_DATABASE_URL`.

## Reiniciar do zero

O comando abaixo apaga somente os volumes do projeto local, incluindo seus dados
de teste, e faz o seed novamente na próxima inicialização:

```powershell
docker compose -f docker-compose.local.yml down -v
```

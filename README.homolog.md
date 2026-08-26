# Politicall — homologação local isolada

Este ambiente executa a aplicação no modo de produção, com a mesma imagem
construída pelo `Dockerfile`, PostgreSQL 18.1 e recursos Docker independentes do
desenvolvimento local. O banco não publica porta no Windows e não se conecta ao
banco de produção.

## Iniciar

O arquivo `.env.homolog.local` é local e ignorado pelo Git. Para preparar outro
computador, copie `.env.homolog.example`, renomeie a cópia e substitua todos os
valores indicados por credenciais aleatórias. `HOMOLOG_DATABASE_URL` deve usar
o mesmo banco, usuário e senha definidos nas variáveis `HOMOLOG_DB_*`.

```powershell
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml up --build -d
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml ps
```

Quando `app` estiver saudável e `seed` estiver com estado `Exited (0)`, acesse
<http://localhost:5100/login>.

Credenciais fictícias:

- E-mail: `adm.homolog@politicall.local`
- Senha: `homolog123`

O startup da imagem executa o migrador transacional antes de iniciar o servidor.
O seed roda depois do health check e pode ser repetido sem duplicar registros.

## Operação

```powershell
# Logs
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml logs -f app

# Reaplicar o seed fictício
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml run --rm seed

# Parar preservando banco e uploads
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml down
```

## Reiniciar do zero

O comando abaixo remove exclusivamente os volumes do projeto de homologação.
Ele apaga os dados fictícios desse ambiente e não afeta desenvolvimento ou
produção:

```powershell
docker compose --env-file .env.homolog.local -f docker-compose.homolog.yml down -v
```

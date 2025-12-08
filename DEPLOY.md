# Deploy via Docker - POLITICALL

## Pré-requisitos

- Docker instalado no servidor
- Acesso ao GHCR (GitHub Container Registry)
- PostgreSQL disponível (local ou remoto)

## 1. Autenticar no GHCR

```bash
# Crie um Personal Access Token em https://github.com/settings/tokens
# com permissão "read:packages"

echo "SEU_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin
```

## 2. Puxar a Imagem

```bash
# Puxar a versão mais recente
docker pull ghcr.io/devs-wescctech/app-politicall:latest

# Ou uma versão específica
docker pull ghcr.io/devs-wescctech/app-politicall:v1.0.0
```

## 3. Executar o Container

### Opção A: Docker Run (simples)

```bash
docker run -d \
  --name politicall \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://usuario:senha@host:5432/banco" \
  -e SESSION_SECRET="sua_chave_secreta_segura_aqui" \
  -e NODE_ENV="production" \
  --restart unless-stopped \
  ghcr.io/devs-wescctech/app-politicall:latest
```

### Opção B: Docker Compose (recomendado)

Crie um arquivo `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/devs-wescctech/app-politicall:latest
    container_name: politicall
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SESSION_SECRET=${SESSION_SECRET}
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # Opcional: PostgreSQL local
  postgres:
    image: postgres:15-alpine
    container_name: politicall-db
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=politicall
      - POSTGRES_PASSWORD=sua_senha_segura
      - POSTGRES_DB=politicall
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

Crie um arquivo `.env`:

```env
DATABASE_URL=postgresql://politicall:sua_senha_segura@postgres:5432/politicall
SESSION_SECRET=sua_chave_secreta_muito_longa_e_segura_aqui
```

Execute:

```bash
docker-compose up -d
```

## 4. Restaurar o Banco de Dados

Após o container estar rodando, restaure o backup:

```bash
# Se usando PostgreSQL local
docker exec -i politicall-db psql -U politicall -d politicall < db_backup/backup_20251208_221725.sql

# Se usando PostgreSQL remoto
psql "$DATABASE_URL" < db_backup/backup_20251208_221725.sql
```

## 5. Verificar Status

```bash
# Ver logs
docker logs politicall

# Verificar health
curl http://localhost:5000/api/health

# Ver containers rodando
docker ps
```

## 6. Nginx Reverse Proxy (Produção)

Para usar com HTTPS e domínio próprio, configure o Nginx:

```nginx
server {
    listen 80;
    server_name politicall.com.br www.politicall.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name politicall.com.br www.politicall.com.br;

    ssl_certificate /etc/letsencrypt/live/politicall.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/politicall.com.br/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 7. Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `DATABASE_URL` | URL de conexão PostgreSQL | ✅ Sim |
| `SESSION_SECRET` | Chave secreta para JWT | ✅ Sim |
| `NODE_ENV` | Ambiente (production/development) | ✅ Sim |
| `PORT` | Porta do servidor (padrão: 5000) | ❌ Não |

## 8. Atualizações

Para atualizar para uma nova versão:

```bash
# Puxar nova imagem
docker pull ghcr.io/devs-wescctech/app-politicall:latest

# Recriar container
docker-compose down
docker-compose up -d

# Ou com docker run
docker stop politicall
docker rm politicall
docker run ... (mesmos parâmetros)
```

## Suporte

Desenvolvido por: David Flores Andrade
Website: www.politicall.com.br

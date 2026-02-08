# GUIA DE MIGRAÇÃO - Replit para GitHub + Servidor Próprio
## Processo completo passo a passo

Este guia documenta o processo que utilizamos para migrar um sistema do Replit para o GitHub com deploy automatizado no servidor próprio via Docker. Use como referência para replicar com qualquer outro projeto.

---

## ETAPA 1: CRIAR O REPOSITÓRIO NO GITHUB

1. Acesse https://github.com e crie um novo repositório (privado ou público)
   - Exemplo: `Devs-Wescctech/nome-do-projeto`
   - Não inicialize com README (o código já existe no Replit)

2. Gere um **Personal Access Token (PAT)** no GitHub:
   - Vá em: GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
   - Clique em "Generate new token (classic)"
   - Marque os escopos: `repo`, `write:packages`, `read:packages`
   - Copie o token gerado (ele aparece uma única vez)

---

## ETAPA 2: CONECTAR O REPLIT AO GITHUB

No terminal do Replit, execute:

```bash
# Configurar o remote apontando para o GitHub com o token na URL
git remote add origin https://<SEU_TOKEN>@github.com/<SUA_ORG>/<NOME_REPO>.git

# Se o remote "origin" já existir, use set-url:
git remote set-url origin https://<SEU_TOKEN>@github.com/<SUA_ORG>/<NOME_REPO>.git

# Definir a branch principal
git branch -M main

# Fazer o primeiro push
git push -u origin main
```

A partir daqui, o Replit envia automaticamente o código para o GitHub a cada commit.

**Se o token expirar**, gere um novo e atualize com o mesmo comando `git remote set-url`.

---

## ETAPA 3: PREPARAR O DOCKERFILE

Crie um `Dockerfile` na raiz do projeto. O modelo que usamos é um build em dois estágios (otimiza o tamanho da imagem):

```dockerfile
# ---- Estágio 1: Build ----
FROM node:20-slim AS builder
WORKDIR /app

# Dependências de compilação para módulos nativos (ex: bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Instalar dependências (copia package*.json primeiro para melhor cache)
COPY package*.json ./
RUN npm ci

# Copiar código e compilar
COPY . .
RUN npm run build

# ---- Estágio 2: Produção ----
FROM node:20-slim AS production
WORKDIR /app

# Ferramentas para health check
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root (segurança)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash nodejs

# Instalar dependências de produção
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copiar artefatos compilados do builder
COPY --from=builder /app/dist ./dist

# Copiar arquivos necessários em runtime
# (ajuste conforme o seu projeto)
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/client ./client
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Criar pastas de uploads se necessário
RUN mkdir -p uploads && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Health check automático
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:5000/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.js"]
```

Crie também o `.dockerignore` para não copiar lixo:

```
node_modules
.git
.gitignore
.env
.env.*
*.md
!README.md
.github
*.log
*.tmp
dist
uploads/*
!uploads/.gitkeep
.replit
replit.nix
```

---

## ETAPA 4: CRIAR O GITHUB ACTIONS (CI/CD)

Crie o arquivo `.github/workflows/build.yml`. Este workflow compila, testa e publica a imagem Docker automaticamente:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # Job 1: Verificar TypeScript
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run check

  # Job 2: Compilar a aplicação
  build:
    name: Build Application
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 7

  # Job 3: Auditoria de segurança
  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-level=high
        continue-on-error: true

  # Job 4: Build e Push da imagem Docker
  # Só roda em push na main (não em pull requests)
  docker:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Login no GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Extrair metadados Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=,format=short
      - name: Build e push da imagem
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64

  # Job 5: Scan de vulnerabilidades na imagem
  scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: docker
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: read
      security-events: write
    steps:
      - name: Login GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
        continue-on-error: true
```

**O que acontece automaticamente:**
1. Você faz um commit no Replit
2. O Replit faz push para o GitHub
3. O GitHub Actions roda todos os jobs
4. A imagem Docker é publicada em `ghcr.io/<sua-org>/<nome-repo>:latest`

---

## ETAPA 5: CONFIGURAR O BANCO DE DADOS NO SERVIDOR

### Instalar PostgreSQL no servidor (se não tiver)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### Criar o banco e o usuário
```bash
sudo -u postgres psql

# Dentro do psql:
CREATE DATABASE nome_do_banco;
CREATE USER nome_usuario WITH PASSWORD 'sua_senha_aqui';
GRANT ALL PRIVILEGES ON DATABASE nome_do_banco TO nome_usuario;
# Se PostgreSQL 15+, também precisa:
\c nome_do_banco
GRANT ALL ON SCHEMA public TO nome_usuario;
\q
```

### Aplicar o schema das tabelas
```bash
# Clonar o repositório no servidor (temporariamente) para rodar as migrações
git clone https://<TOKEN>@github.com/<SUA_ORG>/<NOME_REPO>.git
cd <NOME_REPO>
npm install

# Aplicar schema
DATABASE_URL="postgresql://nome_usuario:sua_senha@localhost:5432/nome_do_banco" npx drizzle-kit push
```

### Migrar os dados (se tiver dados no Replit)
Se você tiver um script SQL de migração de dados:
```bash
psql -U nome_usuario -d nome_do_banco -f migration-script.sql
```

**Dica para exportar dados do Replit:** Use o `pg_dump` ou crie INSERTs manualmente para as tabelas que contêm dados.

---

## ETAPA 6: ADAPTAR O CÓDIGO PARA FUNCIONAR COM BANCO LOCAL

O Replit usa o banco Neon (serverless). No servidor, usamos PostgreSQL padrão. Para que o mesmo código funcione nos dois ambientes, o arquivo `server/db.ts` deve detectar automaticamente qual driver usar:

```typescript
// server/db.ts - Detecção automática Neon vs PostgreSQL padrão
import { createRequire } from 'module';
import * as schema from "@shared/schema";

const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') ||
                       process.env.DATABASE_URL.includes('neon-');

let db: any;
let pool: any;

if (isNeonDatabase) {
  // Replit / Neon
  const { Pool, neonConfig } = require('@neondatabase/serverless');
  const { drizzle } = require('drizzle-orm/neon-serverless');
  const ws = require('ws');
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  // Servidor próprio / PostgreSQL padrão
  const { Pool: PgPool } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
  });
  db = drizzle(pool, { schema });
}

export { pool, db };
```

**Pacotes necessários no package.json:**
- `@neondatabase/serverless` (para Neon/Replit)
- `pg` (para PostgreSQL padrão no servidor)
- `ws` (WebSocket para Neon)

---

## ETAPA 7: CRIAR O DOCKER-COMPOSE NO SERVIDOR

Crie um arquivo `docker-compose.yml` no servidor:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/<SUA_ORG>/<NOME_REPO>:latest
    container_name: app-<nome-do-projeto>
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DATABASE_URL=postgresql://<USUARIO>:<SENHA>@172.17.0.1:5432/<NOME_BANCO>
      - SESSION_SECRET=<GERAR_UM_SECRET_SEGURO>
      # Adicione outras variáveis conforme necessário:
      # - OPENAI_API_KEY=sk-xxx
    volumes:
      - ./uploads:/app/uploads
    mem_limit: 1g
    memswap_limit: 2g
    shm_size: '256mb'
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

networks:
  default:
    driver: bridge
```

**Observações importantes:**
- O host `172.17.0.1` é o IP padrão do host Docker (assim o container acessa o PostgreSQL instalado no servidor)
- Para gerar um SESSION_SECRET seguro: `openssl rand -base64 32`
- A pasta `uploads/` é montada como volume para persistir fora do container

---

## ETAPA 8: FAZER O DEPLOY NO SERVIDOR

### Primeira vez

```bash
# 1. Fazer login no GitHub Container Registry
echo "<SEU_GITHUB_PAT>" | docker login ghcr.io -u <SEU_USUARIO_GITHUB> --password-stdin

# 2. Criar pasta do projeto no servidor
mkdir -p /opt/<nome-do-projeto>
cd /opt/<nome-do-projeto>

# 3. Criar o docker-compose.yml (conforme Etapa 7)
nano docker-compose.yml

# 4. Criar pasta de uploads
mkdir -p uploads

# 5. Baixar e subir a aplicação
docker-compose pull
docker-compose up -d

# 6. Verificar se está funcionando
docker ps
docker logs -f app-<nome-do-projeto>
curl http://localhost:5000/api/health
```

### Atualizações futuras

Toda vez que fizer um commit no Replit e o GitHub Actions terminar de rodar:

```bash
cd /opt/<nome-do-projeto>
docker-compose pull
docker-compose up -d
```

Isso baixa a imagem nova e reinicia o container automaticamente.

---

## ETAPA 9: CONFIGURAR DOMÍNIO E HTTPS (OPCIONAL)

Se quiser acessar por um domínio (ex: www.meuprojeto.com.br), use o Nginx como proxy reverso:

```bash
# Instalar Nginx
sudo apt install nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/<nome-do-projeto>
```

Conteúdo:
```nginx
server {
    listen 80;
    server_name www.meuprojeto.com.br meuprojeto.com.br;

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
        client_max_body_size 50M;
    }
}
```

```bash
# Ativar e reiniciar
sudo ln -s /etc/nginx/sites-available/<nome-do-projeto> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Instalar SSL com Certbot (HTTPS gratuito)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d meuprojeto.com.br -d www.meuprojeto.com.br
```

---

## RESUMO DO FLUXO COMPLETO

```
┌─────────────┐     git push      ┌──────────────┐     build      ┌──────────┐
│   REPLIT     │ ───────────────>  │   GITHUB     │ ────────────>  │  GHCR    │
│ (código)     │   automático      │  (repositório)│  GitHub Actions│ (imagem  │
│              │                   │              │                │  Docker) │
└─────────────┘                   └──────────────┘                └──────────┘
                                                                       │
                                                                docker pull
                                                                       │
                                                                       v
                                                               ┌──────────────┐
                                                               │  SERVIDOR    │
                                                               │ (Docker +    │
                                                               │  PostgreSQL) │
                                                               └──────────────┘
```

1. Edita código no Replit
2. Replit faz push pro GitHub automaticamente
3. GitHub Actions compila e publica a imagem Docker no GHCR
4. No servidor, roda `docker-compose pull && docker-compose up -d`
5. Aplicação rodando com banco PostgreSQL local

---

## CHECKLIST PARA NOVO PROJETO

- [ ] Repositório criado no GitHub
- [ ] PAT gerado com escopos `repo` + `write:packages`
- [ ] Remote configurado no Replit com o token
- [ ] Primeiro push feito para o GitHub
- [ ] `Dockerfile` criado na raiz do projeto
- [ ] `.dockerignore` criado
- [ ] `.github/workflows/build.yml` criado
- [ ] GitHub Actions rodou com sucesso (verificar na aba Actions do repo)
- [ ] Imagem Docker publicada no GHCR
- [ ] PostgreSQL instalado no servidor
- [ ] Banco e usuário criados no servidor
- [ ] Schema aplicado com `drizzle-kit push`
- [ ] Dados migrados (se necessário)
- [ ] `docker-compose.yml` criado no servidor
- [ ] Login no GHCR feito no servidor
- [ ] Container rodando (`docker-compose up -d`)
- [ ] Health check respondendo (`curl localhost:5000/api/health`)
- [ ] Nginx configurado com domínio (opcional)
- [ ] HTTPS ativado com Certbot (opcional)

---

## COMANDOS ÚTEIS

```bash
# ---- Docker ----
docker-compose pull                  # Baixar imagem atualizada
docker-compose up -d                 # Subir container
docker-compose down                  # Parar container
docker-compose restart               # Reiniciar
docker logs -f <nome-container>      # Ver logs em tempo real
docker ps                            # Listar containers rodando
docker system prune -a               # Limpar imagens antigas (liberar espaço)

# ---- PostgreSQL ----
sudo -u postgres psql                # Acessar o psql como admin
psql -U <usuario> -d <banco>         # Acessar banco específico
pg_dump -U <usuario> <banco> > backup.sql  # Fazer backup
psql -U <usuario> <banco> < backup.sql     # Restaurar backup

# ---- Git (no Replit) ----
git remote -v                        # Ver remotes configurados
git remote set-url origin https://<TOKEN>@github.com/<ORG>/<REPO>.git  # Atualizar token
git push origin main                 # Push manual se necessário

# ---- Gerar secrets ----
openssl rand -base64 32              # Gerar SESSION_SECRET
node -e "const b=require('bcrypt');b.hash('SuaSenha',10).then(h=>console.log(h));"  # Hash bcrypt
```

---

*Guia de processo - para replicar a migração de qualquer sistema do Replit para GitHub + servidor próprio*

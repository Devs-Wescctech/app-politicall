# GUIA COMPLETO DE MIGRAÇÃO - POLITICALL
## De Replit para GitHub + Servidor Próprio

---

## 1. VISÃO GERAL DA ARQUITETURA

**Projeto:** Politicall - Plataforma de Gestão Política
**Stack:**
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Shadcn UI
- **Backend:** Node.js + Express.js
- **Banco de Dados:** PostgreSQL (Neon no Replit / PostgreSQL padrão no servidor)
- **ORM:** Drizzle ORM
- **Autenticação:** JWT com bcrypt
- **IA:** OpenAI (GPT-5)
- **Container:** Docker
- **CI/CD:** GitHub Actions

---

## 2. REPOSITÓRIO GITHUB

### Repositório Atual
- **URL:** `https://github.com/Devs-Wescctech/app-politicall`
- **Branch principal:** `main`
- **Token de acesso (PAT):** `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`

### Como o GitHub foi conectado ao Replit
1. Criamos um Personal Access Token (PAT) no GitHub
2. Configuramos o remote `origin` no Replit apontando para o repositório com o token embutido na URL:
   ```
   git remote set-url origin https://<TOKEN>@github.com/Devs-Wescctech/app-politicall.git
   ```
3. O Replit faz push automático na branch `main` a cada commit

### Registro de Container (Docker Images)
- As imagens Docker são publicadas automaticamente no **GitHub Container Registry (GHCR)**
- **Endereço da imagem:** `ghcr.io/devs-wescctech/app-politicall:latest`

---

## 3. CI/CD - GITHUB ACTIONS

O arquivo `.github/workflows/build.yml` possui 5 jobs que rodam automaticamente em cada push na `main`:

| Job | O que faz |
|-----|-----------|
| **Type Check** | Verifica erros de TypeScript (`npm run check`) |
| **Build** | Compila a aplicação (`npm run build`) |
| **Security Audit** | Auditoria de segurança dos pacotes npm |
| **Docker Build & Push** | Constrói a imagem Docker e publica no GHCR |
| **Security Scan** | Escaneia a imagem Docker com Trivy para vulnerabilidades |

**Importante:** O job de Docker só roda em push na `main` (não em pull requests).

A autenticação no GHCR é feita automaticamente pelo `GITHUB_TOKEN` (secret padrão do GitHub Actions).

---

## 4. DOCKER

### Dockerfile (Multi-stage Build)
O Dockerfile usa build em 2 estágios:

**Estágio 1 - Builder:**
- Base: `node:20-slim`
- Instala dependências de build (python3, make, g++)
- Roda `npm ci` e `npm run build`

**Estágio 2 - Production:**
- Base: `node:20-slim`
- Cria usuário não-root `nodejs` (segurança)
- Copia os artefatos compilados do builder
- Copia configs do Vite, Drizzle, client e shared
- Cria diretórios de uploads (avatars, backgrounds, temp)
- Expõe porta **5000**
- Health check: `GET http://localhost:5000/api/health` a cada 30s
- Comando: `node dist/index.js`

### docker-compose.yml (No Servidor)

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/devs-wescctech/app-politicall:latest
    container_name: app-politicall
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DATABASE_URL=postgresql://auth_bd:4uth@1307BD@172.17.0.1:5432/politicall
      - SESSION_SECRET=2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=
    volumes:
      - ./uploads:/app/uploads
    mem_limit: 1g
    memswap_limit: 2g
    shm_size: '256mb'
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

### Comandos Docker Essenciais

```bash
# Fazer login no GHCR (necessário para baixar a imagem)
echo "<GITHUB_PAT>" | docker login ghcr.io -u <USUARIO_GITHUB> --password-stdin

# Baixar a imagem mais recente
docker pull ghcr.io/devs-wescctech/app-politicall:latest

# Subir com docker-compose
docker-compose up -d

# Ver logs
docker logs -f app-politicall

# Parar
docker-compose down

# Atualizar para nova versão
docker-compose pull && docker-compose up -d
```

---

## 5. BANCO DE DADOS

### No Replit (Desenvolvimento)
- **Tipo:** Neon PostgreSQL (serverless)
- **Driver:** `@neondatabase/serverless` com WebSocket
- A conexão é detectada automaticamente pela URL conter "neon.tech"

### No Servidor (Produção)
- **Tipo:** PostgreSQL padrão
- **Driver:** `pg` (node-postgres)
- **Credenciais do servidor:**
  - **Host:** `172.17.0.1` (IP do host Docker)
  - **Porta:** `5432`
  - **Banco:** `politicall`
  - **Usuário:** `auth_bd`
  - **Senha:** `4uth@1307BD`
  - **DATABASE_URL:** `postgresql://auth_bd:4uth@1307BD@172.17.0.1:5432/politicall`

### Detecção Automática (server/db.ts)
O código detecta automaticamente se está usando Neon ou PostgreSQL padrão:
- Se a URL contém "neon.tech" ou "neon-" → usa driver Neon com WebSocket
- Caso contrário → usa driver `pg` padrão com SSL desabilitado

### Migrações
- **ORM:** Drizzle ORM
- **Schema:** `shared/schema.ts` (arquivo principal com todas as tabelas)
- **Config:** `drizzle.config.ts`
- **Pasta de migrações:** `migrations/`
- **Comando para aplicar schema:** `npm run db:push` (usa `drizzle-kit push`)

### Script de Migração de Dados
O arquivo `migration-script.sql` contém INSERTs para migrar dados existentes:
- Accounts (Contas/Gabinetes)
- Users (Usuários com senhas bcrypt)
- Contacts (Contatos CRM)
- Demands (Demandas)
- Events (Agenda)
- Political Alliances
- Leads
- Marketing Campaigns
- AI Configurations

**Sequência para migrar o banco no servidor novo:**
```bash
# 1. Criar o banco
sudo -u postgres psql -c "CREATE DATABASE politicall;"
sudo -u postgres psql -c "CREATE USER auth_bd WITH PASSWORD '4uth@1307BD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE politicall TO auth_bd;"

# 2. Aplicar o schema (de dentro do container ou com npx)
DATABASE_URL="postgresql://auth_bd:4uth@1307BD@localhost:5432/politicall" npx drizzle-kit push

# 3. Rodar o script de migração de dados
psql -U auth_bd -d politicall -f migration-script.sql
```

---

## 6. VARIÁVEIS DE AMBIENTE / SECRETS

### Variáveis necessárias no servidor:

| Variável | Valor / Descrição |
|----------|-------------------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `DATABASE_URL` | `postgresql://auth_bd:4uth@1307BD@172.17.0.1:5432/politicall` |
| `SESSION_SECRET` | `2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=` (usado como chave JWT) |
| `OPENAI_API_KEY` | Chave da API OpenAI (configurar manualmente) |
| `SYNC_API_KEY` | Chave de API para sincronização externa (se usar) |

### Variáveis que existem apenas no Replit (NÃO precisam no servidor):
- `REPLIT_DOMAINS` - domínios do Replit
- `REPLIT_DEV_DOMAIN` - domínio de desenvolvimento do Replit
- `REPL_ID` - ID do Repl
- `PGDATABASE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` - usados pelo Neon, no servidor a `DATABASE_URL` já é suficiente

---

## 7. AUTENTICAÇÃO

### Como funciona
- **Método:** JWT (JSON Web Token)
- **Secret:** Usa a variável `SESSION_SECRET` como chave de assinatura
- **Expiração:** 30 dias
- **Hash de senhas:** bcrypt com salt rounds = 10
- **Roles:** `admin`, `coordenador`, `assessor`, `voluntario`

### Login principal (admin)
- **Email:** `adm@politicall.com.br`
- **Senha:** A senha está em hash bcrypt no banco. A senha original que foi definida durante a criação do sistema. Se não lembrar, pode ser redefinida diretamente no banco com:

```sql
-- Gerar novo hash bcrypt para "NovaSenha123" e atualizar
UPDATE users SET password = '$2b$10$<novo_hash>' WHERE email = 'adm@politicall.com.br';
```

Para gerar o hash, pode usar:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('SuaSenhaAqui', 10).then(h => console.log(h));"
```

---

## 8. SCRIPTS NPM

```json
{
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

---

## 9. ESTRUTURA DE PASTAS PRINCIPAL

```
/
├── client/                  # Frontend React
│   ├── src/
│   │   ├── App.tsx         # Rotas principais
│   │   ├── main.tsx        # Entry point
│   │   ├── index.css       # Estilos globais
│   │   └── pages/          # Páginas da aplicação
│   ├── public/
│   │   └── favicon.png
│   └── index.html
├── server/                  # Backend Express
│   ├── index.ts            # Entry point do servidor
│   ├── routes.ts           # Todas as rotas da API
│   ├── storage.ts          # Interface de armazenamento (CRUD)
│   ├── db.ts               # Conexão com banco (Neon ou PG)
│   ├── auth.ts             # Middleware JWT
│   ├── auth-api.ts         # Rotas de autenticação
│   ├── authorization.ts    # RBAC e permissões
│   ├── openai.ts           # Integração com OpenAI
│   ├── crypto.ts           # Utilitários de criptografia
│   ├── vite.ts             # Config Vite para dev/prod
│   ├── fonts/              # Fontes para PDFs
│   ├── services/
│   │   └── systemSync.ts   # Sincronização com sistemas externos
│   └── utils/
│       └── gender-detector.ts
├── shared/                  # Código compartilhado
│   ├── schema.ts           # Schema do banco (Drizzle)
│   ├── text-normalization.ts
│   └── brazilian-locations.ts
├── migrations/              # Migrações do Drizzle
├── uploads/                 # Uploads de usuários (avatars, etc)
├── attached_assets/         # Assets anexados
├── .github/workflows/       # GitHub Actions CI/CD
│   └── build.yml
├── Dockerfile               # Build Docker multi-stage
├── docker-compose.yml       # Composição para servidor
├── .dockerignore
├── drizzle.config.ts
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── migration-script.sql     # Script de migração de dados
```

---

## 10. FLUXO COMPLETO DE DEPLOY (PASSO A PASSO)

### A. No Replit (código fonte)
1. Faz alterações no código
2. O Replit faz commit e push automático para `origin/main`
3. GitHub Actions é disparado automaticamente

### B. No GitHub Actions (CI/CD)
1. Type Check → verifica TypeScript
2. Build → compila frontend e backend
3. Security Audit → verifica vulnerabilidades npm
4. Docker Build → cria imagem e publica no GHCR como `ghcr.io/devs-wescctech/app-politicall:latest`
5. Security Scan → escaneia imagem com Trivy

### C. No Servidor (deploy)
1. Conectar via SSH no servidor
2. Ir até a pasta do projeto
3. Executar:
```bash
docker-compose pull
docker-compose up -d
```
4. Verificar health:
```bash
docker ps
curl http://localhost:5000/api/health
```

---

## 11. PARA REPLICAR EM OUTRO PROJETO (NOVO SISTEMA)

### Passo 1: Criar repositório no GitHub
```bash
# Criar repo no GitHub (via web ou CLI)
gh repo create Devs-Wescctech/novo-projeto --private
```

### Passo 2: Conectar Replit ao GitHub
```bash
# No terminal do Replit, configurar o remote
git remote add origin https://<SEU_PAT>@github.com/Devs-Wescctech/novo-projeto.git
git branch -M main
git push -u origin main
```

### Passo 3: Copiar arquivos de infraestrutura
Copiar do Politicall para o novo projeto:
- `Dockerfile` (ajustar nome se necessário)
- `docker-compose.yml` (ajustar nome do container, DATABASE_URL, etc.)
- `.dockerignore`
- `.github/workflows/build.yml` (não precisa alterar, usa variáveis dinâmicas)

### Passo 4: Configurar banco no servidor
```bash
# Criar banco e usuário
sudo -u postgres psql
CREATE DATABASE nome_do_banco;
CREATE USER usuario WITH PASSWORD 'senha';
GRANT ALL PRIVILEGES ON DATABASE nome_do_banco TO usuario;
\q

# Aplicar schema
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco" npx drizzle-kit push
```

### Passo 5: Ajustar docker-compose.yml
```yaml
services:
  app:
    image: ghcr.io/devs-wescctech/novo-projeto:latest
    container_name: app-novo-projeto
    environment:
      - DATABASE_URL=postgresql://usuario:senha@172.17.0.1:5432/nome_do_banco
      - SESSION_SECRET=<gerar_novo_secret>
      # ... demais variáveis
```

### Passo 6: Deploy
```bash
# Login no GHCR
echo "<PAT>" | docker login ghcr.io -u <usuario> --password-stdin

# Subir
docker-compose pull && docker-compose up -d
```

---

## 12. INTEGRAÇÕES EXTERNAS CONFIGURADAS

| Serviço | Como foi integrado |
|---------|-------------------|
| **OpenAI** | Via pacote `openai` npm, chave na variável `OPENAI_API_KEY` |
| **Facebook/Instagram** | Webhooks para atendimento IA (configurados via API do Meta) |
| **GitHub** | PAT para push/pull + GitHub Actions para CI/CD |
| **GHCR** | Registro de imagens Docker (autenticação via GITHUB_TOKEN) |
| **Neon Database** | Driver serverless no Replit, PG padrão no servidor |

---

## 13. DICAS E OBSERVAÇÕES

1. **Token do GitHub (PAT):** O token atual embutido na URL do remote pode expirar. Se isso acontecer, gere um novo PAT no GitHub e atualize:
   ```bash
   git remote set-url origin https://<NOVO_TOKEN>@github.com/Devs-Wescctech/app-politicall.git
   ```

2. **Uploads:** A pasta `uploads/` é montada como volume Docker, então os arquivos persistem fora do container. Lembre de fazer backup.

3. **Health Check:** O endpoint `/api/health` é usado pelo Docker para monitorar se a aplicação está respondendo.

4. **Memória:** O container está limitado a 1GB de RAM com 2GB de swap. Ajuste se necessário.

5. **API Keys de IA:** Por segurança, as chaves da OpenAI NÃO estão no script de migração SQL. Devem ser reconfiguradas manualmente após a migração.

6. **SSL:** No container Docker, o SSL está desabilitado na conexão com o banco (`ssl: false`). Se usar banco externo com SSL, ajustar em `server/db.ts`.

---

*Documento gerado em: 08/02/2026*
*Projeto: Politicall - www.politicall.com.br*
*Desenvolvedor: David Flores Andrade*

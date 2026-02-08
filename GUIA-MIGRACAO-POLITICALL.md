# DOCUMENTAÇÃO COMPLETA - COMO FIZEMOS A MIGRAÇÃO DO POLITICALL
## Todas as informações reais do projeto

---

## 1. GITHUB - REPOSITÓRIO E ACESSO

- **Repositório:** https://github.com/Devs-Wescctech/app-politicall
- **Branch:** main
- **Organização GitHub:** Devs-Wescctech
- **Token de acesso (PAT):** `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`
- **Escopos do token:** repo, write:packages, read:packages

### Como conectamos o Replit ao GitHub
No terminal do Replit rodamos:
```bash
git remote set-url origin https://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@github.com/Devs-Wescctech/app-politicall.git
git branch -M main
git push -u origin main
```

A partir disso, todo commit feito no Replit é enviado automaticamente para o GitHub.

---

## 2. IMAGEM DOCKER - ONDE FICA

- **Registro:** GitHub Container Registry (GHCR)
- **Endereço da imagem:** `ghcr.io/devs-wescctech/app-politicall:latest`
- **Login no GHCR (no servidor):**
```bash
echo "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" | docker login ghcr.io -u Devs-Wescctech --password-stdin
```

---

## 3. CI/CD - GITHUB ACTIONS

Arquivo: `.github/workflows/build.yml`

O que roda automaticamente em cada push na main:
1. **Type Check** - verifica erros de TypeScript
2. **Build** - compila frontend (Vite) e backend (esbuild)
3. **Security Audit** - auditoria de pacotes npm
4. **Docker Build & Push** - constrói a imagem e publica no GHCR
5. **Security Scan** - escaneia a imagem com Trivy

A autenticação no GHCR é pelo `GITHUB_TOKEN` (secret automático do GitHub Actions, não precisa configurar nada).

---

## 4. BANCO DE DADOS

### No Replit (desenvolvimento)
- **Tipo:** Neon PostgreSQL (serverless)
- **Driver:** `@neondatabase/serverless` com WebSocket
- A URL de conexão é provida automaticamente pelo Replit na variável `DATABASE_URL`

### No Servidor (produção)
- **Tipo:** PostgreSQL padrão instalado direto no servidor
- **Host:** `172.17.0.1` (IP do host Docker - assim o container acessa o banco no servidor)
- **Porta:** `5432`
- **Nome do banco:** `politicall`
- **Usuário:** `auth_bd`
- **Senha:** `4uth@1307BD`
- **DATABASE_URL completa:** `postgresql://auth_bd:4uth@1307BD@172.17.0.1:5432/politicall`

### Como criamos o banco no servidor
```bash
sudo -u postgres psql
CREATE DATABASE politicall;
CREATE USER auth_bd WITH PASSWORD '4uth@1307BD';
GRANT ALL PRIVILEGES ON DATABASE politicall TO auth_bd;
\c politicall
GRANT ALL ON SCHEMA public TO auth_bd;
\q
```

### Como aplicamos o schema das tabelas
```bash
DATABASE_URL="postgresql://auth_bd:4uth@1307BD@localhost:5432/politicall" npx drizzle-kit push
```

### Como migramos os dados
Criamos o arquivo `migration-script.sql` com todos os INSERTs dos dados existentes e rodamos:
```bash
psql -U auth_bd -d politicall -f migration-script.sql
```

### Como o código detecta qual banco usar (server/db.ts)
- Se a `DATABASE_URL` contém "neon.tech" ou "neon-" → usa driver Neon (Replit)
- Caso contrário → usa driver `pg` padrão (servidor)

Isso faz o mesmo código rodar nos dois ambientes sem alteração.

---

## 5. DOCKER - O QUE TEMOS CONFIGURADO

### Dockerfile
- Build em 2 estágios (builder + production)
- Base: `node:20-slim`
- Instala python3, make, g++ para compilar módulos nativos (bcrypt)
- Cria usuário não-root `nodejs` por segurança
- Porta: `5000`
- Health check: `GET http://localhost:5000/api/health`
- Comando final: `node dist/index.js`

### docker-compose.yml (que está no servidor)
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

networks:
  default:
    driver: bridge
```

### Limites de recursos configurados
- **Memória RAM:** 1 GB
- **Swap:** 2 GB
- **Shared Memory:** 256 MB
- **File descriptors:** 65536

---

## 6. VARIÁVEIS DE AMBIENTE / SECRETS

### Variáveis que estão no docker-compose (servidor)
| Variável | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `DATABASE_URL` | `postgresql://auth_bd:4uth@1307BD@172.17.0.1:5432/politicall` |
| `SESSION_SECRET` | `2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=` |

### Variáveis que estão no Replit (secrets)
| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Conexão com Neon PostgreSQL (provido pelo Replit) |
| `SESSION_SECRET` | Chave para assinar tokens JWT |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Chave da OpenAI (provido pela integração do Replit) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | URL base da OpenAI (provido pela integração do Replit) |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Token do GitHub para push |
| `SYNC_API_KEY` | Chave de API para sincronização externa |
| `PGDATABASE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | Conexão individual Neon (automático do Replit) |
| `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `REPL_ID` | Variáveis internas do Replit (não precisam no servidor) |

---

## 7. AUTENTICAÇÃO DO SISTEMA

- **Método:** JWT (JSON Web Token)
- **Chave de assinatura:** usa a variável `SESSION_SECRET`
- **Expiração do token:** 30 dias
- **Hash de senhas:** bcrypt com 10 rounds
- **Roles existentes:** admin, coordenador, assessor, voluntario

### Como resetar senha de um usuário
```bash
# Gerar hash bcrypt
node -e "const b=require('bcrypt');b.hash('NovaSenha123',10).then(h=>console.log(h));"

# Atualizar no banco
psql -U auth_bd -d politicall -c "UPDATE users SET password = '\$2b\$10\$HASH_GERADO' WHERE email = 'email@do.usuario';"
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

## 9. FLUXO DE DEPLOY - COMO FUNCIONA HOJE

```
REPLIT (código) → push automático → GITHUB (repositório)
                                          ↓
                                    GITHUB ACTIONS
                                    (compila + Docker)
                                          ↓
                                    GHCR (imagem Docker)
                                    ghcr.io/devs-wescctech/app-politicall:latest
                                          ↓
                                    SERVIDOR (docker pull + up)
                                    container: app-politicall
                                    porta: 5000
                                    banco: politicall (PostgreSQL local)
```

### Para atualizar no servidor após um commit
```bash
cd /opt/politicall   # ou onde estiver o docker-compose.yml
docker-compose pull
docker-compose up -d
```

---

## 10. VOLUMES E PERSISTÊNCIA

- A pasta `uploads/` é montada como volume Docker (`./uploads:/app/uploads`)
- Dentro dela ficam: avatars, backgrounds, arquivos temporários
- Os dados persistem fora do container (não se perdem ao atualizar)

---

## 11. INTEGRAÇÕES EXTERNAS

| Serviço | Como está integrado |
|---------|-------------------|
| **OpenAI** | Pacote `openai` npm, chave via secret `AI_INTEGRATIONS_OPENAI_API_KEY` no Replit |
| **Facebook/Instagram** | Webhooks para atendimento IA automático via API do Meta |
| **GitHub** | PAT `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` para push + GHCR |
| **Neon Database** | Driver serverless no Replit (automático) |
| **PostgreSQL** | Driver `pg` no servidor (via DATABASE_URL) |

---

## 12. ARQUIVOS DE INFRAESTRUTURA DO PROJETO

Estes são os arquivos que precisam existir no repositório para o CI/CD e Docker funcionarem:

| Arquivo | Função |
|---------|--------|
| `Dockerfile` | Como construir a imagem Docker |
| `docker-compose.yml` | Como rodar no servidor |
| `.dockerignore` | Quais arquivos ignorar no build Docker |
| `.github/workflows/build.yml` | Pipeline CI/CD do GitHub Actions |
| `drizzle.config.ts` | Configuração do ORM / migrações |
| `shared/schema.ts` | Schema de todas as tabelas do banco |
| `server/db.ts` | Conexão com banco (detecção Neon vs PG) |
| `migration-script.sql` | Script com dados para migrar |

---

*Documento com todas as informações reais do projeto Politicall - como foi feito e o que temos configurado hoje.*

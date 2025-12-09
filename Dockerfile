# ============================================================================
# POLITICALL - Dockerfile para Produção
# ============================================================================
# Desenvolvido por: David Flores Andrade
# Website: www.politicall.com.br
# ============================================================================

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependências de build para módulos nativos (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar todas as dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação (frontend + backend)
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=5000

# Instalar wget para health check e dependências de runtime
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Copiar package.json para produção
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar dist completo (inclui index.js e public/)
COPY --from=builder /app/dist ./dist

# Copiar assets estáticos se existirem
COPY --from=builder /app/attached_assets ./attached_assets

# Criar usuário não-root para segurança
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs politicall

# Mudar ownership dos arquivos
RUN chown -R politicall:nodejs /app

# Usar usuário não-root
USER politicall

# Expor porta
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Comando de inicialização
CMD ["node", "dist/index.js"]

# ============================================================================
# POLITICALL - Dockerfile para Produção
# ============================================================================
# Desenvolvido por: David Flores Andrade
# Website: www.politicall.com.br
# ============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências de build para módulos nativos (bcrypt)
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar todas as dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação (frontend + backend)
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Instalar dependências de runtime para módulos nativos
RUN apk add --no-cache python3 make g++

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=5000

# Copiar package.json para produção
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar dist completo (inclui index.js e public/)
COPY --from=builder /app/dist ./dist

# Copiar assets estáticos se existirem
COPY --from=builder /app/attached_assets ./attached_assets

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S politicall -u 1001

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

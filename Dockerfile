# Build stage
FROM node:24.18.0-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:24.18.0-bookworm-slim AS production

WORKDIR /app

# Install the health-check client and init process without recommended packages.
RUN apt-get update && apt-get install -y --no-install-recommends wget tini && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin nodejs

# Install only dependencies required by the production bundle.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the built application, deterministic production migration inputs, and persistent bundled assets.
COPY --from=builder --chown=1001:1001 /app/dist ./dist
COPY --from=builder --chown=1001:1001 /app/migrations ./migrations
COPY --from=builder --chown=1001:1001 /app/scripts/full_schema.sql ./scripts/full_schema.sql
COPY --from=builder --chown=1001:1001 /app/attached_assets ./attached_assets

# Create runtime-writable upload directories with explicit ownership.
RUN mkdir -p uploads/avatars uploads/backgrounds uploads/petitions uploads/temp && \
    chown -R 1001:1001 /app/attached_assets /app/uploads

# Switch to non-root user
USER 1001:1001

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:5000/api/health || exit 1

# Start the application
ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "node dist/migrate-production.js && exec node dist/index.js"]
